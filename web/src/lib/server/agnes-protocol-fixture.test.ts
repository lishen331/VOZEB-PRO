import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

// Local TCP fixture only: do not weaken production outbound protection.
vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: (url: string, init: RequestInit) => fetch(url, init) }));

import { createUpstream } from "@/app/api/video-generation-tasks/video-generation-route";
import { runCustomImageTask } from "@/app/api/image-tasks/image-task-custom";
import { emptyAdvancedConfig, protocolModelConfig } from "@/lib/channel-protocol-registry";
import { buildAgnesVideoRequest, agnesVideoQueryPath } from "./agnes-video-provider";
import type { ImageTask } from "./image-task-store";
import type { VideoTask } from "./video-task-store";
import { queryVideoTaskUpstream } from "./video-task-runtime";

describe("Agnes actual HTTP request contract", () => {
    let close: (() => Promise<void>) | undefined;
    afterEach(async () => {
        await close?.();
        close = undefined;
        vi.restoreAllMocks();
    });

    async function fixture() {
        const requests: Array<{ method?: string; url?: string; body: string; contentType?: string }> = [];
        const server = createServer(async (request, response) => {
            let body = "";
            for await (const chunk of request) body += chunk;
            requests.push({ method: request.method, url: request.url, body, contentType: request.headers["content-type"] });
            response.setHeader("content-type", "application/json");
            if (request.url?.includes("images/generations")) response.end(JSON.stringify({ data: [{ url: "https://fixture.invalid/image.png" }] }));
            else if (request.url?.includes("agnesapi")) response.end(JSON.stringify({ status: "completed", progress: 100, internal_status: "pending", internal_progress: 0, url: "https://fixture.invalid/video.mp4" }));
            else response.end(JSON.stringify({ id: "queue-job", task_id: "queue-task", video_id: "retrieval-video", status: "queued" }));
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Fixture port missing");
        close = async () => {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        };
        return { origin: `http://127.0.0.1:${address.port}`, requests };
    }

    it("posts image edit arrays to generations as JSON, keeping prompt/ratio/resolution without OpenAI quality", async () => {
        const local = await fixture();
        const task = {
            id: "fixture-image",
            userId: "fixture-user",
            source: "canvas",
            kind: "edit",
            prompt: "原始提示词",
            upstreamPrompt: "原始提示词",
            references: [{ dataUrl: "data:image/png;base64,aGVsbG8=" }],
            config: {
                baseUrl: `${local.origin}/v1`,
                apiKey: "fixture-key",
                model: "agnes-image-2.5-flash",
                apiFormat: "openai",
                quality: "auto",
                resolution: "2k",
                size: "9:16",
                advancedConfig: { ...emptyAdvancedConfig(), ...protocolModelConfig("agnes", "image") },
            },
        } as unknown as ImageTask;
        await expect(runCustomImageTask(task, local.origin, local.origin, "", true)).resolves.toMatchObject({ remoteUrl: "https://fixture.invalid/image.png" });
        expect(local.requests).toHaveLength(1);
        expect(local.requests[0]).toMatchObject({ method: "POST", url: "/v1/images/generations" });
        expect(local.requests[0].contentType).toContain("application/json");
        expect(JSON.parse(local.requests[0].body)).toEqual({ model: task.config.model, prompt: task.prompt, size: "2K", ratio: "9:16", image: [task.references[0].dataUrl] });
    });

    it("uses explicit Agnes video mode and video_id for querying, including top-level completed URL", async () => {
        const local = await fixture();
        const config = {
            apiSource: "system" as const,
            channelId: "fixture",
            logicalModel: "fixture-video",
            apiKey: "system" as const,
            baseUrl: local.origin,
            apiFormat: "openai" as const,
            model: "agnes-video-2.5-flash",
            advancedConfig: { ...emptyAdvancedConfig(), ...protocolModelConfig("agnes", "video", "agnes-video-2.5-flash") },
        };
        const raw = { videoSeconds: "5", vquality: "720", size: "1:1" };
        const upstream = await createUpstream("fixture-user", "", "", config, "原始视频提示词", raw, [], { imageQuality: {}, videoQuality: {}, videoSeconds: {} }, "fixture-request");
        expect(upstream).toMatchObject({ id: "retrieval-video", queryPath: agnesVideoQueryPath(config.model) });
        expect(JSON.parse(local.requests[0].body)).toEqual(buildAgnesVideoRequest({ model: config.model, prompt: "原始视频提示词", seconds: "5", resolution: "720", aspectRatio: "1:1" }));
        expect(local.requests[0].url).toBe("/videos");
        const query = await queryVideoTaskUpstream({ id: "fixture-task", userId: "fixture-user", config, upstream, attempts: [] } as unknown as VideoTask, "", "");
        expect(query).toEqual({ state: "result_ready", status: "completed", resultUrl: "https://fixture.invalid/video.mp4" });
        expect(local.requests[1].url).toBe("/agnesapi?video_id=retrieval-video&model_name=agnes-video-2.5-flash");
        expect(local.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    });
});
