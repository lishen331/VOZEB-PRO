import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getFreshAuthSettings: vi.fn(),
    setAuthSettings: vi.fn(),
    fetchRunningHubWorkflowJson: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    getFreshAuthSettings: mocks.getFreshAuthSettings,
    setAuthSettings: mocks.setAuthSettings,
}));
vi.mock("./runninghub-provider", () => ({ fetchRunningHubWorkflowJson: mocks.fetchRunningHubWorkflowJson }));

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import type { AuthSettings, RunningHubWorkflowConfig, SystemModelChannel } from "@/lib/auth/store-types";
import { runningHubChannelValidationErrors } from "./admin-channel-config";
import { resolvePracticeModuleModelOptions } from "./practice-module-service";
import { runningHubWorkflowConfigFingerprint } from "./runninghub-workflow-domain";
import {
    RunningHubWorkflowError,
    copyWorkflowVersion,
    createWorkflow,
    discoverWorkflow,
    fetchAndSaveWorkflowJson,
    getWorkflow,
    initializeDemoRunningHubWorkflows,
    listWorkflows,
    parseWorkflowId,
    setWorkflowEnabled,
    updateWorkflow,
} from "./runninghub-workflow-service";

const workflow = {
    workflowKey: "storyboard-image-v1",
    workflowName: "分镜图片",
    businessCode: "storyboard-image",
    capability: "image",
    providerType: "runninghub",
    channelId: "rh-practice",
    workflowId: "2087498214948823042",
    version: 1,
    enabled: true,
    createPath: "/task/create",
    queryPath: "/task/query",
    taskIdField: "data.taskId",
    statusField: "data.status",
    resultField: "data.result",
    requestTemplate: '{"workflowId":"2087498214948823042","secret":"do-not-return"}',
    inputSchema: [{ key: "prompt", label: "提示词", type: "textarea", required: true }],
    nodeMappings: [{ paramKey: "prompt", nodeId: "87", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" }],
    outputMappings: [{ key: "image", label: "图片", nodeId: "90", assetType: "IMAGE", required: true, primary: true }],
    workflowApiJson: "{}",\n    workflowJsonFingerprint: "test-json",\n    lastTestConfigFingerprint: "",\n    lastTestAt: "2026-09-01T00:00:00.000Z",
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

    it("extracts workflow ids from explicit URL segments without guessing project ids", () => {
        expect(parseWorkflowId("https://runninghub.example/workflow/2090436199843454978")).toBe("2090436199843454978");
        expect(parseWorkflowId("https://runninghub.example/project/999999999999/workflow/2090436199843454978")).toBe("2090436199843454978");
        expect(parseWorkflowId("https://runninghub.example/project/999999999999/asset/888888888888")).toBe("");
    });

    it("unwraps RunningHub data.prompt JSON before analyzing workflow nodes", async () => {
        const nodes = {
            "35": { class_type: "TextInput", inputs: { text: "{{prompt}}" } },
            "13": { class_type: "LoadImage", inputs: { image: "reference.png" } },
            "67": { class_type: "SaveImage", inputs: { images: ["13", 0] } },
        };
        mocks.fetchRunningHubWorkflowJson.mockResolvedValue({ code: 0, msg: "SUCCESS", data: { workflowType: "MiniMaxH3ReferenceToImage", prompt: JSON.stringify(nodes) } });

        const result = await discoverWorkflow({ channelId: "rh-practice", workflowIdOrUrl: "2090436220538150914", capability: "image" });

        expect(result).toMatchObject({ workflowId: "2090436220538150914", workflowType: "MiniMaxH3ReferenceToImage", nodeCount: 3 });
        expect(result.candidates).toEqual(
            expect.arrayContaining([expect.objectContaining({ nodeId: "35", fieldName: "text", role: "prompt" }), expect.objectContaining({ nodeId: "13", fieldName: "image", role: "image" }), expect.objectContaining({ nodeId: "67", role: "output" })]),
        );
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

    it("allows a complete copied version to activate while exposing retest risk", async () => {
        const result = await copyWorkflowVersion(workflow.workflowKey, { activateVersion: true });

        expect(result).toMatchObject({ enabled: true, requiresRetest: true });
        expect(mocks.setAuthSettings).toHaveBeenCalled();
    });

    it("activates a workflow after successful evidence even when testRequired remains set", async () => {
        const candidate = { ...workflow, enabled: false, testRequired: true, workflowJsonFingerprint: "json-fingerprint" };
        const evidence = runningHubWorkflowConfigFingerprint(candidate);
        mocks.getFreshAuthSettings.mockResolvedValue(settingsWith({ ...candidate, lastTestConfigFingerprint: evidence }));

        const result = await setWorkflowEnabled(candidate.workflowKey, true);

        expect(result).toMatchObject({ workflowKey: candidate.workflowKey, enabled: true, requiresRetest: false });
        expect(mocks.setAuthSettings).toHaveBeenCalled();
    });

    it("keeps different Demo workflow codes enabled within the same image business group", async () => {
        const storyboard = { ...workflow, workflowKey: "storyboard", workflowCode: "storyboard_shot" as const, enabled: true, inputSchema: [...workflow.inputSchema, { key: "sceneImage", label: "场景图", type: "image" as const, required: true }] };
        const prop: RunningHubWorkflowConfig = { ...workflow, workflowKey: "prop", workflowCode: "prop_main_view", workflowName: "道具主视图", enabled: false };
        prop.lastTestConfigFingerprint = runningHubWorkflowConfigFingerprint(prop);
        const current = settingsWith(storyboard, prop);
        mocks.getFreshAuthSettings.mockResolvedValue(current);
        mocks.setAuthSettings.mockImplementation(async (patch: Partial<AuthSettings>) => ({ ...current, ...patch }));

        await setWorkflowEnabled(prop.workflowKey, true);

        const patch = mocks.setAuthSettings.mock.calls.at(-1)?.[0] as Partial<AuthSettings>;
        expect(patch.systemChannels?.[0]?.advancedConfig?.workflowConfigs?.storyboard?.enabled).toBe(true);
        expect(patch.systemChannels?.[0]?.advancedConfig?.workflowConfigs?.prop?.enabled).toBe(true);
        const generatedModel = patch.practiceWorkflowModels?.[prop.businessCode]?.[0];
        expect(patch.systemChannels?.[0]?.advancedConfig?.modelConfigs?.[generatedModel!]?.supportsReferenceImage).toBe(true);
    });
    it("creates the internal practice model binding when a tested workflow is enabled", async () => {
        const candidate = { ...workflow, enabled: false, workflowCode: "storyboard_shot" as const, lastTestConfigFingerprint: runningHubWorkflowConfigFingerprint({ ...workflow, enabled: false, workflowCode: "storyboard_shot" }) };
        const current = settingsWith(candidate);
        current.logicalModels = [];
        current.practiceWorkflowModels = {};
        mocks.getFreshAuthSettings.mockResolvedValue(current);
        mocks.setAuthSettings.mockImplementation(async (patch: Partial<AuthSettings>) => ({ ...current, ...patch }));

        await setWorkflowEnabled(candidate.workflowKey, true);

        const patch = mocks.setAuthSettings.mock.calls.at(-1)?.[0] as Partial<AuthSettings>;
        const channel = patch.systemChannels?.find((item) => item.id === candidate.channelId);
        const logicalModelId = patch.practiceWorkflowModels?.[candidate.businessCode]?.[0];
        expect(logicalModelId).toBeTruthy();
        expect(channel?.models).toContain(logicalModelId);
        expect(channel?.advancedConfig?.modelCapabilities?.[logicalModelId!]).toBe(candidate.capability);
        expect(channel && runningHubChannelValidationErrors(channel)).toEqual([]);
        expect(resolvePracticeModuleModelOptions({ ...current, ...patch } as AuthSettings, "storyboard-image")).toEqual([{ id: logicalModelId, label: "练习 RunningHub · 图片" }]);
        expect(patch.logicalModels).toContainEqual(
            expect.objectContaining({
                id: logicalModelId,
                name: candidate.workflowName,
                capability: candidate.capability,
                enabled: true,
                bindings: [expect.objectContaining({ channelId: candidate.channelId, upstreamModel: logicalModelId, enabled: true })],
            }),
        );
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

    it("bootstraps all Demo workflows idempotently without enabling or overwriting edits", async () => {
        const result = await initializeDemoRunningHubWorkflows({ channelId: "rh-practice" });
        expect(result).toMatchObject({ added: 7, updated: 0, skipped: 0, workflowKeys: expect.arrayContaining([expect.stringContaining("character_main_view")]) });
        const patch = mocks.setAuthSettings.mock.calls[0][0] as Partial<AuthSettings>;
        const configs = Object.values(patch.systemChannels?.[0]?.advancedConfig?.workflowConfigs || {});
        expect(configs).toHaveLength(8);
        expect(configs.filter((item) => item.workflowCode === "character_main_view")[0]).toMatchObject({ enabled: false, workflowId: "2069627147735621634" });
    });

    it("fetches and persists the official workflow JSON snapshot and fingerprint", async () => {
        mocks.fetchRunningHubWorkflowJson.mockResolvedValue({ code: 0, data: { prompt: JSON.stringify({ "1": { class_type: "SaveImage", inputs: {} } }) } });
        const result = await fetchAndSaveWorkflowJson(workflow.workflowKey);
        expect(result).toMatchObject({ workflowKey: workflow.workflowKey, workflowJsonFingerprint: expect.any(String), nodeCount: 1 });
        const patch = mocks.setAuthSettings.mock.calls.at(-1)?.[0] as Partial<AuthSettings>;
        expect(patch.systemChannels?.[0]?.advancedConfig?.workflowConfigs?.[workflow.workflowKey]).toMatchObject({ workflowApiJson: expect.stringContaining("SaveImage"), workflowJsonFingerprint: expect.any(String) });
    });
    it("returns a 404 for unknown workflow keys", async () => {
        await expect(getWorkflow("missing")).rejects.toMatchObject({ status: 404 });
    });
});

