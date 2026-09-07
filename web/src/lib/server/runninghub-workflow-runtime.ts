import type { AuthSettings, RunningHubWorkflowConfig } from "@/lib/auth/store";

import { prepareRunningHubWorkflowExecution } from "./runninghub-workflow-adapter";
import { isRunningHubWorkflowBusinessCode, normalizeRunningHubWorkflowConfig, runningHubWorkflowConfigFingerprint, workflowRequiresRetest } from "./runninghub-workflow-domain";

export type { RunningHubWorkflowConfig } from "@/lib/auth/store";

export type RunningHubWorkflowRuntimeInput = {
    config: RunningHubWorkflowConfig;
    businessInput: Record<string, unknown>;
    references: Array<{ type: string; inputKey?: string; url?: string; assetId?: string }>;
};

export function buildRunningHubWorkflowPayload(input: RunningHubWorkflowRuntimeInput): Record<string, unknown> {
    return prepareRunningHubWorkflowExecution(input).payload;
}

export function recordWorkflowTaskContext(config: RunningHubWorkflowConfig) {
    return {
        workflowKey: config.workflowKey,
        workflowVersion: config.version,
        upstreamWorkflowId: config.workflowId,
        workflowCode: config.workflowCode || config.workflowKey,
        workflowAdapterVersion: config.adapterVersion || 1,
        businessCode: config.businessCode,
        workflowConfigFingerprint: runningHubWorkflowConfigFingerprint(config),
    };
}

export function workflowTimeoutMs(config: Pick<RunningHubWorkflowConfig, "timeoutSeconds"> | undefined, fallbackMs: number) {
    return config?.timeoutSeconds && Number.isFinite(config.timeoutSeconds) && config.timeoutSeconds > 0 ? config.timeoutSeconds * 1000 : fallbackMs;
}

export function generationBusinessCode(surface: string | undefined, capability: "text" | "image" | "video" | "audio") {
    if (surface === "drama") return capability === "text" ? "script" : capability === "image" ? "storyboard-image" : capability === "video" ? "storyboard-video" : "dubbing";
    if (surface === "canvas" && capability === "image") return "canvas";
    return undefined;
}

export function workflowTaskContextForChannel(
    channel: { advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig } | undefined,
    businessCode?: string,
    persisted?: { workflowKey?: string; workflowVersion?: number; workflowConfigFingerprint?: string },
) {
    if (!channel || !businessCode) return {};
    const workflows = Object.values(channel.advancedConfig?.workflowConfigs || {}).map(normalizeRunningHubWorkflowConfig);
    const workflow = persisted?.workflowKey
        ? workflows.find(
              (item) =>
                  item.workflowKey === persisted.workflowKey &&
                  item.version === persisted.workflowVersion &&
                  item.businessCode === businessCode &&
                  item.enabled &&
                  !workflowRequiresRetest(item) &&
                  (!persisted.workflowConfigFingerprint || runningHubWorkflowConfigFingerprint(item) === persisted.workflowConfigFingerprint),
          )
        : workflows.filter((item) => item.enabled && item.businessCode === businessCode && !workflowRequiresRetest(item)).sort((left, right) => right.version - left.version)[0];
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
    context: { executionProfile?: string; businessCode?: string; workflowKey?: string; workflowVersion?: number; workflowConfigFingerprint?: string },
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
        ? workflows.find(
              (item) =>
                  item.workflowKey === context.workflowKey &&
                  item.version === context.workflowVersion &&
                  item.businessCode === context.businessCode &&
                  item.enabled &&
                  !workflowRequiresRetest(item) &&
                  (!context.workflowConfigFingerprint || runningHubWorkflowConfigFingerprint(item) === context.workflowConfigFingerprint),
          )
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
