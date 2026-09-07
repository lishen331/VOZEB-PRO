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

    it("queries official tasks with the API key and maps data.results by output node", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/query");
            expect(init?.method).toBe("POST");
            expect(JSON.parse(String(init?.body))).toEqual({ apiKey: "secret", taskId: "task-one" });
            return Response.json({
                code: 0,
                data: {
                    status: "SUCCESS",
                    results: [
                        { url: "https://cdn.example/image.png", fileUrl: "https://cdn.example/image.png", fileType: "IMAGE", nodeId: "77", taskCostTime: "3128" },
                        { url: "https://cdn.example/other.png", fileType: "IMAGE", nodeId: "78" },
                    ],
                },
            });
        });

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: {
                    ...config,
                    queryPath: "/openapi/v2/query",
                    statusField: "data.status",
                    resultField: "data.result",
                    outputMappings: [{ key: "image", label: "图片", nodeId: "77", assetType: "IMAGE", required: true, primary: true }],
                },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({
            status: "SUCCESS",
            resultUrl: "https://cdn.example/image.png",
            resultUrls: ["https://cdn.example/image.png"],
            outputs: [
                {
                    key: "image",
                    nodeId: "77",
                    values: [expect.objectContaining({ url: "https://cdn.example/image.png", fileUrl: "https://cdn.example/image.png", fileType: "IMAGE", nodeId: "77" })],
                },
            ],
        });
    });

    it("does not treat a nonzero official business response as a running task", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ code: 803, msg: "task not found", data: {} }));

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: { ...config, queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" },
                taskId: "task-one",
                fetchImpl,
            }),
        ).rejects.toThrow("task not found");
    });
    it("keeps an empty successful official result envelope queryable while the task is processing", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ code: 0, data: [] }));

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: { ...config, queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({ status: "RUNNING", querySummary: { status: "RUNNING", resultCount: 0, nodeIds: [] } });
    });
    it("accepts the unwrapped official query response used by the RunningHub demo", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                status: "SUCCESS",
                results: [{ url: "https://cdn.example/result.png", fileType: "IMAGE", nodeId: "77", taskCostTime: "43128" }],
            }),
        );

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: {
                    ...config,
                    queryPath: "/openapi/v2/query",
                    statusField: "data.status",
                    resultField: "data.result",
                    outputMappings: [{ key: "image", label: "图片", nodeId: "77", assetType: "IMAGE", required: true, primary: true }],
                },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({
            status: "SUCCESS",
            resultUrl: "https://cdn.example/result.png",
            resultUrls: ["https://cdn.example/result.png"],
            querySummary: { status: "SUCCESS", resultCount: 1, nodeIds: ["77"] },
        });
    });
    it("preserves the official failed status and a safe query summary", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                code: 0,
                data: { status: "FAILED", failedReason: "fixture task rejected", results: [] },
            }),
        );

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: { ...config, queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({
            status: "FAILED",
            querySummary: { status: "FAILED", resultCount: 0, nodeIds: [], upstreamError: "fixture task rejected" },
        });
    });

    it("redacts the RunningHub API key from the official query summary", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                code: 0,
                data: { status: "FAILED", failedReason: "Authorization: Bearer secret; apiKey=secret", results: [] },
            }),
        );

        const result = await queryRunningHubTask({
            baseUrl: "https://runninghub.example",
            apiKey: "secret",
            config: { ...config, queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" },
            taskId: "task-one",
            fetchImpl,
        });

        expect(result.querySummary?.upstreamError).not.toContain("secret");
        expect(result.querySummary?.upstreamError).toContain("[REDACTED]");
    });

    it("preserves official text results for a configured text output node", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                code: 0,
                data: { status: "SUCCESS", results: [{ text: "生成完成", fileType: "TEXT", nodeId: "90" }] },
            }),
        );

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: {
                    ...config,
                    queryPath: "/openapi/v2/query",
                    statusField: "data.status",
                    resultField: "data.result",
                    outputMappings: [{ key: "text", label: "文本", nodeId: "90", assetType: "TEXT", required: true }],
                },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({
            status: "SUCCESS",
            resultText: "生成完成",
            outputs: [{ key: "text", nodeId: "90", values: ["生成完成"] }],
        });
    });

    it("does not use a result from another output node as the configured artifact", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                code: 0,
                data: { status: "SUCCESS", results: [{ fileUrl: "https://cdn.example/other.png", fileType: "IMAGE", nodeId: "78" }] },
            }),
        );

        await expect(
            queryRunningHubTask({
                baseUrl: "https://runninghub.example",
                apiKey: "secret",
                config: {
                    ...config,
                    queryPath: "/openapi/v2/query",
                    statusField: "data.status",
                    resultField: "data.result",
                    outputMappings: [{ key: "image", label: "图片", nodeId: "77", assetType: "IMAGE", required: true }],
                },
                taskId: "task-one",
                fetchImpl,
            }),
        ).resolves.toMatchObject({ status: "SUCCESS", resultUrls: [], querySummary: { status: "SUCCESS", resultCount: 1, nodeIds: ["78"] } });
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

    it("uploads media through the documented binary endpoint and returns the RunningHub fileName", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/media/upload/binary");
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
            expect(init?.body).toBeInstanceOf(FormData);
            return Response.json({ code: 0, data: { fileName: "api/2026/09/reference.png" } });
        });

        await expect(uploadRunningHubMedia({ baseUrl: "https://runninghub.example", apiKey: "secret", file: new Blob(["image"], { type: "image/png" }), fileName: "reference.png", fetchImpl })).resolves.toBe("api/2026/09/reference.png");
    });
});
