import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createProtocolFixtureServer } from "../../../../scripts/protocol-fixture-server.mjs";
import { createUpstream } from "./video-generation-route";
import { resolveModelAdvancedConfig } from "@/lib/server/generation-channel";
import { queryVideoTaskUpstream } from "@/lib/server/video-task-runtime";
import type { VideoTask } from "@/lib/server/video-task-store";
import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";

describe("video creation protocols over a live fixture", () => {
    let close: (() => Promise<void>) | undefined;

    afterEach(async () => {
        await close?.();
        close = undefined;
    });

    it("creates a New API Doubao Seedance task through the JSON task contract", async () => {
        const fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        const baseUrl = "http://127.0.0.1:" + address.port;
        close = () => new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));

        const config = {
            apiSource: "system" as const,
            baseUrl,
            apiKey: "system" as const,
            apiFormat: "openai" as const,
            model: "doubao-seedance-2-0",
            logicalModel: "video",
            channelId: "legacy-newapi-seedance",
            advancedConfig: {
                ...emptyAdvancedConfig(),
                protocol: "newapi" as const,
                modelCapabilities: { "doubao-seedance-2-0": "video" as const },
                modelConfigs: {
                    "doubao-seedance-2-0": {
                        capability: "video" as const,
                        protocol: "newapi" as const,
                        apiFormat: "openai" as const,
                        createPath: "/videos",
                        imageToVideoPath: "/videos",
                        queryPath: "/videos/:task_id",
                        requestTemplate: "multipart/form-data: model、prompt、seconds、size、input_reference",
                        resultField: "/videos/:task_id/content",
                        statusField: "status",
                        supportsReferenceImage: true,
                    },
                },
            },
        };

        const resolvedConfig = { ...config, advancedConfig: resolveModelAdvancedConfig(config.advancedConfig, config.model) };
        const upstream = await createUpstream(
            "user-live",
            "",
            "",
            resolvedConfig,
            "animate a blue logo",
            { videoSeconds: 6, size: "9:16", vquality: "720" },
            [{ type: "image", url: "https://cdn.example.com/reference.png" }],
            { imageQuality: {}, videoQuality: { "720": 1 }, videoSeconds: { "6": 1 } },
            "legacy-seedance-request",
        );

        expect(upstream).toMatchObject({ model: config.model, pollPath: "/video/generations" });
        expect(fixture.requests[0]).toMatchObject({ method: "POST", path: "/video/generations" });
        expect(fixture.requests[0]?.contentType).toContain("application/json");
        expect(JSON.parse(fixture.requests[0]?.body.toString("utf8") || "{}")).toMatchObject({
            model: config.model,
            prompt: "animate a blue logo",
            seconds: "6",
            images: ["https://cdn.example.com/reference.png"],
            metadata: { ratio: "9:16", resolution: "720p" },
        });
    });

    it("uses the selected preset endpoint once, preserves headers, and polls /result/:task_id", async () => {
        const fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        const baseUrl = "http://127.0.0.1:" + address.port;
        close = () => new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));

        const config = {
            apiSource: "system" as const,
            baseUrl,
            apiKey: "system" as const,
            apiFormat: "openai" as const,
            model: "sd_2.0_fast_discount_720p",
            logicalModel: "video",
            channelId: "global-video",
            advancedConfig: {
                ...emptyAdvancedConfig(),
                protocol: "globalaiopc" as const,
                globalAiOpcPreset: "video-seedance-discount" as const,
                createPath: "/seedance-discount/videos",
                queryPath: "/result/:task_id",
                supportsReferenceImage: true,
                supportsReferenceVideo: true,
                supportsReferenceAudio: true,
            },
        };

        const upstream = await createUpstream("user-live", "", "", config, "animate a blue logo", { videoSeconds: 5, size: "16:9", vquality: "720" }, [], { imageQuality: {}, videoQuality: { "720": 1 }, videoSeconds: { "5": 1 } }, "video-request-live");

        expect(upstream).toMatchObject({ model: config.model, pollPath: "/seedance-discount/videos" });
        expect(fixture.requests).toHaveLength(1);
        expect(fixture.requests[0]).toMatchObject({ method: "POST", path: "/seedance-discount/videos" });
        expect(fixture.requests[0]?.headers.authorization).toBeUndefined();
        expect(fixture.requests[0]?.headers["idempotency-key"]).toBe("video-request-live");
        expect(fixture.requests[0]?.headers["x-client-request-id"]).toBe("video-request-live");
        expect(JSON.parse(fixture.requests[0]?.body.toString("utf8") || "{}")).toMatchObject({ model: config.model, duration: 5, ratio: "16:9" });

        const task = { config, upstream, userId: "user-live" } as unknown as VideoTask;
        const result = await queryVideoTaskUpstream(task, "", "");
        expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        expect(fixture.requests.map((request) => request.path)).toEqual(["/seedance-discount/videos", "/result/" + upstream.id]);
    });

    it.each(["reference", "keyframes", "text", "no-task-id", "mixed", "pending"] as const)("submits blue-cloud %s with the stored legacy template and queries the original task", async (mode) => {
        const requests: Array<{ method?: string; path?: string; body: unknown }> = [];
        const server = createServer(async (request, response) => {
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
            requests.push({ method: request.method, path: request.url, body });
            response.setHeader("content-type", "application/json");
            if (request.url === "/aiservice/videos/tasks/submit") {
                response.end(JSON.stringify({ code: 1, msg: "ok", requestId: "not-the-task-id", result: mode === "no-task-id" ? { url: "https://fixture.invalid/not-a-result.mp4" } : { taskId: "original-task" } }));
            } else if (request.method === "POST" && request.url === "/aiservice/videos/tasks/detail" && body.taskId === "original-task") {
                const result = mode === "text" ? { status: "FAILED", errorMessage: "fixture terminal failure" } : { status: mode === "pending" ? "RUNNING" : "SUCCEEDED", result: { videoUrl: "https://fixture.invalid/result.mp4" } };
                response.end(JSON.stringify({ code: 1, msg: "ok", result }));
            } else {
                response.statusCode = 404;
                response.end(JSON.stringify({ code: 10007, msg: "wrong query" }));
            }
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        close = () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Fixture did not bind TCP");
        const config = {
            apiSource: "system" as const,
            apiFormat: "openai" as const,
            apiKey: "system" as const,
            baseUrl: `http://127.0.0.1:${address.port}`,
            model: "cdance2.0-0807",
            channelId: "bluecloud-fixture",
            advancedConfig: {
                ...emptyAdvancedConfig(),
                protocol: "custom" as const,
                createPath: "/aiservice/videos/tasks/submit",
                queryPath: "/aiservice/videos/tasks/detail",
                queryMethod: "POST" as const,
                queryBodyTemplate: '{"taskId":"{{taskId}}"}',
                taskIdField: "result.taskId",
                statusField: "result.status",
                resultField: "result.result.videoUrl",
                successCodes: ["1"],
                requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","duration":"{{duration}}","ratio":"{{ratio}}","resolution":"{{resolution}}"}',
            },
        };
        const submission = createUpstream(
            "fixture-user",
            "",
            "",
            config,
            "fixture prompt",
            { size: "1:1", videoSeconds: "5", vquality: "480", videoGenerateAudio: mode !== "text", videoWatermark: mode === "text" },
            mode === "reference"
                ? [
                      { type: "image", role: "reference", url: "https://fixture.invalid/ref.png" },
                      { type: "video", role: "reference", url: "https://fixture.invalid/ref.mp4" },
                      { type: "audio", role: "reference", url: "https://fixture.invalid/ref.mp3" },
                  ]
                : mode === "keyframes" || mode === "mixed"
                  ? [
                        { type: "image", role: "first_frame", url: "https://fixture.invalid/first.png" },
                        { type: "image", role: "last_frame", url: "https://fixture.invalid/last.png" },
                        ...(mode === "mixed" ? [{ type: "image" as const, role: "reference" as const, url: "https://fixture.invalid/ref.png" }] : []),
                    ]
                  : [],
            { imageQuality: {}, videoQuality: {}, videoSeconds: {} },
            "fixture-blue-cloud",
        );
        if (mode === "mixed") {
            await expect(submission).rejects.toThrow("不能同时使用参考素材");
            expect(requests).toHaveLength(0);
            return;
        }
        if (mode === "no-task-id") {
            await expect(submission).rejects.toMatchObject({ name: "VideoSubmissionUncertainError", message: "视频接口没有返回任务 ID" });
            expect(requests).toHaveLength(1);
            return;
        }
        const upstream = await submission;
        expect(upstream.id).toBe("original-task");
        expect(requests[0]).toEqual({
            method: "POST",
            path: "/aiservice/videos/tasks/submit",
            body: {
                model: config.model,
                prompt: "fixture prompt",
                duration: 5,
                ratio: "1:1",
                resolution: "480p",
                generateAudio: mode !== "text",
                watermark: mode === "text",
                ...(mode === "reference" ? { referenceImageUrls: ["https://fixture.invalid/ref.png"], referenceVideoUrls: ["https://fixture.invalid/ref.mp4"], referenceAudioUrls: ["https://fixture.invalid/ref.mp3"] } : {}),
                ...(mode === "keyframes" ? { firstFrameUrl: "https://fixture.invalid/first.png", lastFrameUrl: "https://fixture.invalid/last.png" } : {}),
            },
        });
        const result = await queryVideoTaskUpstream({ config, upstream, userId: "fixture-user" } as unknown as VideoTask, "", "");
        expect(requests.slice(1)).toEqual([{ method: "POST", path: "/aiservice/videos/tasks/detail", body: { taskId: "original-task" } }]);
        if (mode === "text") expect(result).toMatchObject({ state: "failed", error: "fixture terminal failure" });
        else if (mode === "pending") expect(result).toMatchObject({ state: "pending", status: "running" });
        else expect(result).toMatchObject({ state: "result_ready", resultUrl: "https://fixture.invalid/result.mp4" });
    });

    it("uses a custom video template and declared create/query/result fields", async () => {
        const fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        const baseUrl = "http://127.0.0.1:" + address.port;
        close = () => new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));
        const config = {
            apiSource: "system" as const,
            baseUrl,
            apiKey: "system" as const,
            apiFormat: "openai" as const,
            model: "custom-video-model",
            logicalModel: "video",
            channelId: "custom-video",
            advancedConfig: {
                ...emptyAdvancedConfig(),
                protocol: "custom" as const,
                createPath: "/custom/videos",
                queryPath: "/custom/results/:task_id",
                requestTemplate: '{"deployment":"{{model}}","input":"{{prompt}}","seconds":"{{duration}}","aspect":"{{ratio}}"}',
                resultField: "data.video_url",
                statusField: "data.status",
            },
        };

        const upstream = await createUpstream(
            "user-live",
            "",
            "",
            config,
            "animate a blue logo",
            { videoSeconds: 8, size: "9:16", vquality: "1080" },
            [],
            { imageQuality: {}, videoQuality: { "1080": 1 }, videoSeconds: { "8": 1 } },
            "custom-video-request-live",
        );

        expect(fixture.requests).toHaveLength(1);
        expect(fixture.requests[0]?.path).toBe("/custom/videos");
        expect(fixture.requests[0]?.headers["idempotency-key"]).toBe("custom-video-request-live");
        expect(JSON.parse(fixture.requests[0]?.body.toString("utf8") || "{}")).toEqual({ deployment: config.model, input: "animate a blue logo", seconds: 8, aspect: "9:16" });

        const result = await queryVideoTaskUpstream({ config, upstream, userId: "user-live" } as unknown as VideoTask, "", "");
        expect(result).toMatchObject({ state: "result_ready", status: "completed", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        expect(fixture.requests.map((request) => request.path)).toEqual(["/custom/videos", "/custom/results/" + upstream.id]);
    });

    it("uses the VOZEB recommended JSON contract and reads metadata.url", async () => {
        const fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        const baseUrl = "http://127.0.0.1:" + address.port;
        close = () => new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));
        const config = {
            apiSource: "system" as const,
            baseUrl,
            apiKey: "system" as const,
            apiFormat: "openai" as const,
            model: "Seedance 2.0-fast-720p",
            logicalModel: "video",
            channelId: "vozeb-video",
            advancedConfig: {
                ...emptyAdvancedConfig(),
                protocol: "vozeb-recommended" as const,
                createPath: "/v1/videos/generations",
                imageToVideoPath: "/v1/videos/generations",
                queryPath: "/v1/videos/generations/:task_id",
                requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}',
                resultField: "metadata.url",
                statusField: "status",
                durationRange: "5-15 秒",
                supportsReferenceImage: true,
                supportsReferenceVideo: true,
                supportsReferenceAudio: true,
            },
        };
        const referenceUrl = "https://cdn.example.com/reference.png";

        const upstream = await createUpstream(
            "user-live",
            "",
            "",
            config,
            "animate a blue logo",
            { videoSeconds: 5, size: "16:9", vquality: "720", videoGenerateAudio: true },
            [{ type: "image", url: referenceUrl }],
            { imageQuality: {}, videoQuality: { "720": 1 }, videoSeconds: { "5": 1 } },
            "vozeb-video-request-live",
        );

        expect(upstream).toMatchObject({ model: config.model, pollPath: "/v1/videos/generations" });
        expect(fixture.requests[0]).toMatchObject({ method: "POST", path: "/v1/videos/generations" });
        expect(fixture.requests[0]?.contentType).toContain("application/json");
        expect(JSON.parse(fixture.requests[0]?.body.toString("utf8") || "{}")).toEqual({
            model: config.model,
            prompt: "animate a blue logo",
            duration: 5,
            resolution: "720p",
            metadata: { resolution: "720p" },
            generate_audio: false,
            aspect_ratio: "16:9",
            images: [referenceUrl],
        });

        const result = await queryVideoTaskUpstream({ config, upstream, userId: "user-live" } as unknown as VideoTask, "", "");
        expect(result).toMatchObject({ state: "result_ready", status: "completed", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        expect(fixture.requests.map((request) => request.path)).toEqual(["/v1/videos/generations", "/v1/videos/generations/" + upstream.id]);
    });
});
