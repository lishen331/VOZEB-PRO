import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getWorkflowExecution: vi.fn(),
    submit: vi.fn(),
    query: vi.fn(),
    upload: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
}));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ getWorkflowExecution: mocks.getWorkflowExecution }));
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
        });
        mocks.query.mockResolvedValue({ status: "SUCCESS", resultUrl: "https://fixture/result.txt", raw: {} });
        const result = await inspectRunningHubWorkflowTest({ workflowKey: "wf", runId: "run-1", adminId: "admin-1" });
        expect(result).toMatchObject({ runId: "run-1", status: "success", resultUrl: "https://fixture/result.txt" });
        expect(mocks.query).toHaveBeenCalledTimes(1);
        expect(mocks.submit).not.toHaveBeenCalled();
    });
});
