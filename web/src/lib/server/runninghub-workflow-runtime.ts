import type { AuthSettings, LogicalModel, PracticeModelPoolConfig, PracticePoolKind, RunningHubWorkflowConfig, SystemModelChannel } from "@/lib/auth/store";
import type { LogicalModelCapability } from "@/lib/auth/store";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
import { resolveLogicalModelCandidates, type ResolvedLogicalModel } from "./logical-model-router";
import { channelEnabledForSurface, channelModelCapability, channelUsableForSurface, resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";
import { channelSupportsModel, rawModelName } from "./generation-channel";
import { channelConnectionReady } from "@/lib/channel-protocol-registry";

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
    /**
     * 仅由任务 Route 在服务端按角色权限填入，前端传入的同名字段一律丢弃。
     * 为真时，练习画布允许请求练习池里的真实上游模型，而不是只能用虚拟模型名。
     */
    practiceModelTest?: boolean;
    /**
     * 本次请求是否携带了图片/视频参考。由服务端从已净化的消息内容判定，
     * 与正式生产一致：带图的文本请求走 vision 池（文本模型里支持图片输入的那部分）。
     */
    requiresImageInput?: boolean;
};

/**
 * Demo 七条工作流中，当练习上下文没有显式 workflowCode 时按业务 code 选用的缺省工作流。
 * 角色/场景/道具练习必须由练习会话显式携带 workflowCode，这里只兜底分镜/配音链路。
 */
const PRACTICE_CANVAS_VIRTUAL_MODELS: Record<string, LogicalModelCapability> = {
    gamaimage: "image",
    gamavideo: "video",
    gamatext: "text",
};

/** 练习画布的虚拟模型名。普通用户只能请求这些名字，后端从练习池里随机挑渠道。 */
export function practiceCanvasVirtualModel(capability: LogicalModelCapability) {
    return Object.entries(PRACTICE_CANVAS_VIRTUAL_MODELS).find(([, value]) => value === capability)?.[0] || "";
}

/**
 * 练习画布的虚拟模型名。普通用户只能请求这三个名字，后端从练习池里随机挑渠道；
 * 名字本身不是逻辑模型，正式路由解析不到它们。
 */
export function practiceCanvasVirtualCapability(model: string): LogicalModelCapability | undefined {
    return PRACTICE_CANVAS_VIRTUAL_MODELS[rawModelName(model).toLowerCase()];
}

/**
 * 练习池里具备指定能力的渠道候选。不走逻辑模型绑定：练习画布没有逻辑模型，
 * 直接按渠道 purpose 与模型能力展开，并用随机顺序让每次请求命中不同渠道。
 * 返回全部候选而不是只返回一个，让调用方沿用现有的健康检查与故障转移。
 */
export function resolvePracticeCanvasPoolCandidates(settings: Pick<AuthSettings, "logicalModels" | "systemChannels" | "practiceModelPool">, capability: LogicalModelCapability, requestedModel = "", requiresImageInput = false): ResolvedLogicalModel[] {
    const candidates = practiceCanvasPoolCandidates(settings, capability, requestedModel, requiresImageInput);
    for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
    }
    return candidates;
}

/** 练习池里某类能力的上游模型，按名字去重并保持渠道配置顺序，供测试权限的模型下拉使用。 */
export function listPracticeCanvasPoolModels(settings: Pick<AuthSettings, "logicalModels" | "systemChannels">, capability: LogicalModelCapability) {
    const seen = new Set<string>();
    return practiceCanvasPoolCandidates(settings, capability).flatMap((candidate) => {
        const name = candidate.upstreamModel;
        const key = name.toLowerCase();
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ id: name, name }];
    });
}

/**
 * 与系统代理同规则：存在启用的逻辑模型，且它对该渠道该上游模型的绑定启用。
 * 不满足时代理返回 403「未绑定可用逻辑模型」，所以池子展示和练习路由都要提前排除。
 */
export function channelModelBoundForPractice(logicalModels: LogicalModel[] | undefined, channelId: string, upstreamModel: string) {
    const normalized = upstreamModel.trim().replace(/^models\//i, "").toLowerCase();
    if (!normalized) return false;
    return (logicalModels || []).some(
        (logical) => logical.enabled && logical.bindings.some((binding) => binding.enabled && binding.channelId === channelId && binding.upstreamModel.trim().replace(/^models\//i, "").toLowerCase() === normalized),
    );
}

/** 池子里某个模型是否被勾选：优先查该能力的池，没有配置该池则回退旧的平面表，最后默认包含。 */
export function practicePoolIncludes(pool: PracticeModelPoolConfig | undefined, kind: PracticePoolKind, modelKey: string): boolean {
    const scoped = pool?.pools?.[kind];
    if (scoped && typeof scoped[modelKey] === "boolean") return scoped[modelKey];
    if (pool?.models && typeof pool.models[modelKey] === "boolean") return pool.models[modelKey];
    return true;
}

/** 按池收集候选；kind 与模型能力必须匹配，vision 额外要求声明了图片输入。 */
function collectPracticePoolCandidates(settings: Pick<AuthSettings, "logicalModels" | "systemChannels" | "practiceModelPool">, capability: LogicalModelCapability, kind: PracticePoolKind, requestedModel: string): ResolvedLogicalModel[] {
    return settings.systemChannels
        .filter((channel) => channelUsableForSurface(channel, "open-source-practice"))
        .flatMap((channel) =>
            channel.models
                .filter((model) => {
                    const modelName = rawModelName(model).toLowerCase();
                    if (kind === "vision" ? channelModelCapability(channel, model) !== "text" : channelModelCapability(channel, model) !== capability) return false;
                    if (kind === "vision" && resolveLogicalModelCapabilityProfile({}, "text", channel, rawModelName(model))?.supportsImageInput !== true) return false;
                    if (!practicePoolIncludes(settings.practiceModelPool, kind, modelName)) return false;
                    // 与系统代理同规则：逻辑模型停用、或该渠道的绑定没开，代理会 403，不能放进池子。
                    if (!channelModelBoundForPractice(settings.logicalModels, channel.id, rawModelName(model))) return false;
                    return !requestedModel || channelSupportsModel([model], requestedModel);
                })
                .map((model) => ({
                    logicalModelId: rawModelName(model),
                    upstreamModel: rawModelName(model),
                    channelId: channel.id,
                    channel,
                    capabilityProfile: resolveLogicalModelCapabilityProfile({}, capability, channel, rawModelName(model)),
                })),
        );
}

function practiceCanvasPoolCandidates(settings: Pick<AuthSettings, "logicalModels" | "systemChannels" | "practiceModelPool">, capability: LogicalModelCapability, requestedModel = "", requiresImageInput = false): ResolvedLogicalModel[] {
    // 文本请求按是否带图选池：带图的优先走 vision（文本模型里支持图片输入的那部分）。
    // vision 池空时回落到文本池——否则「图片理解池没配」会让所有带参考图的练习请求直接失败。
    if (capability === "text" && requiresImageInput) {
        const visionCandidates = collectPracticePoolCandidates(settings, capability, "vision", requestedModel);
        if (visionCandidates.length) return visionCandidates;
    }
    return collectPracticePoolCandidates(settings, capability, capability as PracticePoolKind, requestedModel);
}

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

export function generationBusinessCode(surface: string | undefined, capability: "text" | "image" | "video" | "audio", requestedModel = "") {
    if (surface === "drama") return capability === "text" ? "script" : capability === "image" ? "storyboard-image" : capability === "video" ? "storyboard-video" : "dubbing";
    // 画布练习默认走练习模型池（gamaimage 等虚拟模型名），不补 RunningHub 业务码，
    // 否则普通渠道会被判成「练习工作流渠道不可用」。只有请求明确点名工作流时才补。
    if (surface === "canvas" && capability === "image" && rawModelName(requestedModel) && !practiceCanvasVirtualCapability(requestedModel)) return "canvas";
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
    return settings.systemChannels.filter((channel) => channelEnabledForSurface(channel, "open-source-practice") && channel.advancedConfig?.protocol === "runninghub");
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
 * - 无限练习的文本（剧本）：Demo 没有文本工作流，继续使用练习用途的普通逻辑模型；
 * - 练习画布：请求虚拟模型名时从练习池随机选渠道；持有测试权限时允许指定池内真实模型。
 *   其余请求保持原样，避免影响短剧练习的工作流路由。
 */
export function resolvePracticeGenerationCandidates(
    settings: Pick<AuthSettings, "logicalModels" | "systemChannels" | "practiceModelPool">,
    capability: LogicalModelCapability,
    requestedModel: string,
    context: PracticeWorkflowContext | undefined,
): ResolvedLogicalModel[] {
    const executionProfile: PracticeExecutionProfile = context?.executionProfile === "open-source-practice" ? "open-source-practice" : "production";
    if (executionProfile !== "open-source-practice") return resolveLogicalModelCandidates(settings, capability, requestedModel, "", executionProfile);
    const requiresImageInput = context?.requiresImageInput === true;
    const virtualCapability = practiceCanvasVirtualCapability(requestedModel);
    // 练习画布先于工作流路由判断：画布请求可能带着 "canvas" 业务码，但它选的是练习池里的
    // 普通渠道，不是 RunningHub 工作流。短剧练习没有虚拟模型名，仍走下面的工作流分支。
    if (virtualCapability) return virtualCapability === capability ? resolvePracticeCanvasPoolCandidates(settings, capability, "", requiresImageInput) : [];
    if (context?.practiceModelTest && rawModelName(requestedModel)) {
        return resolvePracticeCanvasPoolCandidates(settings, capability, requestedModel, requiresImageInput);
    }
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
