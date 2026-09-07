import type { AuthSettings } from "@/lib/auth/store";
import { getAuthSettings } from "@/lib/auth/store";
import type { PracticeModuleCapability, PracticeModuleInputField, PracticeModuleKind, PracticeModuleModelOption } from "@/lib/practice-domain";
import type { LogicalModelCapability, RunningHubWorkflowBusinessCode, RunningHubWorkflowInputField } from "@/lib/auth/store-types";
import { resolveLogicalModel } from "./logical-model-router";
import { resolveEnabledWorkflow } from "./runninghub-workflow-domain";
import { requirePracticeAccess, type PracticeActor } from "./practice-access-service";

const MODULES = ["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"] as const satisfies readonly PracticeModuleKind[];
const WORKFLOW_CODE_BY_MODULE = {
    character: "character_main_view",
    scene: "scene_main_view",
    prop: "prop_main_view",
    "storyboard-image": "storyboard_shot",
    "storyboard-video": "storyboard_shot_video",
    dubbing: "storyboard_dialogue_audio",
    music: undefined,
} as const;

const BASE_MODULES: Record<PracticeModuleKind, Omit<PracticeModuleCapability, "module" | "available" | "unavailableReason" | "models">> = {
    script: {
        mode: "manual",
        outputType: "text",
        inputSchema: [
            { key: "title", label: "剧本标题", type: "text", required: true },
            { key: "content", label: "剧本正文", type: "textarea", required: true },
        ],
    },
    character: { mode: "workflow", outputType: "image", inputSchema: [{ key: "prompt", label: "角色描述", type: "textarea", required: true }] },
    scene: { mode: "workflow", outputType: "image", inputSchema: [{ key: "prompt", label: "场景描述", type: "textarea", required: true }] },
    prop: { mode: "workflow", outputType: "image", inputSchema: [{ key: "prompt", label: "道具描述", type: "textarea", required: true }] },
    "storyboard-image": { mode: "workflow", outputType: "image", inputSchema: [{ key: "prompt", label: "分镜图提示词", type: "textarea", required: true }] },
    "storyboard-video": {
        mode: "workflow",
        outputType: "video",
        inputSchema: [
            { key: "referenceImage", label: "参考图片", type: "image", required: true },
            { key: "prompt", label: "分镜视频提示词", type: "textarea", required: true },
        ],
    },
    dubbing: { mode: "workflow", outputType: "audio", inputSchema: [{ key: "text", label: "配音文本", type: "textarea", required: true }] },
    music: { mode: "workflow", outputType: "audio", inputSchema: [{ key: "prompt", label: "音乐需求", type: "textarea", required: true }] },
};

export async function getPracticeModuleConfiguration(actor: PracticeActor, deps: { settings?: AuthSettings } = {}) {
    await requirePracticeAccess(actor);
    const settings = deps.settings || (await getAuthSettings());
    const visibility = settings.practiceModuleVisibility;
    return {
        modules: MODULES.filter((module) => visibility?.[module] !== false).map((module) => describeModule(settings, module)),
        projects: { canvas: visibility?.canvas === true, drama: visibility?.drama === true },
    };
}

export async function listPracticeModuleCapabilities(actor: PracticeActor, deps: { settings?: AuthSettings } = {}): Promise<PracticeModuleCapability[]> {
    return (await getPracticeModuleConfiguration(actor, deps)).modules;
}

export function resolvePracticeModuleModelOptions(settings: AuthSettings, module: Exclude<PracticeModuleKind, "script">): PracticeModuleModelOption[] {
    const capability = capabilityForModule(module);
    const bindingKey = module === "character" || module === "scene" || module === "prop" ? "storyboard-image" : module;
    const bindings = settings.practiceWorkflowModels[bindingKey];
    const boundIds = Array.isArray(bindings) ? bindings : typeof bindings === "string" ? [bindings] : [];
    const key = `${capability}Model` as "imageModel" | "videoModel" | "audioModel";
    const defaultModel = settings.practiceDefaultModels?.[key];
    const ids = boundIds.length ? boundIds : defaultModel ? [defaultModel] : [];
    const options: PracticeModuleModelOption[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
        const logical = settings.logicalModels.find((item) => item.id.toLowerCase() === id.trim().toLowerCase());
        if (!logical || !logical.enabled || logical.capability !== capability || seen.has(logical.id.toLowerCase())) continue;
        const resolved = resolveLogicalModel({ logicalModels: settings.logicalModels, systemChannels: settings.systemChannels }, capability, logical.id, "", "open-source-practice");
        if (!resolved) continue;
        const workflow = workflowForModule(resolved.channel.advancedConfig?.workflowConfigs, resolved.channel.id, module);
        if (!workflow) continue;
        seen.add(logical.id.toLowerCase());
        options.push({ id: logical.id, label: logical.name || logical.id });
    }
    return options;
}

function describeModule(settings: AuthSettings, module: PracticeModuleKind): PracticeModuleCapability {
    const base = BASE_MODULES[module];
    if (module === "script") return { module, ...base, available: true, models: [] };
    const models = resolvePracticeModuleModelOptions(settings, module);
    if (!models.length) return { module, ...base, available: false, models: [], unavailableReason: "当前模块暂无可用开源模型" };
    const first = resolveLogicalModel({ logicalModels: settings.logicalModels, systemChannels: settings.systemChannels }, capabilityForModule(module), models[0].id, "", "open-source-practice");
    if (!first) return { module, ...base, available: false, models: [], unavailableReason: "当前模块暂无可用开源模型" };
    const workflow = workflowForModule(first.channel.advancedConfig?.workflowConfigs, first.channel.id, module);
    if (!workflow) return { module, ...base, available: false, models: [], unavailableReason: "当前模块暂无可用工作流" };
    const workflows = workflowsForModule(first.channel.advancedConfig?.workflowConfigs, first.channel.id, module);
    return {
        module,
        ...base,
        available: true,
        models,
        workflowOptions: workflowOptions(first.channel.advancedConfig?.workflowConfigs, first.channel.id, module),
        inputSchema: mergeOptionalWorkflowFields(
            base.inputSchema,
            workflows.flatMap((item) => item.inputSchema),
        ),
    };
}

function mergeOptionalWorkflowFields(base: PracticeModuleInputField[], fields: RunningHubWorkflowInputField[]) {
    const reserved = new Set(base.map((field) => field.key));
    const optional = fields.flatMap((field) => {
        if (!isPublicPracticeFieldType(field) || reserved.has(field.key) || isDialogueSlotField(field.key)) return [];
        const candidate: PracticeModuleInputField = { key: field.key, label: field.label || field.key, type: field.type, required: false };
        candidate.required = field.required;
        if (field.options?.length) candidate.options = [...field.options];
        if (field.defaultValue !== undefined) candidate.defaultValue = field.defaultValue;
        return [candidate];
    });
    return [...base, ...optional];
}

function isPublicPracticeField(field: RunningHubWorkflowInputField) {
    return ["text", "textarea", "number", "enum", "boolean"].includes(field.type) && !isDialogueSlotField(field.key);
}

function isPublicPracticeFieldType(field: RunningHubWorkflowInputField): field is RunningHubWorkflowInputField & { type: PracticeModuleInputField["type"] } {
    return isPublicPracticeField(field);
}

function isDialogueSlotField(key: string) {
    return /^s\d+_/.test(key);
}

function capabilityForModule(module: Exclude<PracticeModuleKind, "script">): LogicalModelCapability {
    return module === "storyboard-video" ? "video" : module === "dubbing" || module === "music" ? "audio" : "image";
}

function workflowForModule(configs: Record<string, unknown> | undefined, channelId: string, module: Exclude<PracticeModuleKind, "script">) {
    return workflowsForModule(configs, channelId, module)[0] || resolveEnabledWorkflow(Object.values(configs || {}), channelId, legacyBusinessCode(module));
}

function workflowsForModule(configs: Record<string, unknown> | undefined, channelId: string, module: Exclude<PracticeModuleKind, "script">) {
    const code = WORKFLOW_CODE_BY_MODULE[module as keyof typeof WORKFLOW_CODE_BY_MODULE];
    const allowedCodes = module === "character" ? new Set(["character_main_view", "character_multi_view"]) : new Set(code ? [code] : []);
    return Object.values(configs || {})
        .map((item) => normalizeWorkflow(item))
        .filter((item) => item.enabled && item.channelId === channelId && (!item.workflowCode ? false : allowedCodes.has(item.workflowCode)) )
        .sort((left, right) => (left.workflowCode || "").localeCompare(right.workflowCode || ""));
}

function workflowOptions(configs: Record<string, unknown> | undefined, channelId: string, module: Exclude<PracticeModuleKind, "script">) {
    const code = WORKFLOW_CODE_BY_MODULE[module as keyof typeof WORKFLOW_CODE_BY_MODULE];
    if (!code) return [];
    const allowedCodes = module === "character" ? new Set(["character_main_view", "character_multi_view"]) : new Set([code]);
    return Object.values(configs || {})
        .map((item) => normalizeWorkflow(item))
        .filter((item) => item.enabled && item.channelId === channelId && item.workflowCode && allowedCodes.has(item.workflowCode) )
        .sort((left, right) => (left.workflowCode || "").localeCompare(right.workflowCode || ""))
        .map((item) => ({ code: item.workflowCode!, label: item.workflowName }));
}

function legacyBusinessCode(module: Exclude<PracticeModuleKind, "script">) {
    return module === "dubbing" ? "dubbing" : module === "music" ? "music" : module === "storyboard-video" ? "storyboard-video" : "storyboard-image";
}

function normalizeWorkflow(value: unknown) {
    return value as import("@/lib/auth/store-types").RunningHubWorkflowConfig;
}
