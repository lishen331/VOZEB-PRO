import { describe, expect, it } from "vitest";

import { runningHubWorkflowConfigFingerprint } from "@/lib/server/runninghub-workflow-domain";
import { resolvePracticeModuleModelOptions } from "@/lib/server/practice-module-service";
import { resolvePracticeModelFromSettings } from "@/lib/server/practice-session-service";
import { DEFAULT_SETTINGS } from "./store-foundation";
import { normalizeSettings } from "./store-normalizers";
import type { AuthSettings, RunningHubWorkflowConfig } from "./store-types";

describe("RunningHub practice workflow cleanup", () => {
    it("clears legacy pseudo-models while preserving the workflow configuration", () => {
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

        expect(normalized.systemChannels[0].purpose).toBe("open-source-practice");
        expect(normalized.systemChannels[0].models).toEqual([]);
        expect(normalized.systemChannels[0].advancedConfig?.workflowConfigs).toHaveProperty(workflow.workflowKey);
        expect(normalized.practiceWorkflowModels).toEqual({});
        expect(normalized.logicalModels).toEqual([]);
        expect(resolvePracticeModuleModelOptions(normalized, "prop")).toEqual([{ id: workflow.workflowKey, label: workflow.workflowName }]);
        expect(() => resolvePracticeModelFromSettings(normalized, "prop", "ignored-model", "prop_main_view")).not.toThrow();
    });
});
