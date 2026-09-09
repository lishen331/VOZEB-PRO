import type { AuthSettings, RunningHubWorkflowConfig, SystemModelChannel } from "@/lib/auth/store";
import type { LogicalModelCapability } from "@/lib/auth/store";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
import { resolveLogicalModelCandidates, type ResolvedLogicalModel } from "./logical-model-router";
import { resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";

import { prepareRunningHubWorkflowExecution } from "./runninghub-workflow-adapter";
import { isRunningHubWorkflowBusinessCode, normalizeRunningHubWorkflowConfig, runningHubWorkflowConfigFingerprint } from "./runninghub-workflow-domain";

export type { RunningHubWorkflowConfig } from "@/lib/auth/store";

export type RunningHubWorkflowRuntimeInput = {
    config: RunningHubWorkflowConfig;
    businessInput: Record<string, unknown>;
    references: Array<{ type: string; inputKey?: string; url?: string; assetId?: string }>;
};

export type PracticeWorkflowContext = {
    executionProfile?: string;
    businessCode?: string;
    workflowCode?: string;
    workflowKey?: string;
    workflowVersion?: number;
    workflowConfigFingerprint?: string;
};

/**
 * Demo 七条工作流中，当练习上下文没有显式 workflowCode 时按业务 code 选用的缺省工作流。
 * 角色/场景/道具练习必须由练习会话显式携带 workflowCode，这里只兜底分镜/配音链路。
 */
const DEFAULT_WORKFLOW_CODE_BY_BUSINESS_CODE: Partial<Record<string, string>> = {
    "storyboard-image": "storyboard_shot",
    canvas: "storyboard_shot",
    "storyboard-video": "storyboard_shot_video",
    dubbing: "storyboard_dialogue_audio",
};

export function practiceWorkflowCodeForContext(context: Pick<PracticeWorkflowContext, "businessCode" | "workflowCode">) {
    const explicit = typeof context.workflowCode === "string" ? context.workflowCode.trim() : "";
    if (explicit) return explicit;
    return (context.businessCode && DEFAULT_WORKFLOW_CODE_BY_BUSINESS_CODE[context.businessCode]) || "";
}

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
    persisted?: { workflowKey?: string; workflowVersion?: number; workflowConfigFingerprint?: string; workflowCode?: string },
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
                  (!persisted.workflowConfigFingerprint || runningHubWorkflowConfigFingerprint(item) === persisted.workflowConfigFingerprint),
          )
        : selectEnabledWorkflowByCode(workflows, { businessCode, workflowCode: persisted?.workflowCode });
    return workflow ? { ...recordWorkflowTaskContext(workflow), taskOrigin: "user" as const } : {};
}

/**
 * 显式 workflowCode 必须精确匹配；没有显式 code 时先尝试业务 code 的缺省 Demo 工作流，
 * 缺省工作流不存在（例如非 Demo 的自定义工作流）才回退到同业务 code 的最新启用版本。
 */
function selectEnabledWorkflowByCode(workflows: RunningHubWorkflowConfig[], context: Pick<PracticeWorkflowContext, "businessCode" | "workflowCode">) {
    const enabled = workflows.filter((item) => item.enabled).sort((left, right) => right.version - left.version);
    const explicit = typeof context.workflowCode === "string" ? context.workflowCode.trim() : "";
    if (explicit) return enabled.find((item) => (item.workflowCode || item.workflowKey) === explicit);
    const fallbackCode = practiceWorkflowCodeForContext(context);
    return (fallbackCode ? enabled.find((item) => (item.workflowCode || item.workflowKey) === fallbackCode) : undefined) || enabled.find((item) => item.businessCode === context.businessCode);
}

/**
 * 与 Demo 一致：工作流的参考素材能力由 inputSchema 里的 image/images/video/audio 字段决定，
 * 不再依赖渠道或伪模型上的 supportsReference* 开关。
 */
export function workflowReferenceSupport(workflow: Pick<RunningHubWorkflowConfig, "inputSchema">) {
    const types = new Set(workflow.inputSchema.map((field) => field.type));
    return {
        supportsReferenceImage: types.has("image") || types.has("images"),
        supportsReferenceVideo: types.has("video"),
        supportsReferenceAudio: types.has("audio"),
    };
}

function runningHubPracticeChannels(settings: Pick<AuthSettings, "systemChannels">) {
    return settings.systemChannels.filter((channel) => channel.enabled && channel.purpose === "open-source-practice" && channel.advancedConfig?.protocol === "runninghub");
}

/**
 * 无限练习按精确 workflowCode 选择已启用的 RunningHub 工作流，并把工作流本身伪装成一个候选渠道。
 * 这里不读取 channel.models、logicalModels 或任何练习模型绑定；找不到工作流时返回空数组，不回退普通模型。
 */
export function resolvePracticeWorkflowCandidates(settings: Pick<AuthSettings, "systemChannels">, capability: LogicalModelCapability, businessCode: string, workflowCode?: string): ResolvedLogicalModel[] {
    const explicit = typeof workflowCode === "string" ? workflowCode.trim() : "";
    const fallbackCode = explicit ? "" : practiceWorkflowCodeForContext({ businessCode });
    if (!explicit && !fallbackCode && !businessCode) return [];
    const enabled = runningHubPracticeChannels(settings)
        .flatMap((channel) => Object.values(channel.advancedConfig?.workflowConfigs || {}).map((raw) => ({ channel, workflow: normalizeRunningHubWorkflowConfig(raw) })))
        .filter(({ workflow }) => workflow.enabled && workflow.capability === capability)
        .sort((left, right) => right.workflow.version - left.workflow.version);
    const byCode = (code: string) => enabled.filter(({ workflow }) => (workflow.workflowCode || workflow.workflowKey) === code);
    const matched = explicit ? byCode(explicit) : fallbackCode && byCode(fallbackCode).length ? byCode(fallbackCode) : enabled.filter(({ workflow }) => workflow.businessCode === businessCode);
    return matched.map(({ channel, workflow }) => ({
        logicalModelId: workflow.workflowKey,
        upstreamModel: workflow.workflowKey,
        channelId: channel.id,
        channel: { ...channel, models: [workflow.workflowKey] } as SystemModelChannel,
        capabilityProfile: resolveLogicalModelCapabilityProfile({ capabilityProfile: { ...workflowReferenceSupport(workflow), supportsAsync: true } }, capability, channel, workflow.workflowKey),
    }));
}

/**
 * 任务 Route Handler 的统一候选入口：
 * - 正式生产：沿用逻辑模型路由；
 * - 无限练习的图片/视频/音频：只走 RunningHub 工作流，不回退普通模型；
 * - 无限练习的文本（剧本）：Demo 没有文本工作流，继续使用练习用途的普通逻辑模型。
 */
export function resolvePracticeGenerationCandidates(settings: Pick<AuthSettings, "logicalModels" | "systemChannels">, capability: LogicalModelCapability, requestedModel: string, context: PracticeWorkflowContext | undefined): ResolvedLogicalModel[] {
    const executionProfile: PracticeExecutionProfile = context?.executionProfile === "open-source-practice" ? "open-source-practice" : "production";
    if (executionProfile !== "open-source-practice") return resolveLogicalModelCandidates(settings, capability, requestedModel, "", executionProfile);
    if (capability === "text" && !context?.workflowKey && !context?.workflowCode) return resolveLogicalModelCandidates(settings, capability, requestedModel, "", executionProfile);
    return resolvePracticeWorkflowCandidates(settings, capability, context?.businessCode || "", context?.workflowCode);
}

export function attachPracticeWorkflowToChannel<T extends { channelId?: string; logicalModel?: string; advancedConfig?: import("@/lib/auth/store").SystemChannelAdvancedConfig }>(
    channel: T,
    settings: Pick<AuthSettings, "systemChannels">,
    context: PracticeWorkflowContext,
): T {
    if (context.executionProfile !== "open-source-practice" || !context.businessCode) return channel;
    if (!isRunningHubWorkflowBusinessCode(context.businessCode)) throw new Error("练习工作流业务 code 无效");
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
                  (!context.workflowConfigFingerprint || runningHubWorkflowConfigFingerprint(item) === context.workflowConfigFingerprint),
          )
        : selectEnabledWorkflowByCode(workflows, context);
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
        // 参考图/视频/音频能力按工作流输入定义声明，否则任务 Route 的 assertReferenceCapabilities 会拒绝带参考素材的练习请求
        ...workflowReferenceSupport(workflow),
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
        (!task.workflowConfigFingerprint || task.workflowConfigFingerprint === runningHubWorkflowConfigFingerprint(normalized))
        ? normalized
        : undefined;
}
