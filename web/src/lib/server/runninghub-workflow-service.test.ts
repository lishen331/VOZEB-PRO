import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getFreshAuthSettings: vi.fn(),
    setAuthSettings: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    getFreshAuthSettings: mocks.getFreshAuthSettings,
    setAuthSettings: mocks.setAuthSettings,
}));

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import type { AuthSettings, RunningHubWorkflowConfig, SystemModelChannel } from "@/lib/auth/store-types";
import { RunningHubWorkflowError, copyWorkflowVersion, createWorkflow, getWorkflow, listWorkflows, setWorkflowEnabled, updateWorkflow } from "./runninghub-workflow-service";

const workflow = {
    workflowKey: "storyboard-image-v1",
    workflowName: "分镜图片",
    businessCode: "storyboard-image",
    capability: "image",
    providerType: "runninghub",
    channelId: "rh-practice",
    workflowId: "workflow-001",
    version: 1,
    enabled: true,
    createPath: "/task/create",
    queryPath: "/task/query",
    taskIdField: "data.taskId",
    statusField: "data.status",
    resultField: "data.result",
    requestTemplate: '{"workflowId":"workflow-001","secret":"do-not-return"}',
    inputSchema: [{ key: "prompt", label: "提示词", type: "textarea", required: true }],
    nodeMappings: [{ paramKey: "prompt", nodeId: "87", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" }],
    outputMappings: [{ key: "image", label: "图片", nodeId: "90", assetType: "IMAGE", required: true, primary: true }],
    lastTestAt: "2026-09-01T00:00:00.000Z",
    lastTestResult: "success",
} satisfies RunningHubWorkflowConfig;

function settingsWith(...configs: RunningHubWorkflowConfig[]): AuthSettings {
    const channel: SystemModelChannel = {
        id: "rh-practice",
        name: "练习 RunningHub",
        baseUrl: "https://runninghub.example",
        apiKey: "private-api-key",
        apiFormat: "openai",
        models: [],
        enabled: true,
        purpose: "open-source-practice",
        advancedConfig: {
            textModel: "",
            imageModel: "",
            videoModel: "",
            createPath: "/task/create",
            queryPath: "/task/query",
            requestTemplate: "{}",
            resultField: "data.result",
            statusField: "data.status",
            durationRange: "",
            referenceRule: "",
            supportsReferenceImage: false,
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
            protocol: "runninghub",
            workflowConfigs: Object.fromEntries(configs.map((item) => [item.workflowKey, item])),
        },
    };
    return { ...structuredClone(DEFAULT_SETTINGS), systemChannels: [channel] };
}

describe("runninghub workflow service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const saved = settingsWith(workflow);
        mocks.getFreshAuthSettings.mockResolvedValue(saved);
        mocks.setAuthSettings.mockImplementation(async (patch: Partial<AuthSettings>) => ({ ...saved, ...patch }));
    });

    it("creates version one disabled and never returns API secrets or the full request template", async () => {
        const result = await createWorkflow({
            ...workflow,
            workflowKey: undefined,
            version: undefined,
            enabled: true,
            lastTestAt: undefined,
            lastTestResult: undefined,
        });

        expect(result).toMatchObject({ version: 1, enabled: false, channelId: "rh-practice", businessCode: "storyboard-image" });
        expect(result.requestTemplate).toBeUndefined();
        expect(result.requestTemplateConfigured).toBe(true);
        expect(JSON.stringify(result)).not.toContain("private-api-key");
        expect(mocks.setAuthSettings).toHaveBeenCalledWith(expect.objectContaining({ systemChannels: expect.any(Array) }));
    });

    it("filters workflow summaries on the server and paginates the result", async () => {
        mocks.getFreshAuthSettings.mockResolvedValue(settingsWith(workflow, { ...workflow, workflowKey: "script-v1", workflowName: "脚本", businessCode: "script", capability: "text", enabled: false }));

        const result = await listWorkflows({ search: "脚本", status: "disabled", page: 1, pageSize: 1 });

        expect(result).toMatchObject({ total: 1, page: 1, pageSize: 1 });
        expect(result.items[0]).toMatchObject({ workflowKey: "script-v1", enabled: false });
        expect(result.items[0].requestTemplate).toBeUndefined();
    });

    it("copies a version with an incremented disabled version and can activate it atomically", async () => {
        const result = await copyWorkflowVersion(workflow.workflowKey, { activateVersion: true });
        const savedChannels = mocks.setAuthSettings.mock.calls[0][0].systemChannels as SystemModelChannel[];
        const savedConfigs = savedChannels[0].advancedConfig?.workflowConfigs || {};

        expect(result).toMatchObject({ version: 2, enabled: true, workflowId: workflow.workflowId });
        expect(savedConfigs[workflow.workflowKey]).toMatchObject({ enabled: false, lastTestResult: "success" });
        expect(savedConfigs[result.workflowKey]).toMatchObject({ version: 2, enabled: true });
    });

    it("rejects edits to an enabled version and only changes activation through version operations", async () => {
        await expect(updateWorkflow(workflow.workflowKey, { workflowName: "新的名称" })).rejects.toMatchObject({ status: 409 });
        await expect(setWorkflowEnabled("missing", true)).rejects.toBeInstanceOf(RunningHubWorkflowError);
        expect(mocks.setAuthSettings).not.toHaveBeenCalled();
    });

    it("ignores a client channelId when editing a workflow", async () => {
        const disabled = { ...workflow, enabled: false };
        mocks.getFreshAuthSettings.mockResolvedValue(settingsWith(disabled));
        await updateWorkflow(workflow.workflowKey, { channelId: "other-channel", workflowName: "更新" });
        const saved = mocks.setAuthSettings.mock.calls[0][0].systemChannels as SystemModelChannel[];
        expect(saved[0].advancedConfig?.workflowConfigs?.[workflow.workflowKey]?.channelId).toBe("rh-practice");
    });

    it("returns a 404 for unknown workflow keys", async () => {
        await expect(getWorkflow("missing")).rejects.toMatchObject({ status: 404 });
    });
});
