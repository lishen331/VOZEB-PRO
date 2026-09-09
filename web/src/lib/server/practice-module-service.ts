import type { AuthSettings } from "@/lib/auth/store";
import { getAuthSettings } from "@/lib/auth/store";
import type { PracticeModuleCapability, PracticeModuleInputField, PracticeModuleKind, PracticeModuleModelOption } from "@/lib/practice-domain";
import type { LogicalModelCapability, RunningHubWorkflowBusinessCode, RunningHubWorkflowInputField } from "@/lib/auth/store-types";
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
    const workflows = runningHubWorkflowsForModule(settings, module);
    const first = workflows[0];
    return first ? [{ id: first.workflowKey, label: first.workflowName || first.workflowCode || first.workflowKey, ...(module === "character" ? { workflowOptions: workflowOptionsForModule(workflows) } : {}) }] : [];
}

function describeModule(settings: AuthSettings, module: PracticeModuleKind): PracticeModuleCapability {
    const base = BASE_MODULES[module];
    if (module === "script") return { module, ...base, available: true, models: [] };
    const workflows = runningHubWorkflowsForModule(settings, module);
    const first = workflows[0];
    if (!first) return { module, ...base, available: false, models: [], unavailableReason: "当前模块暂无可用工作流" };
    return {
        module,
        ...base,
        available: true,
        models: [{ id: first.workflowKey, label: first.workflowName || first.workflowCode || first.workflowKey, ...(module === "character" ? { workflowOptions: workflowOptionsForModule(workflows) } : {}) }],
        workflowOptions: workflowOptionsForModule(workflows),
        inputSchema: mergeOptionalWorkflowFields(base.inputSchema, first.inputSchema),
    };
}

function runningHubWorkflowsForModule(settings: AuthSettings, module: Exclude<PracticeModuleKind, "script">) {
    const code = WORKFLOW_CODE_BY_MODULE[module as keyof typeof WORKFLOW_CODE_BY_MODULE];
    const allowedCodes = module === "character" ? new Set(["character_main_view", "character_multi_view"]) : new Set(code ? [code] : []);
    return settings.systemChannels
        .filter((channel) => channel.enabled && channel.purpose === "open-source-practice" && channel.advancedConfig?.protocol === "runninghub")
        .flatMap((channel) => Object.values(channel.advancedConfig?.workflowConfigs || {}).map(normalizeWorkflow))
        .filter((workflow) => workflow.enabled && workflow.channelId && workflow.workflowCode && allowedCodes.has(workflow.workflowCode))
        .sort((left, right) => right.version - left.version || (left.workflowCode || "").localeCompare(right.workflowCode || ""));
}

function workflowOptionsForModule(workflows: import("@/lib/auth/store-types").RunningHubWorkflowConfig[]) {
    return workflows.map((workflow) => ({ code: workflow.workflowCode!, label: workflow.workflowName, inputSchema: mergeOptionalWorkflowFields([], workflow.inputSchema) }));
}

function mergeOptionalWorkflowFields(base: PracticeModuleInputField[], fields: RunningHubWorkflowInputField[]) {
    const reserved = new Set(base.map((field) => field.key));
    const optional = fields.flatMap((field) => {
        if (!isPublicPracticeFieldType(field) || reserved.has(field.key) || isDialogueSlotField(field.key)) return [];
        reserved.add(field.key);
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

function normalizeWorkflow(value: unknown) {
    return value as import("@/lib/auth/store-types").RunningHubWorkflowConfig;
}
