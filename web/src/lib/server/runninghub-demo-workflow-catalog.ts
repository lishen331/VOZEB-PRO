import demoData from "./runninghub-demo-workflows.json";

import type { LogicalModelCapability, RunningHubWorkflowAdapterType, RunningHubWorkflowConfig, RunningHubWorkflowInputField } from "@/lib/auth/store-types";

type DemoWorkflow = {
    workflowCode: string;
    workflowName: string;
    runninghubWorkflowId: string;
    inputSchema: DemoInputField[];
    nodeMappings: DemoNodeMapping[];
    outputMappings: DemoOutputMapping[];
    generationSizeOptions: Array<{ width: number; height: number; disabled?: boolean }>;
    workflowApiJson: string;
    remark: string;
    timeoutSeconds: number;
};
type DemoInputField = {
    key: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
    defaultValue?: string | number | boolean | null;
    description?: string;
    placeholder?: string;
    sampleValue?: string | number | boolean | null;
    min?: number;
    max?: number;
    maxLength?: number;
    uploadPolicy?: "IMAGE" | "VIDEO" | "AUDIO";
    group?: string;
    order?: number;
    widget?: string;
};
type DemoNodeMapping = {
    paramKey?: string;
    nodeId: string;
    fieldName: string;
    valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
    source: "INPUT" | "INPUT_OR_DEFAULT";
    inputKey: string;
    defaultValue?: string | number | boolean | null;
    description?: string;
};
type DemoOutputMapping = {
    key: string;
    label: string;
    nodeId?: string;
    assetType: "IMAGE" | "VIDEO" | "AUDIO" | "TEXT";
    required: boolean;
    primary?: boolean;
    matchMode?: string;
    mirrorToOss?: boolean;
};

const BUSINESS_CODE_BY_WORKFLOW: Record<string, { businessCode: RunningHubWorkflowConfig["businessCode"]; capability: LogicalModelCapability; adapterType: RunningHubWorkflowAdapterType }> = {
    character_main_view: { businessCode: "storyboard-image", capability: "image", adapterType: "character-main-view" },
    character_multi_view: { businessCode: "storyboard-image", capability: "image", adapterType: "character-multi-view" },
    scene_main_view: { businessCode: "storyboard-image", capability: "image", adapterType: "scene-main-view" },
    prop_main_view: { businessCode: "storyboard-image", capability: "image", adapterType: "prop-main-view" },
    storyboard_shot: { businessCode: "storyboard-image", capability: "image", adapterType: "storyboard-shot" },
    storyboard_dialogue_audio: { businessCode: "dubbing", capability: "audio", adapterType: "storyboard-dialogue-audio" },
    storyboard_shot_video: { businessCode: "storyboard-video", capability: "video", adapterType: "storyboard-shot-video" },
};

export function demoRunningHubWorkflowCatalog(): RunningHubWorkflowConfig[] {
    return (demoData.workflows as unknown as DemoWorkflow[]).map((workflow) => {
        const route = BUSINESS_CODE_BY_WORKFLOW[workflow.workflowCode];
        if (!route) throw new Error(`未知 RunningHub Demo workflowCode: ${workflow.workflowCode}`);
        return {
            workflowKey: `runninghub-demo-${workflow.workflowCode}`,
            workflowCode: workflow.workflowCode,
            workflowName: workflow.workflowName,
            businessCode: route.businessCode,
            capability: route.capability,
            adapterType: route.adapterType,
            adapterVersion: 1,
            providerType: "runninghub",
            channelId: "",
            workflowId: workflow.runninghubWorkflowId,
            version: 1,
            enabled: false,
            testRequired: true,
            createPath: "/task/openapi/create",
            queryPath: "/openapi/v2/query",
            taskIdField: "data.taskId",
            statusField: "data.status",
            resultField: "data.result",
            requestTemplate: "{}",
            inputSchema: workflow.inputSchema.map(normalizeInputField),
            nodeMappings: workflow.nodeMappings.map((mapping) => ({
                paramKey: mapping.paramKey || mapping.inputKey,
                nodeId: mapping.nodeId,
                fieldName: mapping.fieldName,
                valueType: mapping.valueType,
                source: mapping.source,
                inputKey: mapping.inputKey,
                ...(mapping.defaultValue !== undefined ? { defaultValue: mapping.defaultValue } : {}),
                ...(mapping.description ? { description: mapping.description } : {}),
            })),
            outputMappings: workflow.outputMappings.map((mapping) => ({
                key: mapping.key,
                label: mapping.label,
                assetType: mapping.assetType,
                required: mapping.required,
                ...(mapping.nodeId ? { nodeId: mapping.nodeId } : {}),
                ...(mapping.primary !== undefined ? { primary: mapping.primary } : {}),
                ...(mapping.matchMode ? { matchMode: mapping.matchMode } : {}),
                ...(mapping.mirrorToOss !== undefined ? { mirrorToOss: mapping.mirrorToOss } : {}),
            })),
            generationSizeOptions: workflow.generationSizeOptions.map((option) => ({
                key: `${option.width}x${option.height}`,
                label: `${option.width} x ${option.height}`,
                width: option.width,
                height: option.height,
                disabled: option.disabled,
            })),
            workflowApiJson: workflow.workflowApiJson,
            source: "server-dev:aigc_ai_dev",
            sourceVersion: "server-dev-runninghub-main-verified-20260903-0115",
            remark: workflow.remark,
            timeoutSeconds: workflow.timeoutSeconds,
        };
    });
}

function normalizeInputField(field: DemoInputField): RunningHubWorkflowInputField {
    const type: RunningHubWorkflowInputField["type"] = field.type === "image_url" ? "image" : field.type === "audio_url" ? "audio" : field.type === "string" ? (field.widget === "textarea" ? "textarea" : "text") : field.type === "boolean" ? "boolean" : field.type === "number" ? "number" : "text";
    return {
        key: field.key,
        label: field.label,
        type,
        required: field.required,
        ...(field.options?.length ? { options: field.options } : {}),
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
        ...(field.description ? { description: field.description } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.sampleValue !== undefined ? { sampleValue: field.sampleValue } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
        ...(field.uploadPolicy ? { uploadPolicy: field.uploadPolicy } : {}),
        ...(field.group ? { group: field.group } : {}),
        ...(field.order !== undefined ? { order: field.order } : {}),
        ...(field.widget ? { widget: field.widget } : {}),
    };
}
