import { describe, expect, it } from "vitest";

import { runningHubWorkflowConfigFingerprint } from "@/lib/server/runninghub-workflow-domain";
import { resolvePracticeModuleModelOptions } from "@/lib/server/practice-module-service";
import { resolvePracticeModelFromSettings } from "@/lib/server/practice-session-service";
import { DEFAULT_SETTINGS } from "./store-foundation";
import { normalizeSettings } from "./store-normalizers";
import type { AuthSettings, RunningHubWorkflowConfig } from "./store-types";

describe("legacy RunningHub practice workflow routing", () => {
    it("derives a practice model from an already enabled and tested workflow", () => {
        const workflow: RunningHubWorkflowConfig = {
            workflowKey: "runninghub-demo-prop_main_view",
            workflowCode: "prop_main_view",
            workflowName: "道具主视图 v1",
            businessCode: "storyboard-image",
            capability: "image",
            providerType: "runninghub",
            channelId: "rh-practice",
            workflowId: "2090436223860039681",
            version: 1,
            enabled: true,
            testRequired: true,
            createPath: "/task/openapi/create",
            queryPath: "/openapi/v2/query",
            taskIdField: "data.taskId",
            statusField: "data.status",
            resultField: "data.result",
            requestTemplate: "{}",
            inputSchema: [{ key: "prompt", label: "道具描述", type: "textarea", required: true }],
            nodeMappings: [{ paramKey: "prompt", nodeId: "35", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" }],
            outputMappings: [{ key: "image", label: "主图", nodeId: "67", assetType: "IMAGE", required: true, primary: true }],
            lastTestResult: "success",
        };
        workflow.lastTestConfigFingerprint = runningHubWorkflowConfigFingerprint(workflow);
        const normalized = normalizeSettings({
            ...structuredClone(DEFAULT_SETTINGS),
            systemChannels: [
                {
                    id: "rh-practice",
                    name: "RunningHub 无限练习",
                    baseUrl: "https://www.runninghub.cn",
                    apiKey: "secret",
                    apiFormat: "openai",
                    models: [],
                    enabled: true,
                    purpose: "open-source-practice",
                    advancedConfig: {
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
                        supportsReferenceImage: true,
                        supportsReferenceVideo: false,
                        supportsReferenceAudio: false,
                        workflowConfigs: { [workflow.workflowKey]: workflow },
                    },
                },
            ],
            logicalModels: [],
            practiceWorkflowModels: {},
        } as AuthSettings);

        const modelId = "runninghub-workflow-image-rh-practice";
        expect(normalized.practiceWorkflowModels["storyboard-image"]).toEqual([modelId]);
        expect(normalized.systemChannels[0].models).toContain(modelId);
        expect(normalized.logicalModels).toContainEqual(expect.objectContaining({ id: modelId, capability: "image", enabled: true }));
        expect(resolvePracticeModuleModelOptions(normalized, "prop")).toEqual([{ id: modelId, label: "道具主视图 v1" }]);
        expect(resolvePracticeModelFromSettings(normalized, "prop", modelId, "prop_main_view")).toMatchObject({ logicalModelId: modelId, capability: "image", workflow: { workflowCode: "prop_main_view" } });
    });
});
