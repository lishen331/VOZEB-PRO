import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchInternalApi: vi.fn() }));

vi.mock("@/lib/server/internal-origin", () => ({
    fetchInternalApi: mocks.fetchInternalApi,
    isInternalApiBaseUrl: (baseUrl: string) => baseUrl.startsWith("/"),
}));

import { protocolModelConfig } from "@/lib/channel-protocol-registry";
import type { ImageTask } from "@/lib/server/image-task-store";

import { buildModelBayImageTaskRequest, buildTuziImageTaskFormData, buildTuziImageTaskJsonRequest } from "./image-task-async-request";
import { pollCustomImageTask, runCustomImageTask } from "./image-task-custom";
import { sanitizeAdvancedConfig } from "./image-task-support";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function asyncTask(protocol: "modelbay-image-task" | "tuzi-image-task", model: string, references: ImageTask["references"] = []) {
    const operation = protocolModelConfig(protocol, "image", model)!;
    return {
        id: `${protocol}-task`,
        userId: "user",
        kind: references.length ? "edit" : "generation",
        prompt: "a green leaf",
        references,
        config: { baseUrl: "/api/ai/system/channel-one", apiKey: "system", apiFormat: "openai", model, quality: "1k", size: "1024x1024", advancedConfig: sanitizeAdvancedConfig({ ...operation, protocol } as never) },
    } as unknown as ImageTask;
}

describe("async image request builders", () => {
    it("nests ModelBay parameters under input and maps platform quality aliases", () => {
        expect(buildModelBayImageTaskRequest({ model: "gpt-image-2-image-to-image", prompt: "p", quality: "2k", aspectRatio: "3:2", imageUrls: ["https://cdn.example.com/a.png"], outputBackground: "transparent" })).toEqual({
            model: "gpt-image-2-image-to-image",
            input: { prompt: "p", number_of_images: 1, quality: "medium", aspect_ratio: "3:2", input_images: ["https://cdn.example.com/a.png"] },
        });
        expect(buildModelBayImageTaskRequest({ model: "m", prompt: "p", quality: "max", imageUrls: [] }).input).toEqual({ prompt: "p", number_of_images: 1 });
    });

    it("sends Tuzi JSON with n and multipart without n", () => {
        expect(buildTuziImageTaskJsonRequest({ model: "gpt-image-2.5-sunburst", prompt: "p", quality: "xhigh", size: "1024x1024" })).toEqual({ model: "gpt-image-2.5-sunburst", prompt: "p", n: 1, size: "1024x1024", quality: "xhigh" });
        const form = buildTuziImageTaskFormData({ model: "gpt-image-2", prompt: "p", quality: "auto", size: "1024x1024", files: [new File(["a"], "a.png"), new File(["b"], "b.png")] });
        expect(form.getAll("input_reference")).toHaveLength(2);
        expect(form.has("n")).toBe(false);
        expect(form.get("quality")).toBe("low");
    });

    it("defaults Tuzi quality to low only when the canvas did not pick one", () => {
        for (const quality of [undefined, "", "auto"]) {
            expect(buildTuziImageTaskJsonRequest({ model: "m", prompt: "p", quality }).quality).toBe("low");
            expect(buildTuziImageTaskFormData({ model: "m", prompt: "p", quality, files: [] }).get("quality")).toBe("low");
        }
        expect(buildTuziImageTaskJsonRequest({ model: "m", prompt: "p", quality: "high" }).quality).toBe("high");
        expect(buildTuziImageTaskJsonRequest({ model: "m", prompt: "p", quality: "4k" }).quality).toBe("high");
        expect(buildTuziImageTaskFormData({ model: "m", prompt: "p", quality: "medium", files: [] }).get("quality")).toBe("medium");
    });
});

describe("async image task execution", () => {
    beforeEach(() => vi.clearAllMocks());

    it("submits ModelBay /image/submit and stops at the upstream task id", async () => {
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: "success", message: "", data: { task_id: "task_mb" } }));
        await expect(runCustomImageTask(asyncTask("modelbay-image-task", "gpt-image-2-text-to-image"), "http://localhost", "http://localhost", "", true)).resolves.toMatchObject({ pending: { id: "task_mb" } });
        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://localhost/api/ai/system/channel-one/image/submit");
        expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-image-2-text-to-image", input: { prompt: expect.stringContaining("a green leaf"), quality: "low", aspect_ratio: "1:1", number_of_images: 1 } });
    });

    it("polls ModelBay until SUCCESS and reads the single result_url", async () => {
        const task = asyncTask("modelbay-image-task", "gpt-image-2-text-to-image");
        const base = "http://localhost/api/ai/system/channel-one/image/submit";
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: "success", data: { task_id: "task_mb", status: "NOT_START", fail_reason: "" } }));
        await expect(pollCustomImageTask(task, "task_mb", base, base, "", true)).resolves.toMatchObject({ pending: { id: "task_mb" } });
        expect(mocks.fetchInternalApi.mock.calls[0]?.[0]).toBe("http://localhost/api/ai/system/channel-one/image/fetch/task_mb");

        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: "success", data: { task_id: "task_mb", status: "SUCCESS", fail_reason: "", result_url: "https://cn-cdn.example.com/artifacts/task_mb/0.png" } }));
        const result = await pollCustomImageTask(task, "task_mb", base, base, "", true);
        expect(result.results).toHaveLength(1);
        expect(result.remoteUrl).toBe("https://cn-cdn.example.com/artifacts/task_mb/0.png");
    });

    it("treats ModelBay FAILURE as terminal with the provider reason", async () => {
        const base = "http://localhost/api/ai/system/channel-one/image/submit";
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: "success", data: { task_id: "task_mb", status: "FAILURE", fail_reason: "content policy" } }));
        await expect(pollCustomImageTask(asyncTask("modelbay-image-task", "gpt-image-2-text-to-image"), "task_mb", base, base, "", true)).rejects.toThrow("content policy");
    });

    it("submits Tuzi references as repeated input_reference files and polls video_url", async () => {
        const task = asyncTask("tuzi-image-task", "gpt-image-2.5-sunburst", [
            { dataUrl: PNG, name: "one.png", type: "image/png" },
            { dataUrl: PNG, name: "two.png", type: "image/png" },
        ] as ImageTask["references"]);
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ id: "task_tz", task_id: "task_tz", object: "video", status: "queued" }));
        await expect(runCustomImageTask(task, "http://localhost", "http://localhost", "", true)).resolves.toMatchObject({ pending: { id: "task_tz" } });
        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://localhost/api/ai/system/channel-one/v1/videos");
        const form = init.body as FormData;
        expect(form.getAll("input_reference")).toHaveLength(2);
        expect(form.get("model")).toBe("gpt-image-2.5-sunburst");
        expect(new Headers(init.headers).get("content-type")).toBeNull();

        const base = "http://localhost/api/ai/system/channel-one/v1/videos";
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ id: "task_tz", status: "in_progress", progress: 30 }));
        await expect(pollCustomImageTask(task, "task_tz", base, base, "", true)).resolves.toMatchObject({ pending: { id: "task_tz" } });
        expect(mocks.fetchInternalApi.mock.calls[1]?.[0]).toBe("http://localhost/api/ai/system/channel-one/v1/videos/task_tz");

        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ id: "task_tz", status: "completed", video_url: "https://bucket.example.com/images/abc?X-Amz-Expires=86400" }));
        await expect(pollCustomImageTask(task, "task_tz", base, base, "", true)).resolves.toMatchObject({ remoteUrl: "https://bucket.example.com/images/abc?X-Amz-Expires=86400" });
    });
});
