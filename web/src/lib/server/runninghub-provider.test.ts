import { describe, expect, it, vi } from "vitest";

import { fetchRunningHubWorkflowJson, queryRunningHubTask, submitRunningHubTask, uploadRunningHubMedia } from "./runninghub-provider";

const config = {
    protocol: "runninghub" as const,
    createPath: "/openapi/v2/task/create",
    queryPath: "/openapi/v2/task/status/:task_id",
    taskIdField: "data.taskId",
    resultField: "data.output.download_url",
    statusField: "data.status",
};

describe("RunningHub provider", () => {
    it("fetches workflow JSON through the official endpoint with server-side API key injection", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/api/openapi/getJsonApiFormat");
            expect(init?.method).toBe("POST");
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
            expect(JSON.parse(String(init?.body))).toEqual({ workflowId: "2087498214948823042", apiKey: "secret" });
            return Response.json({ code: 0, data: { nodes: [] } });
        });
        await expect(fetchRunningHubWorkflowJson({ baseUrl: "https://runninghub.example", apiKey: "secret", workflowId: "2087498214948823042", fetchImpl })).resolves.toEqual({ code: 0, data: { nodes: [] } });
    });

    it("sanitizes workflow JSON authentication and business failures", async () => {
        const unauthorized = vi.fn(async () => new Response(JSON.stringify({ message: "invalid apiKey secret" }), { status: 401, headers: { "content-type": "application/json" } }));
        await expect(fetchRunningHubWorkflowJson({ baseUrl: "https://runninghub.example", apiKey: "secret", workflowId: "wf", fetchImpl: unauthorized })).rejects.toThrow("invalid apiKey [redacted]");
        const business = vi.fn(async () => Response.json({ code: 403, message: "workflow forbidden" }));
        await expect(fetchRunningHubWorkflowJson({ baseUrl: "https://runninghub.example", apiKey: "secret", workflowId: "wf", fetchImpl: business })).rejects.toThrow("workflow forbidden");
    });

    it("adds the API key to the documented task create body", async () => {
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(JSON.parse(String(init?.body))).toMatchObject({ apiKey: "secret", workflowId: "workflow-one" });
            return Response.json({ code: 0, data: { taskId: "task-one" } });
        });

        await expect(
            submitRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: { ...config, createPath: "/task/openapi/create" },
                payload: { workflowId: "workflow-one", nodeInfoList: [] },
                fetchImpl,
            }),
        ).resolves.toMatchObject({ taskId: "task-one" });
    });

    it("uses bearer auth and configured base/create path without guessing", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/task/create");
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
            return Response.json({ data: { taskId: "task-one", status: "queued" } });
        });

        await expect(submitRunningHubTask({ baseUrl: "https://runninghub.example/", apiKey: "secret", config, payload: { node: "workflow" }, fetchImpl })).resolves.toMatchObject({ taskId: "task-one" });
    });

    it("requires configured create/query paths and response fields", async () => {
        const fetchImpl = vi.fn();
        await expect(submitRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, createPath: "" }, payload: {}, fetchImpl })).rejects.toThrow("createPath");
        await expect(queryRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, queryPath: "" }, taskId: "task-one", fetchImpl })).rejects.toThrow("queryPath");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("reads only configured status/result fields", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ data: { status: "success", output: { download_url: "https://cdn.example/result.mp4" }, result: "wrong" } }));

        await expect(queryRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config, taskId: "task one", fetchImpl })).resolves.toEqual({ status: "success", resultUrl: "https://cdn.example/result.mp4", raw: expect.any(Object) });
    });

    it("uses the official POST query contract without appending the task id to the URL", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/query");
            expect(init?.method).toBe("POST");
            expect(JSON.parse(String(init?.body))).toEqual({ taskId: "task-one" });
            return Response.json({ status: "SUCCESS", results: [{ url: "https://cdn.example/result.png", outputType: "png" }] });
        });

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: { ...config, queryPath: "/openapi/v2/query", statusField: "status", resultField: "results" },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({ status: "SUCCESS", resultUrl: "https://cdn.example/result.png" });
    });

    it("keeps text results out of resultUrl and preserves multiple structured outputs", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ data: { status: "success", result: { text: "hello", images: ["https://cdn.example/a.png", "https://cdn.example/b.png"] } } }));

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: {
                    ...config,
                    resultField: "data.result",
                    outputMappings: [
                        { key: "text", label: "文本", assetType: "TEXT", required: true },
                        { key: "images", label: "图片", assetType: "IMAGE", required: false },
                    ],
                },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({ status: "success", resultText: "hello", resultUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"], outputs: expect.any(Array) });
    });

    it("preserves a plain text result when no output mappings are configured", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ data: { status: "success", result: "hello" } }));
        await expect(queryRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, resultField: "data.result" }, taskId: "task-one", fetchImpl })).resolves.toMatchObject({ status: "success", resultText: "hello" });
    });

    it("preserves an unmapped structured result for the admin test contract", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ data: { status: "success", result: { text: "hello", score: 0.9 } } }));
        await expect(queryRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, resultField: "data.result" }, taskId: "task-one", fetchImpl })).resolves.toMatchObject({
            outputs: [{ values: [{ text: "hello", score: 0.9 }] }],
        });
    });

    it("resolves output mappings by node id when the provider returns node keyed data", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ data: { status: "success", result: { nodes: { "90": { image: "https://cdn.example/node.png" } } } } }));
        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: { ...config, resultField: "data.result", outputMappings: [{ key: "image", label: "图片", nodeId: "90", assetType: "IMAGE", required: true }] },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({ resultUrl: "https://cdn.example/node.png", outputs: [{ values: ["https://cdn.example/node.png"] }] });
    });

    it("uses the configured timeout for provider requests", async () => {
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(init?.signal).toBeInstanceOf(AbortSignal);
            return Response.json({ data: { status: "queued", taskId: "task-one" } });
        });

        await submitRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, timeoutSeconds: 5 }, payload: {}, fetchImpl });
    });

    it("uploads media through the documented binary endpoint and returns short-lived download_url", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/media/upload/binary");
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
            expect(init?.body).toBeInstanceOf(FormData);
            return Response.json({ data: { download_url: "https://cdn.example/uploaded.png" } });
        });

        await expect(uploadRunningHubMedia({ baseUrl: "https://runninghub.example", apiKey: "secret", file: new Blob(["image"], { type: "image/png" }), fileName: "reference.png", fetchImpl })).resolves.toBe("https://cdn.example/uploaded.png");
    });
});
