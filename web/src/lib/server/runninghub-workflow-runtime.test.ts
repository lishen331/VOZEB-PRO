import { describe, expect, it } from "vitest";

import type { RunningHubWorkflowConfig } from "@/lib/auth/store";

import {
    attachPracticeWorkflowToChannel,
    buildRunningHubWorkflowPayload,
    generationBusinessCode,
    recordWorkflowTaskContext,
    resolvePracticeLogicalModel,
    workflowConfigForTask,
    workflowTaskContextForChannel,
    workflowTimeoutMs,
} from "./runninghub-workflow-runtime";
import { runningHubWorkflowConfigFingerprint } from "./runninghub-workflow-domain";

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
        expect(() => buildRunningHubWorkflowPayload({ config, businessInput: { steps: 12, draft: true }, references: [] })).toThrow("prompt");
        expect(() =>
            buildRunningHubWorkflowPayload({
                config: { ...config, nodeMappings: [{ ...config.nodeMappings[0], inputKey: "missing" }] },
                businessInput: { prompt: "x", steps: 1, draft: true },
                references: [],
            }),
        ).toThrow("inputKey");
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
                practiceWorkflowModels: { "storyboard-image": ["practice-image"] },
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

    it("rejects a newly discovered workflow until its current mapping fingerprint has a successful test", () => {
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
        expect(() => attachPracticeWorkflowToChannel(channel, settings as never, { executionProfile: "open-source-practice", businessCode: config.businessCode })).toThrow("版本不存在或已停用");
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

    it("uses workflow timeout when scheduling a RunningHub request", () => {
        expect(workflowTimeoutMs(config, 999)).toBe(11_000);
        expect(workflowTimeoutMs({ ...config, timeoutSeconds: undefined }, 999)).toBe(999);
    });

    it("uses the practice script business code for drama text and tolerates no channels", () => {
        expect(generationBusinessCode("drama", "text")).toBe("script");
        expect(workflowTaskContextForChannel(undefined, "script")).toEqual({});
    });

    it("always chooses the server practice model binding for a practice task", () => {
        expect(resolvePracticeLogicalModel({ practiceWorkflowModels: { script: ["practice-script"] }, practiceDefaultModels: { textModel: "practice-default" } } as never, "text", "script", "production-model")).toBe("practice-script");
        expect(resolvePracticeLogicalModel({ practiceWorkflowModels: {}, practiceDefaultModels: { textModel: "practice-default" } } as never, "text", "script", "production-model")).toBe("practice-default");
    });
});
