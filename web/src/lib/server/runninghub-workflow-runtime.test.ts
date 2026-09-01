import { describe, expect, it } from "vitest";

import type { RunningHubWorkflowConfig } from "@/lib/auth/store";

import { attachPracticeWorkflowToChannel, buildRunningHubWorkflowPayload, recordWorkflowTaskContext } from "./runninghub-workflow-runtime";

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
        expect(recordWorkflowTaskContext(config)).toEqual({ workflowKey: "practice-image", workflowVersion: 3, upstreamWorkflowId: "workflow-image", businessCode: "storyboard-image" });
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
                practiceWorkflowModels: { "storyboard-image": "practice-image" },
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
});
