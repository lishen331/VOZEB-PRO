import { describe, expect, it } from "vitest";

import type { SystemChannelAdvancedConfig } from "@/lib/auth/store";
import { normalizeSettings } from "@/lib/auth/store-normalizers";
import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import { nextWorkflowVersion, normalizeRunningHubWorkflowConfig, resolveEnabledWorkflow, validateRunningHubWorkflowConfig, workflowCapabilityForBusinessCode } from "./runninghub-workflow-domain";

const baseConfig = {
    workflowKey: "practice-image",
    workflowName: "练习图片",
    businessCode: "storyboard-image" as const,
    capability: "image" as const,
    providerType: "runninghub" as const,
    channelId: "rh-practice",
    workflowId: "wf-image",
    version: 1,
    enabled: false,
    createPath: "/task/create",
    queryPath: "/task/query",
    taskIdField: "data.taskId",
    statusField: "data.status",
    resultField: "data.result",
    requestTemplate: '{"workflowId":"{{workflowId}}"}',
    inputSchema: [{ key: "prompt", label: "提示词", type: "textarea" as const, required: true }],
    nodeMappings: [{ paramKey: "prompt", nodeId: "87", fieldName: "text", valueType: "STRING" as const, source: "INPUT" as const, inputKey: "prompt" }],
    outputMappings: [{ key: "image", label: "图片", nodeId: "90", assetType: "IMAGE" as const, required: true, primary: true }],
};

describe("RunningHub workflow domain", () => {
    it("maps each infinite-practice business code to its only supported capability", () => {
        expect(workflowCapabilityForBusinessCode("script")).toBe("text");
        expect(workflowCapabilityForBusinessCode("storyboard-image")).toBe("image");
        expect(workflowCapabilityForBusinessCode("storyboard-video")).toBe("video");
        expect(workflowCapabilityForBusinessCode("dubbing")).toBe("audio");
        expect(workflowCapabilityForBusinessCode("music")).toBe("audio");
        expect(workflowCapabilityForBusinessCode("canvas")).toBe("image");
        expect(workflowCapabilityForBusinessCode("drama")).toBe("text");
        expect(workflowCapabilityForBusinessCode("drama-lab" as never)).toBeUndefined();
    });

    it("accepts text for script and audio for dubbing/music but rejects arbitrary capability pairs", () => {
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, businessCode: "script", capability: "text" })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, businessCode: "dubbing", capability: "audio" })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, businessCode: "music", capability: "audio" })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, businessCode: "script", capability: "image" })).toEqual(expect.arrayContaining([expect.stringContaining("capability")]));
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, businessCode: "drama", capability: "text" })).toEqual([]);
    });

    it("rejects malformed mappings, unknown fields, mismatched capability, and non-positive versions with field paths", () => {
        const errors = validateRunningHubWorkflowConfig({
            ...baseConfig,
            businessCode: "dubbing",
            capability: "image",
            version: 0,
            inputSchema: [{ key: "", label: "", type: "unknown", required: true }],
            nodeMappings: [{ ...baseConfig.nodeMappings[0], inputKey: "missing", valueType: "FLOAT" }],
            outputMappings: [
                { ...baseConfig.outputMappings[0], key: "" },
                { ...baseConfig.outputMappings[0], key: "image", assetType: "MODEL" },
            ],
        });

        expect(errors.join("\n")).toEqual(expect.stringContaining("businessCode"));
        expect(errors.join("\n")).toEqual(expect.stringContaining("capability"));
        expect(errors.join("\n")).toEqual(expect.stringContaining("version"));
        expect(errors.join("\n")).toEqual(expect.stringContaining("inputSchema[0].type"));
        expect(errors.join("\n")).toEqual(expect.stringContaining("nodeMappings[0].inputKey"));
        expect(errors.join("\n")).toEqual(expect.stringContaining("outputMappings[1].assetType"));
    });

    it("normalizes an empty/legacy workflow config without mutating unknown legacy model fields", () => {
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, practiceWorkflowModels: undefined as never }).practiceWorkflowModels).toEqual({});
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, practiceWorkflowModels: { script: "  logical-script ", unknown: "ignored", canvas: 42 } as never }).practiceWorkflowModels).toEqual({ script: "logical-script" });

        const normalized = normalizeRunningHubWorkflowConfig({
            ...baseConfig,
            workflowName: "  图片工作流 ",
            createPath: "task/create",
            inputSchema: [{ ...baseConfig.inputSchema[0], defaultValue: "  " }],
            unknownLegacyField: { keep: true },
        } as never);

        expect(normalized).toMatchObject({ workflowName: "图片工作流", createPath: "/task/create" });
        expect(normalized).not.toHaveProperty("unknownLegacyField");

        const oldChannel = {
            protocol: "runninghub" as const,
            textModel: "",
            imageModel: "legacy-image",
            videoModel: "",
            createPath: "/legacy/create",
            queryPath: "/legacy/query",
            requestTemplate: "{}",
            resultField: "data.result",
            statusField: "data.status",
            durationRange: "",
            referenceRule: "",
            supportsReferenceImage: false,
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
            modelConfigs: { "legacy-image": { capability: "image" as const, createPath: "/create" } },
        } satisfies SystemChannelAdvancedConfig;
        const channel = normalizeSettings({ ...DEFAULT_SETTINGS, systemChannels: [{ id: "legacy", name: "legacy", baseUrl: "https://example.test", apiKey: "", apiFormat: "openai", models: ["legacy-image"], enabled: true, advancedConfig: oldChannel }] })
            .systemChannels[0];
        expect(channel.advancedConfig?.modelConfigs?.["legacy-image"]).toMatchObject({ capability: "image", createPath: "/create" });
        expect(channel.advancedConfig?.workflowConfigs).toEqual({});
    });

    it("requires one enabled version per channel and business code", () => {
        const configs = {
            first: { ...baseConfig, workflowKey: "first", channelId: "rh", enabled: true },
            second: { ...baseConfig, workflowKey: "second", channelId: "rh", version: 2, enabled: true },
            otherChannel: { ...baseConfig, workflowKey: "other", channelId: "rh-2", enabled: true },
        };
        expect(validateRunningHubWorkflowConfig(configs.second, Object.values(configs))).toEqual(expect.arrayContaining([expect.stringContaining("enabled")]));
        expect(resolveEnabledWorkflow(Object.values(configs), "rh", "storyboard-image")).toMatchObject({ workflowKey: "second", version: 2 });
        expect(resolveEnabledWorkflow(Object.values(configs), "missing", "storyboard-image")).toBeUndefined();
    });

    it("increments only the highest version for a channel and business code", () => {
        expect(nextWorkflowVersion([], "rh", "script")).toBe(1);
        expect(nextWorkflowVersion([{ ...baseConfig, channelId: "rh", businessCode: "script", version: 4 }], "rh", "script")).toBe(5);
        expect(nextWorkflowVersion([{ ...baseConfig, channelId: "rh-2", businessCode: "script", version: 9 }], "rh", "script")).toBe(1);
    });
});
