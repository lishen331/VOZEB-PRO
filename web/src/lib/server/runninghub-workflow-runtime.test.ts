import { describe, expect, it } from "vitest";

import type { RunningHubWorkflowConfig } from "@/lib/auth/store";

import {
    attachPracticeWorkflowToChannel,
    buildRunningHubWorkflowPayload,
    generationBusinessCode,
    recordWorkflowTaskContext,
    resolvePracticeGenerationCandidates,
    resolvePracticeWorkflowCandidates,
    workflowConfigForTask,
    workflowTaskContextForChannel,
    workflowTimeoutMs,
} from "./runninghub-workflow-runtime";
import { runningHubWorkflowConfigFingerprint } from "./runninghub-workflow-domain";
import { demoRunningHubWorkflowCatalog } from "./runninghub-demo-workflow-catalog";

const config: RunningHubWorkflowConfig = {
    workflowKey: "practice-image",
    workflowName: "练习图片",
    businessCode: "storyboard-image",
    capability: "image",
    providerType: "runninghub",
    channelId: "rh-practice",
    workflowId: "workflow-image",
    version: 3,
    enabled: true,
    createPath: "/openapi/v2/task/create",
    queryPath: "/openapi/v2/task/status/:task_id",
    taskIdField: "data.taskId",
    statusField: "data.status",
    resultField: "data.output",
    requestTemplate: '{"workflowId":"{{workflowId}}","nodeInfoList":"{{nodeInfoList}}","extra":"kept"}',
    inputSchema: [
        { key: "prompt", label: "提示词", type: "textarea", required: true },
        { key: "steps", label: "步数", type: "number", required: true },
        { key: "draft", label: "草稿", type: "boolean", required: true },
        { key: "referenceImage", label: "参考图", type: "image", required: false },
    ],
    nodeMappings: [
        { paramKey: "prompt", nodeId: "87", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" },
        { paramKey: "steps", nodeId: "88", fieldName: "value", valueType: "NUMBER", source: "INPUT", inputKey: "steps" },
        { paramKey: "draft", nodeId: "89", fieldName: "enabled", valueType: "BOOLEAN", source: "INPUT", inputKey: "draft" },
        { paramKey: "referenceImage", nodeId: "90", fieldName: "image", valueType: "STRING", source: "INPUT", inputKey: "referenceImage" },
    ],
    outputMappings: [{ key: "image", label: "图片", nodeId: "90", assetType: "IMAGE", required: true, primary: true }],
    runOptions: { priority: "low", seed: 7 },
    timeoutSeconds: 11,
};

describe("RunningHub workflow runtime", () => {
    it("builds a server-owned workflow payload from typed inputs and references", () => {
        expect(
            buildRunningHubWorkflowPayload({
                config,
                businessInput: { prompt: "  一只猫  ", steps: 12, draft: false },
                references: [{ type: "image", url: "https://cdn.example/reference.png" }],
            }),
        ).toEqual({
            workflowId: "workflow-image",
            nodeInfoList: [
                { nodeId: "87", fieldName: "text", fieldValue: "一只猫" },
                { nodeId: "88", fieldName: "value", fieldValue: 12 },
                { nodeId: "89", fieldName: "enabled", fieldValue: false },
                { nodeId: "90", fieldName: "image", fieldValue: "https://cdn.example/reference.png" },
            ],
            extra: "kept",
            runOptions: { priority: "low", seed: 7 },
        });
    });

    it("rejects missing required input and mappings that reference unknown keys", () => {
        expect(() => buildRunningHubWorkflowPayload({ config, businessInput: { steps: 12, draft: true }, references: [] })).toThrow("提示词");
        expect(() =>
            buildRunningHubWorkflowPayload({
                config: { ...config, nodeMappings: [{ ...config.nodeMappings[0], inputKey: "missing" }] },
                businessInput: { prompt: "x", steps: 1, draft: true },
                references: [],
            }),
        ).toThrow("配置错误");
    });

    it("records the immutable workflow version and upstream id separately from business input", () => {
        expect(recordWorkflowTaskContext(config)).toMatchObject({ workflowKey: "practice-image", workflowVersion: 3, upstreamWorkflowId: "workflow-image", businessCode: "storyboard-image", workflowConfigFingerprint: expect.any(String) });
    });

    it("attaches only the enabled server-side workflow selected by a trusted practice context", () => {
        const channel = {
            channelId: "rh-practice",
            logicalModel: "practice-image",
            baseUrl: "/api/ai/system/rh-practice",
            advancedConfig: {
                protocol: "runninghub" as const,
                createPath: "/legacy",
                queryPath: "/legacy",
                requestTemplate: "{}",
                resultField: "data.result",
                statusField: "data.status",
                textModel: "",
                imageModel: "",
                videoModel: "",
                durationRange: "",
                referenceRule: "",
                supportsReferenceImage: false,
                supportsReferenceVideo: false,
                supportsReferenceAudio: false,
            },
        };
        const attached = attachPracticeWorkflowToChannel(
            channel,
            {
                systemChannels: [
                    {
                        id: "rh-practice",
                        name: "练习",
                        baseUrl: "https://runninghub.example",
                        apiKey: "",
                        apiFormat: "openai",
                        models: ["image"],
                        enabled: true,
                        purpose: "open-source-practice",
                        advancedConfig: { ...channel.advancedConfig, workflowConfigs: { [config.workflowKey]: config } },
                    },
                ],
            },
            { executionProfile: "open-source-practice", businessCode: config.businessCode, workflowKey: config.workflowKey, workflowVersion: config.version },
        );
        expect(attached.advancedConfig).toMatchObject({ createPath: config.createPath, queryPath: config.queryPath, requestTemplate: config.requestTemplate, workflowConfigs: { [config.workflowKey]: config } });
    });

    it("selects an enabled practice workflow when the trusted context omits a client workflow key", () => {
        const channel = { channelId: "rh-practice", advancedConfig: { workflowConfigs: { [config.workflowKey]: config } } } as unknown as Parameters<typeof attachPracticeWorkflowToChannel>[0];
        const attached = attachPracticeWorkflowToChannel(
            channel,
            {
                systemChannels: [
                    {
                        id: "rh-practice",
                        name: "练习",
                        baseUrl: "https://runninghub.example",
                        apiKey: "",
                        apiFormat: "openai",
                        models: [],
                        enabled: true,
                        purpose: "open-source-practice",
                        advancedConfig: {
                            protocol: "runninghub",
                            workflowConfigs: { [config.workflowKey]: config },
                            textModel: "",
                            imageModel: "",
                            videoModel: "",
                            createPath: "",
                            queryPath: "",
                            requestTemplate: "",
                            resultField: "",
                            statusField: "",
                            durationRange: "",
                            referenceRule: "",
                            supportsReferenceImage: false,
                            supportsReferenceVideo: false,
                            supportsReferenceAudio: false,
                        },
                    },
                ],
            },
            { executionProfile: "open-source-practice", businessCode: "storyboard-image" },
        );
        expect(attached.advancedConfig?.workflowConfigs?.[config.workflowKey]).toMatchObject({ version: 3, enabled: true });
    });

    it("allows enabled workflows without using test evidence as a runtime gate", () => {
        const discovered = { ...config, workflowJsonFingerprint: "json-1" };
        const channel = { channelId: "rh-practice", advancedConfig: { workflowConfigs: { [discovered.workflowKey]: discovered } } } as unknown as Parameters<typeof attachPracticeWorkflowToChannel>[0];
        const settings = {
            practiceWorkflowModels: {},
            systemChannels: [
                {
                    id: "rh-practice",
                    name: "练习",
                    baseUrl: "https://runninghub.example",
                    apiKey: "",
                    apiFormat: "openai",
                    models: [],
                    enabled: true,
                    purpose: "open-source-practice",
                    advancedConfig: {
                        ...channel.advancedConfig,
                        protocol: "runninghub",
                        textModel: "",
                        imageModel: "",
                        videoModel: "",
                        createPath: "",
                        queryPath: "",
                        requestTemplate: "",
                        resultField: "",
                        statusField: "",
                        durationRange: "",
                        referenceRule: "",
                        supportsReferenceImage: false,
                        supportsReferenceVideo: false,
                        supportsReferenceAudio: false,
                    },
                },
            ],
        };
        expect(attachPracticeWorkflowToChannel(channel, settings as never, { executionProfile: "open-source-practice", businessCode: config.businessCode }).advancedConfig?.createPath).toBe(config.createPath);
        const tested = { ...discovered, lastTestResult: "success" as const, lastTestConfigFingerprint: runningHubWorkflowConfigFingerprint(discovered) };
        const testedChannel = { ...channel, advancedConfig: { ...channel.advancedConfig, workflowConfigs: { [tested.workflowKey]: tested } } } as Parameters<typeof attachPracticeWorkflowToChannel>[0];
        expect(
            attachPracticeWorkflowToChannel(
                testedChannel,
                { ...settings, systemChannels: [{ ...settings.systemChannels[0], advancedConfig: { ...settings.systemChannels[0].advancedConfig, workflowConfigs: { [tested.workflowKey]: tested } } }] } as never,
                { executionProfile: "open-source-practice", businessCode: config.businessCode },
            ).advancedConfig?.workflowConfigs,
        ).toBeTruthy();
    });

    it("does not resolve a production or stopped workflow from task metadata", () => {
        expect(
            workflowConfigForTask({
                executionProfile: "production",
                workflowKey: config.workflowKey,
                workflowVersion: config.version,
                businessCode: config.businessCode,
                config: { advancedConfig: { workflowConfigs: { [config.workflowKey]: config } } } as never,
            }),
        ).toBeUndefined();
        expect(
            workflowConfigForTask({
                executionProfile: "open-source-practice",
                workflowKey: config.workflowKey,
                workflowVersion: config.version,
                businessCode: config.businessCode,
                config: { advancedConfig: { workflowConfigs: { [config.workflowKey]: { ...config, enabled: false } } } } as never,
            }),
        ).toBeUndefined();
    });

    it("rejects a persisted workflow identity when its configuration fingerprint changed", () => {
        const changed = { ...config, requestTemplate: '{"changed":true}', lastTestResult: "success" as const, lastTestConfigFingerprint: runningHubWorkflowConfigFingerprint({ ...config, requestTemplate: '{"changed":true}' }) };
        const channel = { channelId: "rh-practice", logicalModel: "practice-image", advancedConfig: { workflowConfigs: { [changed.workflowKey]: changed } } };
        const settings = { practiceWorkflowModels: {}, systemChannels: [{ id: "rh-practice", advancedConfig: { ...channel.advancedConfig, protocol: "runninghub" } }] } as never;
        expect(() =>
            attachPracticeWorkflowToChannel(channel as never, settings, {
                executionProfile: "open-source-practice",
                businessCode: config.businessCode,
                workflowKey: config.workflowKey,
                workflowVersion: config.version,
                workflowConfigFingerprint: runningHubWorkflowConfigFingerprint(config),
            }),
        ).toThrow("版本不存在或已停用");
    });

    it("uses workflow timeout when scheduling a RunningHub request", () => {
        expect(workflowTimeoutMs(config, 999)).toBe(11_000);
        expect(workflowTimeoutMs({ ...config, timeoutSeconds: undefined }, 999)).toBe(999);
    });

    it("uses the practice script business code for drama text and tolerates no channels", () => {
        expect(generationBusinessCode("drama", "text")).toBe("script");
        expect(workflowTaskContextForChannel(undefined, "script")).toEqual({});
    });

    it("resolves the persisted workflow version instead of silently switching to the latest version", () => {
        const previous = { ...config, workflowKey: "practice-image-v1", version: 1, lastTestResult: "success" as const, lastTestConfigFingerprint: runningHubWorkflowConfigFingerprint({ ...config, workflowKey: "practice-image-v1", version: 1 }) };
        const latest = {
            ...config,
            workflowKey: "practice-image-v2",
            version: 2,
            workflowId: "workflow-image-v2",
            lastTestResult: "success" as const,
            lastTestConfigFingerprint: runningHubWorkflowConfigFingerprint({ ...config, workflowKey: "practice-image-v2", version: 2, workflowId: "workflow-image-v2" }),
        };
        const channel = { advancedConfig: { workflowConfigs: { [previous.workflowKey]: previous, [latest.workflowKey]: latest } } };

        expect(
            workflowTaskContextForChannel(channel as never, config.businessCode, {
                workflowKey: previous.workflowKey,
                workflowVersion: previous.version,
                workflowConfigFingerprint: runningHubWorkflowConfigFingerprint(previous),
            }),
        ).toMatchObject({ workflowKey: previous.workflowKey, workflowVersion: 1, upstreamWorkflowId: previous.workflowId });
    });
});

describe("RunningHub Demo workflow routing", () => {
    const DEMO_CHANNEL_ID = "rh-demo";
    const emptyAdvanced = {
        textModel: "",
        imageModel: "",
        videoModel: "",
        createPath: "",
        queryPath: "",
        requestTemplate: "",
        resultField: "",
        statusField: "",
        durationRange: "",
        referenceRule: "",
        supportsReferenceImage: false,
        supportsReferenceVideo: false,
        supportsReferenceAudio: false,
    };
    function demoSettings(overrides: (workflow: RunningHubWorkflowConfig) => Partial<RunningHubWorkflowConfig> = () => ({})) {
        const workflowConfigs = Object.fromEntries(demoRunningHubWorkflowCatalog().map((workflow) => [workflow.workflowKey, { ...workflow, channelId: DEMO_CHANNEL_ID, enabled: true, ...overrides(workflow) }]));
        return {
            logicalModels: [],
            systemChannels: [
                {
                    id: DEMO_CHANNEL_ID,
                    name: "Demo",
                    baseUrl: "https://runninghub.example",
                    apiKey: "",
                    apiFormat: "openai" as const,
                    models: [],
                    enabled: true,
                    purpose: "open-source-practice" as const,
                    advancedConfig: { ...emptyAdvanced, protocol: "runninghub" as const, workflowConfigs },
                },
            ],
        };
    }

    it("routes each of the seven Demo workflows by exact workflowCode without any model binding", () => {
        const settings = demoSettings();
        const catalog = demoRunningHubWorkflowCatalog();
        expect(catalog.map((workflow) => workflow.workflowCode).sort()).toEqual(["character_main_view", "character_multi_view", "prop_main_view", "scene_main_view", "storyboard_dialogue_audio", "storyboard_shot", "storyboard_shot_video"]);
        for (const workflow of catalog) {
            const [candidate, ...rest] = resolvePracticeWorkflowCandidates(settings, workflow.capability, workflow.businessCode, workflow.workflowCode);
            expect(rest).toHaveLength(0);
            expect(candidate).toMatchObject({ logicalModelId: workflow.workflowKey, upstreamModel: workflow.workflowKey, channelId: DEMO_CHANNEL_ID });
            const context = { executionProfile: "open-source-practice", businessCode: workflow.businessCode, workflowCode: workflow.workflowCode };
            const attached = attachPracticeWorkflowToChannel({ channelId: DEMO_CHANNEL_ID } as { channelId?: string; advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig }, settings, context);
            expect(attached.advancedConfig?.workflowConfigs?.[workflow.workflowKey]).toMatchObject({ workflowCode: workflow.workflowCode, workflowId: workflow.workflowId });
            expect(workflowTaskContextForChannel(attached, workflow.businessCode, { workflowCode: workflow.workflowCode })).toMatchObject({
                workflowKey: workflow.workflowKey,
                workflowCode: workflow.workflowCode,
                upstreamWorkflowId: workflow.workflowId,
                businessCode: workflow.businessCode,
                taskOrigin: "user",
            });
        }
    });

    it("never substitutes another image workflow for a missing or disabled workflowCode", () => {
        const settings = demoSettings();
        expect(resolvePracticeWorkflowCandidates(settings, "image", "storyboard-image", "unknown_workflow")).toEqual([]);
        const disabledProp = demoSettings((workflow) => (workflow.workflowCode === "prop_main_view" ? { enabled: false } : {}));
        expect(resolvePracticeWorkflowCandidates(disabledProp, "image", "storyboard-image", "prop_main_view")).toEqual([]);
        expect(resolvePracticeGenerationCandidates(disabledProp, "image", "any-logical-model", { executionProfile: "open-source-practice", businessCode: "storyboard-image", workflowCode: "prop_main_view" })).toEqual([]);
        expect(() => attachPracticeWorkflowToChannel({ channelId: DEMO_CHANNEL_ID } as never, disabledProp, { executionProfile: "open-source-practice", businessCode: "storyboard-image", workflowCode: "prop_main_view" })).toThrow("版本不存在或已停用");
    });

    it("falls back to the Demo storyboard workflows when a project practice context omits workflowCode", () => {
        const settings = demoSettings();
        expect(resolvePracticeWorkflowCandidates(settings, "image", "canvas")[0]).toMatchObject({ logicalModelId: "runninghub-demo-storyboard_shot" });
        expect(resolvePracticeWorkflowCandidates(settings, "image", "storyboard-image")[0]).toMatchObject({ logicalModelId: "runninghub-demo-storyboard_shot" });
        expect(resolvePracticeWorkflowCandidates(settings, "video", "storyboard-video")[0]).toMatchObject({ logicalModelId: "runninghub-demo-storyboard_shot_video" });
        expect(resolvePracticeWorkflowCandidates(settings, "audio", "dubbing")[0]).toMatchObject({ logicalModelId: "runninghub-demo-storyboard_dialogue_audio" });
        expect(resolvePracticeWorkflowCandidates(settings, "text", "script")).toEqual([]);
    });

    it("keeps practice script text on the normal practice logical model route and production on logical routing", () => {
        const base = demoSettings();
        const settings = {
            ...base,
            systemChannels: [...base.systemChannels, { id: "text-practice", name: "文本", baseUrl: "https://text.example", apiKey: "k", apiFormat: "openai" as const, models: ["gpt"], enabled: true, purpose: "open-source-practice" as const }],
            logicalModels: [{ id: "practice-script", name: "剧本", capability: "text" as const, enabled: true, bindings: [{ id: "b", channelId: "text-practice", upstreamModel: "gpt", enabled: true, priority: 1 }] }],
        } as never as Parameters<typeof resolvePracticeGenerationCandidates>[0];
        expect(resolvePracticeGenerationCandidates(settings, "text", "practice-script", { executionProfile: "open-source-practice", businessCode: "script" })[0]).toMatchObject({ logicalModelId: "practice-script", channelId: "text-practice" });
        expect(resolvePracticeGenerationCandidates(settings, "image", "runninghub-demo-storyboard_shot", { executionProfile: "production" })).toEqual([]);
    });
});
