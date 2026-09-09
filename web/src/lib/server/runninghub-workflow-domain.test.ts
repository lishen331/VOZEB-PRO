import { describe, expect, it } from "vitest";

import type { SystemChannelAdvancedConfig } from "@/lib/auth/store";
import { normalizeSettings } from "@/lib/auth/store-normalizers";
import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import {
    nextWorkflowVersion,
    normalizeRunningHubWorkflowConfig,
    resolveEnabledWorkflow,
    runningHubWorkflowConfigFingerprint,
    validateRunningHubWorkflowConfig,
    workflowCapabilityForBusinessCode,
    workflowRequiresRetest,
} from "./runninghub-workflow-domain";

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

    it("removes retired legacy model routing while retaining normalized workflow configs", () => {
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, practiceWorkflowModels: undefined as never }).practiceWorkflowModels).toEqual({});
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, practiceWorkflowModels: { script: "  logical-script ", unknown: "ignored", canvas: 42 } as never }).practiceWorkflowModels).toEqual({});

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
        expect(channel.advancedConfig?.modelConfigs?.["legacy-image"]).toBeUndefined();
        expect(channel.models).toEqual([]);
        expect(channel.advancedConfig?.workflowConfigs).toEqual({});
    });

    it("fills the official protocol defaults and normalizes a missing version for quick configuration", () => {
        const normalized = normalizeRunningHubWorkflowConfig({
            workflowKey: "quick",
            workflowName: "快速配置",
            businessCode: "storyboard-image",
            capability: "image",
            providerType: "runninghub",
            channelId: "rh",
            workflowId: "2087498214948823042",
            enabled: false,
            inputSchema: baseConfig.inputSchema,
            nodeMappings: baseConfig.nodeMappings,
            outputMappings: baseConfig.outputMappings,
        });
        expect(normalized).toMatchObject({ version: 1, createPath: "/task/openapi/create", queryPath: "/openapi/v2/query", taskIdField: "data.taskId", statusField: "data.status", resultField: "data.result", requestTemplate: "{}" });
        expect(validateRunningHubWorkflowConfig(normalized)).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...normalized, version: undefined })).toEqual([]);
    });

    it("uses a stable configuration fingerprint and marks changed mappings as needing a new test", () => {
        const fingerprint = runningHubWorkflowConfigFingerprint(baseConfig);
        expect(runningHubWorkflowConfigFingerprint({ ...baseConfig, inputSchema: [...baseConfig.inputSchema].reverse() })).toBe(fingerprint);
        expect(workflowRequiresRetest({ ...baseConfig, lastTestResult: "success", lastTestConfigFingerprint: fingerprint })).toBe(false);
        expect(workflowRequiresRetest({ ...baseConfig, nodeMappings: [{ ...baseConfig.nodeMappings[0], fieldName: "value" }], lastTestResult: "success", lastTestConfigFingerprint: fingerprint })).toBe(true);
    });

    it("preserves Demo workflow metadata through normalization and fingerprints it", () => {
        const demo = {
            ...baseConfig,
            workflowCode: "storyboard_shot_video",
            adapterType: "storyboard-shot-video",
            adapterVersion: 1,
            workflowApiJson: '{"269":{"class_type":"LoadImage"}}',
            generationSizeOptions: [{ key: "1280x720", label: "1280 x 720", width: 1280, height: 720 }],
            remark: "Demo workflow",
            source: "server-dev:aigc_ai_dev",
            sourceVersion: "server-dev-runninghub-main-verified-20260903-0115",
        };
        const normalized = normalizeRunningHubWorkflowConfig(demo);
        expect(normalized).toMatchObject(demo);
        expect(runningHubWorkflowConfigFingerprint({ ...demo, remark: "first" })).not.toBe(runningHubWorkflowConfigFingerprint({ ...demo, remark: "second" }));
    });

    it("keeps structural validation while treating test evidence as advisory", () => {
        const fingerprint = runningHubWorkflowConfigFingerprint(baseConfig);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, enabled: true })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, enabled: true, workflowJsonFingerprint: "json-1" })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, enabled: true, lastTestResult: "success", lastTestConfigFingerprint: fingerprint })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, enabled: true, lastTestResult: "failed", lastTestConfigFingerprint: fingerprint })).toEqual([]);
        expect(validateRunningHubWorkflowConfig({ ...baseConfig, enabled: true, workflowJsonFingerprint: "json-1", inputSchema: [], nodeMappings: [], outputMappings: [] })).toEqual(expect.arrayContaining([expect.stringContaining("输入映射")]));
    });

    it("resolves an enabled workflow even when it needs a retest", () => {
        expect(resolveEnabledWorkflow([{ ...baseConfig, enabled: true, testRequired: true }], baseConfig.channelId, baseConfig.businessCode)).toMatchObject({ workflowKey: baseConfig.workflowKey, enabled: true });
    });

    it("allows different workflow codes in the same business group to stay enabled", () => {
        const first = { ...baseConfig, workflowKey: "character", workflowCode: "character_main_view", channelId: "rh", enabled: true };
        const second = { ...baseConfig, workflowKey: "prop", workflowCode: "prop_main_view", channelId: "rh", enabled: true };
        expect(validateRunningHubWorkflowConfig(second, [first, second])).toEqual([]);
    });
    it("requires one enabled version per channel and workflow code", () => {
        const configs = {
            first: { ...baseConfig, workflowKey: "first", workflowCode: "storyboard_shot", channelId: "rh", enabled: true },
            second: { ...baseConfig, workflowKey: "second", workflowCode: "storyboard_shot", channelId: "rh", version: 2, enabled: true },
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
