import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getWorkflowExecution: vi.fn(),
    getWorkflowChannel: vi.fn(),
    submit: vi.fn(),
    query: vi.fn(),
    upload: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
}));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ getWorkflowExecution: mocks.getWorkflowExecution, getWorkflowChannel: mocks.getWorkflowChannel }));
vi.mock("@/lib/server/runninghub-provider", () => ({ submitRunningHubTask: mocks.submit, queryRunningHubTask: mocks.query, uploadRunningHubMedia: mocks.upload }));
vi.mock("@/lib/server/admin-workflow-test-store", () => ({ createAdminWorkflowTest: mocks.create, getAdminWorkflowTest: mocks.get, updateAdminWorkflowTest: mocks.update }));
vi.mock("@/lib/auth/store", () => ({ getFreshAuthSettings: mocks.getSettings, setAuthSettings: mocks.setSettings }));

import { inspectRunningHubWorkflowTest, startRunningHubWorkflowTest } from "./runninghub-workflow-test-service";

const config = {
    workflowKey: "wf",
    workflowName: "脚本",
    businessCode: "script",
    capability: "text",
    providerType: "runninghub",
    workflowId: "remote",
    version: 2,
    enabled: true,
    createPath: "/create",
    queryPath: "/query/{taskId}",
    taskIdField: "data.taskId",
    statusField: "data.status",
    resultField: "data.result",
    requestTemplate: "",
    inputSchema: [{ key: "prompt", label: "提示词", type: "text", required: true }],
    nodeMappings: [{ paramKey: "prompt", nodeId: "1", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" }],
    outputMappings: [],
} as const;

describe("runninghub workflow test service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getWorkflowExecution.mockResolvedValue({ config, channel: { id: "channel", name: "RunningHub", baseUrl: "https://fixture", apiKey: "secret", advancedConfig: { protocol: "runninghub" } } });
        mocks.getWorkflowChannel.mockResolvedValue({ id: "channel", name: "RunningHub", baseUrl: "https://fixture", apiKey: "secret", advancedConfig: { protocol: "runninghub" } });
        mocks.create.mockImplementation(async (record: Record<string, unknown>) => ({ ...record, createdAt: 10, updatedAt: 10 }));
        mocks.update.mockImplementation(async (record: Record<string, unknown>) => record);
        mocks.getSettings.mockResolvedValue({ systemChannels: [] });
        mocks.setSettings.mockResolvedValue({});
    });

    it("submits a versioned task with admin origin and no school context", async () => {
        mocks.submit.mockResolvedValue({ taskId: "task-1", raw: { ok: true } });
        const result = await startRunningHubWorkflowTest({ workflowKey: "wf", adminId: "admin-1", input: { prompt: "hello" } });
        expect(result).toMatchObject({ status: "running", taskId: "task-1", workflowVersion: 2 });
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ workflowVersion: 2, userId: "admin-1" }));
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ workflowConfig: expect.objectContaining({ workflowId: "remote", version: 2 }) }));
        expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://fixture", apiKey: "secret", payload: expect.objectContaining({ workflowId: "remote" }) }));
    });

    it("queries an existing run once and persists success result", async () => {
        mocks.get.mockResolvedValue({
            id: "run-1",
            userId: "admin-1",
            workflowKey: "wf",
            workflowVersion: 2,
            upstreamWorkflowId: "remote",
            businessCode: "script",
            type: "text",
            status: "running",
            taskId: "task-1",
            createdAt: Date.now() - 20,
            updatedAt: Date.now(),
            taskOrigin: "admin-workflow-test",
            workflowConfig: structuredClone(config),
        });
        mocks.query.mockResolvedValue({
            status: "SUCCESS",
            resultText: "hello",
            resultUrls: ["https://fixture/a.png", "https://fixture/b.png"],
            outputs: [{ key: "images", label: "图片", assetType: "IMAGE", values: ["https://fixture/a.png", "https://fixture/b.png"] }],
            raw: {},
        });
        const result = await inspectRunningHubWorkflowTest({ workflowKey: "wf", runId: "run-1", adminId: "admin-1" });
        expect(result).toMatchObject({ runId: "run-1", status: "success", resultText: "hello", resultUrls: ["https://fixture/a.png", "https://fixture/b.png"] });
        expect(mocks.query).toHaveBeenCalledTimes(1);
        expect(mocks.submit).not.toHaveBeenCalled();
    });

    it("uses the stored workflow snapshot when the current workflow changed", async () => {
        mocks.get.mockResolvedValue({
            id: "run-2",
            userId: "admin-1",
            workflowKey: "wf",
            workflowVersion: 2,
            upstreamWorkflowId: "remote",
            businessCode: "script",
            type: "text",
            status: "running",
            taskId: "task-2",
            createdAt: Date.now() - 20,
            updatedAt: Date.now(),
            taskOrigin: "admin-workflow-test",
            workflowConfig: structuredClone(config),
        });
        mocks.getWorkflowExecution.mockResolvedValue({ config: { ...config, workflowId: "changed", version: 3 }, channel: { id: "channel", baseUrl: "https://fixture", apiKey: "secret", advancedConfig: { protocol: "runninghub" } } });
        mocks.query.mockResolvedValue({ status: "SUCCESS", resultText: "snapshot", raw: {} });
        await inspectRunningHubWorkflowTest({ workflowKey: "wf", runId: "run-2", adminId: "admin-1" });
        expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ workflowId: "remote", version: 2 }) }));
    });

    it("keeps a preview result running while the upstream status is still processing", async () => {
        mocks.get.mockResolvedValue({
            id: "run-preview",
            userId: "admin-1",
            workflowKey: "wf",
            workflowVersion: 2,
            upstreamWorkflowId: "remote",
            businessCode: "script",
            type: "text",
            status: "running",
            taskId: "task-preview",
            createdAt: Date.now() - 20,
            updatedAt: Date.now(),
            taskOrigin: "admin-workflow-test",
            workflowConfig: structuredClone(config),
        });
        mocks.query.mockResolvedValue({ status: "PROCESSING", resultText: "preview", raw: {} });
        await expect(inspectRunningHubWorkflowTest({ workflowKey: "wf", runId: "run-preview", adminId: "admin-1" })).resolves.toMatchObject({ status: "running", resultText: "preview" });
    });
});
