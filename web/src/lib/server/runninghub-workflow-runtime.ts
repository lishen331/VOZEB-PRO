import type { AuthSettings, RunningHubWorkflowConfig, RunningHubWorkflowInputField, RunningHubNodeMapping } from "@/lib/auth/store";

import { buildProviderRequest } from "./provider-task-config";
import { isRunningHubWorkflowBusinessCode, normalizeRunningHubWorkflowConfig } from "./runninghub-workflow-domain";

export type { RunningHubWorkflowConfig } from "@/lib/auth/store";

export type RunningHubWorkflowRuntimeInput = {
    config: RunningHubWorkflowConfig;
    businessInput: Record<string, unknown>;
    references: Array<{ type: string; url?: string; assetId?: string }>;
};

export function buildRunningHubWorkflowPayload(input: RunningHubWorkflowRuntimeInput): Record<string, unknown> {
    const errors = validateRuntimeInput(input.config, input.businessInput, input.references);
    if (errors.length) throw new Error(errors[0]);
    const values = { ...input.businessInput, references: input.references };
    const nodeInfoList = input.config.nodeMappings.map((mapping) => ({
        nodeId: mapping.nodeId,
        fieldName: mapping.fieldName,
        fieldValue: mappedValue(mapping, input.config.inputSchema, values, input.references),
    }));
    const payload = buildProviderRequest(input.config.requestTemplate, { workflowId: input.config.workflowId, nodeInfoList }, { ...values, workflowId: input.config.workflowId, nodeInfoList });
    return { ...payload, workflowId: input.config.workflowId, nodeInfoList };
}

export function recordWorkflowTaskContext(config: RunningHubWorkflowConfig) {
    return { workflowKey: config.workflowKey, workflowVersion: config.version, upstreamWorkflowId: config.workflowId, businessCode: config.businessCode };
}

export function attachPracticeWorkflowToChannel<T extends { channelId?: string; logicalModel?: string; advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig }>(
    channel: T,
    settings: Pick<AuthSettings, "practiceWorkflowModels" | "systemChannels">,
    context: { executionProfile?: string; businessCode?: string; workflowKey?: string; workflowVersion?: number },
): T {
    if (context.executionProfile !== "open-source-practice" || !context.businessCode || !context.workflowKey) return channel;
    if (!isRunningHubWorkflowBusinessCode(context.businessCode)) throw new Error("练习工作流业务 code 无效");
    const logicalModelId = channel.logicalModel || "";
    const boundModelId = settings.practiceWorkflowModels[context.businessCode];
    if (boundModelId && boundModelId !== logicalModelId) throw new Error("练习工作流与逻辑模型绑定不匹配");
    const sourceChannel = settings.systemChannels.find((item) => item.id === channel.channelId);
    if (!sourceChannel || sourceChannel.advancedConfig?.protocol !== "runninghub") throw new Error("练习工作流渠道不可用");
    const workflow = Object.values(sourceChannel.advancedConfig.workflowConfigs || {})
        .map(normalizeRunningHubWorkflowConfig)
        .find((item) => item.workflowKey === context.workflowKey && item.version === context.workflowVersion && item.businessCode === context.businessCode && item.enabled);
    if (!workflow) throw new Error("练习工作流版本不存在或已停用");
    const advancedConfig = {
        ...(channel.advancedConfig || sourceChannel.advancedConfig),
        protocol: "runninghub" as const,
        createPath: workflow.createPath,
        queryPath: workflow.queryPath,
        taskIdField: workflow.taskIdField,
        statusField: workflow.statusField,
        resultField: workflow.resultField,
        requestTemplate: workflow.requestTemplate,
        workflowConfigs: { ...(channel.advancedConfig?.workflowConfigs || {}), [workflow.workflowKey]: workflow },
    };
    return { ...channel, advancedConfig };
}

export function workflowConfigForTask(task: { workflowKey?: string; workflowVersion?: number; businessCode?: string; config: { advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig } }): RunningHubWorkflowConfig | undefined {
    if (!task.workflowKey || !task.workflowVersion || !task.businessCode) return undefined;
    const config = task.config.advancedConfig?.workflowConfigs?.[task.workflowKey];
    if (!config) return undefined;
    const normalized = normalizeRunningHubWorkflowConfig(config);
    return normalized.workflowKey === task.workflowKey && normalized.version === task.workflowVersion && normalized.businessCode === task.businessCode ? normalized : undefined;
}

function validateRuntimeInput(config: RunningHubWorkflowConfig, input: Record<string, unknown>, references: RunningHubWorkflowRuntimeInput["references"]) {
    const fields = new Map(config.inputSchema.map((field) => [field.key, field]));
    const errors: string[] = [];
    for (const mapping of config.nodeMappings) {
        if (!fields.has(mapping.inputKey)) errors.push(`nodeMappings.inputKey 未知：${mapping.inputKey}`);
    }
    for (const field of config.inputSchema) {
        const value = resolvedInput(field, input, references);
        if (value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length)) {
            if (field.required) errors.push(`inputSchema.${field.key} 为必填项`);
            continue;
        }
        if (!matchesType(field, value)) errors.push(`inputSchema.${field.key} 类型无效`);
        if (field.type === "enum" && field.options && !field.options.includes(String(value))) errors.push(`inputSchema.${field.key} 不在允许选项中`);
    }
    return errors;
}

function mappedValue(mapping: RunningHubNodeMapping, fields: RunningHubWorkflowInputField[], values: Record<string, unknown>, references: RunningHubWorkflowRuntimeInput["references"]) {
    const field = fields.find((item) => item.key === mapping.inputKey);
    if (!field) throw new Error(`nodeMappings.inputKey 未知：${mapping.inputKey}`);
    const raw = resolvedInput(field, values, references);
    if (raw === undefined && mapping.source === "INPUT_OR_DEFAULT") return mapping.defaultValue;
    if (raw === undefined) throw new Error(`inputSchema.${field.key} 为必填项`);
    if (mapping.valueType === "NUMBER") return Number(raw);
    if (mapping.valueType === "BOOLEAN") return Boolean(raw);
    if (mapping.valueType === "JSON") return raw;
    if (Array.isArray(raw)) return raw.join(",");
    return typeof raw === "string" ? raw.trim() : String(raw);
}

function resolvedInput(field: RunningHubWorkflowInputField, input: Record<string, unknown>, references: RunningHubWorkflowRuntimeInput["references"]) {
    if (input[field.key] !== undefined) return input[field.key];
    if (field.type === "image" || field.type === "video" || field.type === "audio") return references.find((reference) => reference.type === field.type)?.url;
    if (field.type === "images")
        return references
            .filter((reference) => reference.type === "image")
            .map((reference) => reference.url || reference.assetId)
            .filter(Boolean);
    return field.defaultValue;
}

function matchesType(field: RunningHubWorkflowInputField, value: unknown) {
    if (field.type === "text" || field.type === "textarea" || field.type === "image" || field.type === "video" || field.type === "audio" || field.type === "enum") return typeof value === "string";
    if (field.type === "images") return Array.isArray(value) && value.every((item) => typeof item === "string");
    if (field.type === "number") return typeof value === "number" && Number.isFinite(value);
    if (field.type === "boolean") return typeof value === "boolean";
    return false;
}
