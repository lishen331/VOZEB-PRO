import type { AuthSettings } from "@/lib/auth/store";
import { getAuthSettings } from "@/lib/auth/store";
import type { PracticeModuleCapability, PracticeModuleInputField, PracticeModuleKind, PracticeModuleModelOption, PracticeSizeOption } from "@/lib/practice-domain";
import type { LogicalModelCapability, RunningHubWorkflowBusinessCode, RunningHubWorkflowConfig, RunningHubWorkflowInputField } from "@/lib/auth/store-types";
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

/**
 * 与 Demo `index.html` 的“尺寸比例 / 全景规格 / 视频时长”下拉一致的页面默认项。
 * Demo 的 applyConfiguredGenerationSizes() 会用工作流自带的 generationSizeOptions 覆盖这些默认项，这里沿用同一规则。
 */
const DEMO_SIZE_DEFAULTS: Record<string, Array<[number, number]>> = {
    character_main_view: [
        [768, 1024],
        [720, 1280],
        [1024, 1024],
    ],
    character_multi_view: [
        [1350, 2400],
        [1536, 2048],
    ],
    prop_main_view: [
        [1024, 1024],
        [768, 1024],
        [1280, 720],
    ],
    storyboard_shot: [
        [1280, 720],
        [720, 1280],
        [1024, 1024],
    ],
    storyboard_shot_video: [
        [1280, 720],
        [720, 1280],
    ],
};
const DEMO_DURATION_DEFAULTS: Record<string, number[]> = { storyboard_shot_video: [5, 8, 10] };
const DEMO_ENUM_DEFAULTS: Record<string, Record<string, string[]>> = { scene_main_view: { outputPreset: ["2048 x 1024"] } };

export function practiceSizeOptions(workflow: Pick<RunningHubWorkflowConfig, "workflowCode" | "generationSizeOptions" | "inputSchema">): PracticeSizeOption[] {
    const supportsSize = workflow.inputSchema.some((field) => field.key === "width") && workflow.inputSchema.some((field) => field.key === "height");
    if (!supportsSize) return [];
    const configured = (workflow.generationSizeOptions || []).filter((option) => !option.disabled && positiveInteger(option.width) && positiveInteger(option.height)).map((option) => [option.width as number, option.height as number] as [number, number]);
    const pairs = configured.length ? configured : DEMO_SIZE_DEFAULTS[workflow.workflowCode || ""] || [];
    const seen = new Set<string>();
    return pairs.flatMap(([width, height]) => {
        const key = `${width}x${height}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ key, label: `${sizeRatioLabel(width, height)} · ${width}×${height}`, width, height }];
    });
}

export function practiceDurationOptions(workflow: Pick<RunningHubWorkflowConfig, "workflowCode" | "inputSchema">): number[] {
    if (!workflow.inputSchema.some((field) => field.key === "duration" && field.type === "number")) return [];
    return DEMO_DURATION_DEFAULTS[workflow.workflowCode || ""] || [];
}

function sizeRatioLabel(width: number, height: number) {
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) [a, b] = [b, a % b];
    return a || 1;
}

function positiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

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
        script: { enabled: settings.practiceScriptSettings?.enabled !== false },
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
    const sizeOptions = practiceSizeOptions(first);
    const durationOptions = practiceDurationOptions(first);
    return {
        module,
        ...base,
        available: true,
        models: [{ id: first.workflowKey, label: first.workflowName || first.workflowCode || first.workflowKey, ...(module === "character" ? { workflowOptions: workflowOptionsForModule(workflows) } : {}) }],
        workflowOptions: workflowOptionsForModule(workflows),
        inputSchema: mergeOptionalWorkflowFields(base.inputSchema, first.inputSchema, first.workflowCode),
        ...(sizeOptions.length ? { sizeOptions } : {}),
        ...(durationOptions.length ? { durationOptions } : {}),
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

function workflowOptionsForModule(workflows: RunningHubWorkflowConfig[]) {
    return workflows.map((workflow) => {
        const sizeOptions = practiceSizeOptions(workflow);
        const durationOptions = practiceDurationOptions(workflow);
        return {
            code: workflow.workflowCode!,
            label: workflow.workflowName,
            inputSchema: mergeOptionalWorkflowFields([], workflow.inputSchema, workflow.workflowCode),
            ...(sizeOptions.length ? { sizeOptions } : {}),
            ...(durationOptions.length ? { durationOptions } : {}),
        };
    });
}

function mergeOptionalWorkflowFields(base: PracticeModuleInputField[], fields: RunningHubWorkflowInputField[], workflowCode?: string) {
    const reserved = new Set(base.map((field) => field.key));
    const enumDefaults = DEMO_ENUM_DEFAULTS[workflowCode || ""] || {};
    const optional = fields.flatMap((field) => {
        if (!isPublicPracticeFieldType(field) || reserved.has(field.key) || isDialogueSlotField(field.key)) return [];
        reserved.add(field.key);
        const candidate: PracticeModuleInputField = { key: field.key, label: field.label || field.key, type: field.type, required: false };
        candidate.required = field.required;
        if (field.options?.length) candidate.options = [...field.options];
        else if (enumDefaults[field.key]?.length && (field.type === "text" || field.type === "textarea")) {
            // Demo 页面把这类字符串参数（如场景全景规格）做成固定下拉；服务端按 Demo 预设投影为 enum。
            candidate.type = "enum";
            candidate.options = [...enumDefaults[field.key]];
        }
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
