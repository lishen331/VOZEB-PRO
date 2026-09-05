import type { AuthSettings, RunningHubWorkflowConfig, RunningHubWorkflowInputField, RunningHubNodeMapping } from "@/lib/auth/store";

import { buildProviderRequest } from "./provider-task-config";
import { isRunningHubWorkflowBusinessCode, normalizeRunningHubWorkflowConfig, runningHubWorkflowConfigFingerprint, workflowRequiresRetest } from "./runninghub-workflow-domain";

export type { RunningHubWorkflowConfig } from "@/lib/auth/store";

export type RunningHubWorkflowRuntimeInput = {
    config: RunningHubWorkflowConfig;
    businessInput: Record<string, unknown>;
    references: Array<{ type: string; inputKey?: string; url?: string; assetId?: string }>;
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
    return { ...payload, ...(input.config.runOptions ? { runOptions: input.config.runOptions } : {}), workflowId: input.config.workflowId, nodeInfoList };
}

export function recordWorkflowTaskContext(config: RunningHubWorkflowConfig) {
    return { workflowKey: config.workflowKey, workflowVersion: config.version, upstreamWorkflowId: config.workflowId, businessCode: config.businessCode, workflowConfigFingerprint: runningHubWorkflowConfigFingerprint(config) };
}

export function workflowTimeoutMs(config: Pick<RunningHubWorkflowConfig, "timeoutSeconds"> | undefined, fallbackMs: number) {
    return config?.timeoutSeconds && Number.isFinite(config.timeoutSeconds) && config.timeoutSeconds > 0 ? config.timeoutSeconds * 1000 : fallbackMs;
}

export function generationBusinessCode(surface: string | undefined, capability: "text" | "image" | "video" | "audio") {
    if (surface === "drama") return capability === "text" ? "script" : capability === "image" ? "storyboard-image" : capability === "video" ? "storyboard-video" : "dubbing";
    if (surface === "canvas" && capability === "image") return "canvas";
    return undefined;
}

export function workflowTaskContextForChannel(channel: { advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig } | undefined, businessCode?: string) {
    if (!channel || !businessCode) return {};
    const workflow = Object.values(channel.advancedConfig?.workflowConfigs || {})
        .map(normalizeRunningHubWorkflowConfig)
        .filter((item) => item.enabled && item.businessCode === businessCode && !workflowRequiresRetest(item))
        .sort((left, right) => right.version - left.version)[0];
    return workflow ? { ...recordWorkflowTaskContext(workflow), taskOrigin: "user" as const } : {};
}

export function resolvePracticeLogicalModel(
    settings: { practiceWorkflowModels?: Record<string, string | string[] | undefined>; practiceDefaultModels?: Record<string, string | undefined> },
    capability: "text" | "image" | "video" | "audio",
    businessCode: string,
    requestedModel?: string,
) {
    const rawBound = settings.practiceWorkflowModels?.[businessCode];
    const bound = Array.isArray(rawBound) ? rawBound[0] : rawBound;
    if (bound) return bound;
    const key = `${capability}Model`;
    return settings.practiceDefaultModels?.[key] || requestedModel || "";
}

export function attachPracticeWorkflowToChannel<T extends { channelId?: string; logicalModel?: string; advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig }>(
    channel: T,
    settings: Pick<AuthSettings, "practiceWorkflowModels" | "systemChannels">,
    context: { executionProfile?: string; businessCode?: string; workflowKey?: string; workflowVersion?: number },
): T {
    if (context.executionProfile !== "open-source-practice" || !context.businessCode) return channel;
    if (!isRunningHubWorkflowBusinessCode(context.businessCode)) throw new Error("练习工作流业务 code 无效");
    const logicalModelId = channel.logicalModel || "";
    const rawBoundModelId = settings.practiceWorkflowModels[context.businessCode];
    const boundModelId = Array.isArray(rawBoundModelId) ? rawBoundModelId[0] : rawBoundModelId;
    if (boundModelId && boundModelId !== logicalModelId) throw new Error("练习工作流与逻辑模型绑定不匹配");
    const sourceChannel = settings.systemChannels.find((item) => item.id === channel.channelId);
    if (!sourceChannel || sourceChannel.advancedConfig?.protocol !== "runninghub") throw new Error("练习工作流渠道不可用");
    const workflows = Object.values(sourceChannel.advancedConfig.workflowConfigs || {}).map(normalizeRunningHubWorkflowConfig);
    const workflow = context.workflowKey
        ? workflows.find((item) => item.workflowKey === context.workflowKey && item.version === context.workflowVersion && item.businessCode === context.businessCode && item.enabled && !workflowRequiresRetest(item))
        : workflows.filter((item) => item.businessCode === context.businessCode && item.enabled && !workflowRequiresRetest(item)).sort((left, right) => right.version - left.version)[0];
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

export function workflowConfigForTask(task: {
    executionProfile?: string;
    taskOrigin?: string;
    workflowKey?: string;
    workflowVersion?: number;
    workflowConfigFingerprint?: string;
    businessCode?: string;
    config: { channelId?: string; advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig };
}): RunningHubWorkflowConfig | undefined {
    if (task.executionProfile !== "open-source-practice" || (task.taskOrigin && task.taskOrigin !== "user")) return undefined;
    if (!task.workflowKey || !task.workflowVersion || !task.businessCode) return undefined;
    const config = task.config.advancedConfig?.workflowConfigs?.[task.workflowKey];
    if (!config) return undefined;
    const normalized = normalizeRunningHubWorkflowConfig(config);
    return normalized.workflowKey === task.workflowKey &&
        normalized.version === task.workflowVersion &&
        normalized.businessCode === task.businessCode &&
        normalized.enabled &&
        (!task.config.channelId || normalized.channelId === task.config.channelId) &&
        (!task.workflowConfigFingerprint || task.workflowConfigFingerprint === runningHubWorkflowConfigFingerprint(normalized)) &&
        !workflowRequiresRetest(normalized)
        ? normalized
        : undefined;
}

function validateRuntimeInput(config: RunningHubWorkflowConfig, input: Record<string, unknown>, references: RunningHubWorkflowRuntimeInput["references"]) {
    const fields = new Map(config.inputSchema.map((field) => [field.key, field]));
    const errors: string[] = [];

    // 验证 nodeMappings 配置
    for (const mapping of config.nodeMappings) {
        if (!fields.has(mapping.inputKey)) {
            errors.push(`配置错误：节点映射引用了不存在的参数 "${mapping.inputKey}"（请重新读取工作流）`);
        }
    }

    // 验证必填参数
    for (const field of config.inputSchema) {
        const value = resolvedInput(field, input, references);
        const isEmpty = value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);

        if (isEmpty) {
            if (field.required) {
                // 生成友好的错误提示
                const fieldLabel = field.label || field.key;
                const fieldTypeHint = field.type === "image" ? "（需要上传图片）" : field.type === "video" ? "（需要上传视频）" : field.type === "audio" ? "（需要上传音频）" : field.type === "textarea" || field.type === "text" ? "（需要填写文本）" : "";
                errors.push(`缺少必填参数：${fieldLabel}${fieldTypeHint}`);
            }
            continue;
        }

        // 验证类型
        if (!matchesType(field, value)) {
            const fieldLabel = field.label || field.key;
            errors.push(`参数类型错误：${fieldLabel}（期望类型：${field.type}）`);
        }

        // 验证枚举值
        if (field.type === "enum" && field.options && !field.options.includes(String(value))) {
            const fieldLabel = field.label || field.key;
            errors.push(`参数值无效：${fieldLabel}（允许的选项：${field.options.join(", ")}）`);
        }
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
    if (field.type === "image" || field.type === "video" || field.type === "audio") return references.find((reference) => reference.type === field.type && (!reference.inputKey || reference.inputKey === field.key))?.url;
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
