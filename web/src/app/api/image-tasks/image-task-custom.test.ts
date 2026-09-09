import { createServer } from "node:http";
import { once } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchInternalApi: vi.fn() }));

vi.mock("@/lib/server/internal-origin", () => ({
    fetchInternalApi: mocks.fetchInternalApi,
    isInternalApiBaseUrl: (baseUrl: string) => baseUrl.startsWith("/"),
}));

import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import type { ImageTask } from "@/lib/server/image-task-store";
import { readVerifiedSystemAiBusinessRequestId } from "@/lib/server/system-ai-billing";
import { runCustomImageTask, pollCustomImageTask, resolveDeclarativeImageSize } from "./image-task-custom";

import { sanitizeAdvancedConfig } from "./image-task-support";

describe("declarative image request size", () => {
    beforeEach(() => vi.clearAllMocks());
    it("preserves the RunningHub task ID field through sanitization before submission", async () => {
        const advancedConfig = sanitizeAdvancedConfig({ ...emptyAdvancedConfig(), protocol: "runninghub", createPath: "/create", queryPath: "/query", taskIdField: "data.taskId", resultField: "data.results", statusField: "data.status" });
        expect(advancedConfig).toMatchObject({ taskIdField: "data.taskId" });
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: 0, data: { taskId: "same-upstream-task", status: "RUNNING" } }));
        const task = { id: "rh-submit", userId: "user", kind: "generation", prompt: "test", references: [], config: { baseUrl: "/api/ai/system/rh", apiKey: "system", apiFormat: "openai", model: "rh-image", advancedConfig } } as unknown as ImageTask;
        await expect(runCustomImageTask(task, "http://localhost", "http://localhost", "", true)).resolves.toMatchObject({ pending: { id: "same-upstream-task" } });
    });
    it("forwards practice workflow input such as the chosen size into the RunningHub nodeInfoList", async () => {
        const workflow = {
            workflowKey: "runninghub-demo-prop_main_view",
            workflowCode: "prop_main_view",
            workflowName: "道具主视图",
            businessCode: "storyboard-image",
            capability: "image",
            providerType: "runninghub",
            channelId: "rh",
            workflowId: "2090436220538150914",
            version: 1,
            enabled: true,
            createPath: "/task/openapi/create",
            queryPath: "/openapi/v2/query",
            taskIdField: "data.taskId",
            statusField: "data.status",
            resultField: "data.result",
            requestTemplate: "{}",
            inputSchema: [
                { key: "prompt", label: "描述词", type: "text", required: true },
                { key: "width", label: "宽", type: "number", required: true, defaultValue: 1024 },
                { key: "height", label: "高", type: "number", required: true, defaultValue: 1024 },
            ],
            nodeMappings: [
                { paramKey: "prompt", nodeId: "1", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" },
                { paramKey: "width", nodeId: "2", fieldName: "width", valueType: "NUMBER", source: "INPUT", inputKey: "width" },
                { paramKey: "height", nodeId: "2", fieldName: "height", valueType: "NUMBER", source: "INPUT", inputKey: "height" },
            ],
            outputMappings: [{ key: "image", label: "图片", nodeId: "9", assetType: "IMAGE", required: true, primary: true }],
        } as const;
        const advancedConfig = {
            ...emptyAdvancedConfig(),
            protocol: "runninghub" as const,
            createPath: workflow.createPath,
            queryPath: workflow.queryPath,
            taskIdField: workflow.taskIdField,
            resultField: workflow.resultField,
            statusField: workflow.statusField,
            workflowConfigs: { [workflow.workflowKey]: workflow },
        };
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: 0, data: { taskId: "sized-task", status: "RUNNING" } }));
        const task = {
            id: "rh-sized",
            userId: "user",
            kind: "generation",
            prompt: "青铜短剑",
            references: [],
            executionProfile: "open-source-practice",
            taskOrigin: "user",
            workflowKey: workflow.workflowKey,
            workflowVersion: 1,
            businessCode: "storyboard-image",
            workflowInput: { width: 768, height: 1024, workflowCode: "prop_main_view" },
            config: { baseUrl: "/api/ai/system/rh", apiKey: "system", apiFormat: "openai", model: workflow.workflowKey, executionProfile: "open-source-practice", advancedConfig },
        } as unknown as ImageTask;

        await expect(runCustomImageTask(task, "http://localhost", "http://localhost", "", true)).resolves.toMatchObject({ pending: { id: "sized-task" } });

        const body = JSON.parse(String((mocks.fetchInternalApi.mock.calls[0]?.[1] as RequestInit).body)) as { workflowId?: string; nodeInfoList?: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }> };
        expect(body.workflowId).toBe(workflow.workflowId);
        expect(body.nodeInfoList).toEqual(
            expect.arrayContaining([
                { nodeId: "2", fieldName: "width", fieldValue: 768 },
                { nodeId: "2", fieldName: "height", fieldValue: 1024 },
            ]),
        );
    });

    it("does not turn Stable Diffusion intelligent requests into a square size", () => {
        expect(resolveDeclarativeImageSize({ quality: "auto", size: "auto", advancedConfig: { ...emptyAdvancedConfig(), protocol: "stable-diffusion" } })).toBe("");
    });

    it("preserves explicit dimensions and does not invent custom protocol defaults", () => {
        expect(resolveDeclarativeImageSize({ quality: "high", size: "1536x1024", advancedConfig: { ...emptyAdvancedConfig(), protocol: "stable-diffusion" } })).toBe("1536x1024");
        expect(resolveDeclarativeImageSize({ quality: "auto", size: "auto", advancedConfig: { ...emptyAdvancedConfig(), protocol: "custom" } })).toBe("");
    });

    it("recovers an existing image using a local TCP query fixture without submitting again", async () => {
        const received: Array<{ method?: string; url?: string; body: string }> = [];
        const server = createServer(async (request, response) => {
            let body = "";
            for await (const chunk of request) body += chunk;
            received.push({ method: request.method, url: request.url, body });
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ status: "SUCCESS", results: [{ fileUrl: "https://cdn.example/existing.png", fileType: "png", nodeId: "67" }] }));
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        mocks.fetchInternalApi.mockImplementationOnce((url, init) => fetch(url, init));
        try {
            const task = {
                id: "existing-local",
                userId: "user",
                config: { baseUrl: "/api/ai/system/rh", apiKey: "fixture", model: "rh-image", advancedConfig: { ...emptyAdvancedConfig(), protocol: "runninghub", queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" } },
            } as unknown as ImageTask;
            await expect(pollCustomImageTask(task, "2097110134168977409", origin, `${origin}/api/ai/system/rh/task/openapi/create`, "", true)).resolves.toMatchObject({ results: [{ remoteUrl: expect.stringContaining("existing.png") }] });
            expect(received).toHaveLength(1);
            expect(received[0]).toMatchObject({ method: "POST", url: "/api/ai/system/rh/openapi/v2/query" });
            expect(JSON.parse(received[0].body)).toEqual({ apiKey: "fixture", taskId: "2097110134168977409" });
        } finally {
            server.close();
            await once(server, "close");
        }
    });

    it("queries an existing RunningHub task with POST and parses root results", async () => {
        const task = {
            id: "image-one",
            userId: "user",
            executionProfile: "open-source-practice",
            config: { baseUrl: "/api/ai/system/rh", apiKey: "system", model: "rh-image", advancedConfig: { ...emptyAdvancedConfig(), protocol: "runninghub", queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" } },
        } as unknown as ImageTask;
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ status: "SUCCESS", results: [{ url: "https://cdn.example/image.png", nodeId: "67", fileType: "png" }] }));
        const result = await pollCustomImageTask(task, "2097110706775347202", "https://runninghub.example", "http://localhost/api/ai/system/rh/task/openapi/create", "", true);
        expect(result.results).toHaveLength(1);
        const [url, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(url).toBe("http://localhost/api/ai/system/rh/openapi/v2/query");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body).taskId).toBe("2097110706775347202");
    });

    it("signs trusted practice polling with a stable server-owned request identity", async () => {
        const task = {
            id: "image-one",
            userId: "user-one",
            status: "running",
            createdAt: 1,
            updatedAt: 1,
            executionProfile: "open-source-practice",
            attemptNo: 4,
            kind: "generation",
            username: "user",
            displayName: "User",
            source: "image-workbench",
            prompt: "test",
            references: [],
            config: {
                baseUrl: "/api/ai/system/channel-one",
                apiKey: "system",
                apiFormat: "openai",
                model: "image-one",
                logicalModel: "practice-image",
                executionProfile: "open-source-practice",
                advancedConfig: { ...emptyAdvancedConfig(), protocol: "runninghub", createPath: "/images", queryPath: "/query/:task_id", taskIdField: "id", resultField: "url", statusField: "status" },
            },
        } satisfies ImageTask;
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ status: "processing" }));

        await expect(pollCustomImageTask(task, "upstream-one", "http://localhost/api/ai/system/channel-one/images", "http://localhost/api/ai/system/channel-one/images", "", true)).resolves.toMatchObject({ pending: { id: "upstream-one" } });

        const headers = new Headers((mocks.fetchInternalApi.mock.calls[0]?.[1] as RequestInit).headers);
        expect(readVerifiedSystemAiBusinessRequestId(headers, "practice-image", task.config.model, "open-source-practice")).toBe("image-task:image-one:attempt:4:poll");
    });
});
