import type { AuthSettings } from "@/lib/auth/store";
import { getAuthSettings } from "@/lib/auth/store";
import type { PracticeModuleCapability, PracticeModuleInputField, PracticeModuleKind, PracticeModuleModelOption } from "@/lib/practice-domain";
import type { LogicalModelCapability, RunningHubWorkflowBusinessCode, RunningHubWorkflowInputField } from "@/lib/auth/store-types";
import { resolveLogicalModel } from "./logical-model-router";
import { resolveEnabledWorkflow } from "./runninghub-workflow-domain";
import { requirePracticeAccess, type PracticeActor } from "./practice-access-service";

const MODULES = ["script", "storyboard-image", "storyboard-video", "dubbing", "music"] as const satisfies readonly PracticeModuleKind[];
const WORKFLOW_MODULES = MODULES.filter((module): module is Exclude<PracticeModuleKind, "script"> => module !== "script");

const BASE_MODULES: Record<PracticeModuleKind, Omit<PracticeModuleCapability, "module" | "available" | "unavailableReason" | "models">> = {
    script: { mode: "manual", outputType: "text", inputSchema: [{ key: "title", label: "剧本标题", type: "text", required: true }, { key: "content", label: "剧本正文", type: "textarea", required: true }] },
    "storyboard-image": { mode: "workflow", outputType: "image", inputSchema: [{ key: "prompt", label: "分镜图提示词", type: "textarea", required: true }] },
    "storyboard-video": { mode: "workflow", outputType: "video", inputSchema: [{ key: "referenceImage", label: "参考图片", type: "image", required: true }, { key: "prompt", label: "分镜视频提示词", type: "textarea", required: true }] },
    dubbing: { mode: "workflow", outputType: "audio", inputSchema: [{ key: "text", label: "配音文本", type: "textarea", required: true }] },
    music: { mode: "workflow", outputType: "audio", inputSchema: [{ key: "prompt", label: "音乐需求", type: "textarea", required: true }] },
};

export async function listPracticeModuleCapabilities(actor: PracticeActor, deps: { settings?: AuthSettings } = {}): Promise<PracticeModuleCapability[]> {
    await requirePracticeAccess(actor);
    const settings = deps.settings || (await getAuthSettings());
    return MODULES.map((module) => describeModule(settings, module));
}

export function resolvePracticeModuleModelOptions(settings: AuthSettings, module: Exclude<PracticeModuleKind, "script">): PracticeModuleModelOption[] {
    const capability = capabilityForModule(module);
    const bindings = settings.practiceWorkflowModels[module];
    const ids = Array.isArray(bindings) ? bindings : typeof bindings === "string" ? [bindings] : [];
    const options: PracticeModuleModelOption[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
        const logical = settings.logicalModels.find((item) => item.id.toLowerCase() === id.trim().toLowerCase());
        if (!logical || !logical.enabled || logical.capability !== capability || seen.has(logical.id.toLowerCase())) continue;
        const resolved = resolveLogicalModel({ logicalModels: settings.logicalModels, systemChannels: settings.systemChannels }, capability, logical.id, "", "open-source-practice");
        if (!resolved) continue;
        const workflow = resolveEnabledWorkflow(Object.values(resolved.channel.advancedConfig?.workflowConfigs || {}), resolved.channel.id, module);
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
    const workflow = first ? resolveEnabledWorkflow(Object.values(first.channel.advancedConfig?.workflowConfigs || {}), first.channel.id, module) : undefined;
    if (!workflow) return { module, ...base, available: false, models: [], unavailableReason: "当前模块暂无可用工作流" };
    return { module, ...base, available: true, models, inputSchema: mergeOptionalWorkflowFields(base.inputSchema, workflow.inputSchema) };
}

function mergeOptionalWorkflowFields(base: PracticeModuleInputField[], fields: RunningHubWorkflowInputField[]) {
    const reserved = new Set(base.map((field) => field.key));
    const optional = fields.flatMap((field) => {
        if (field.required || !isOptionalFieldType(field.type) || reserved.has(field.key)) return [];
        const candidate: PracticeModuleInputField = { key: field.key, label: field.label || field.key, type: field.type, required: false };
        if (field.options?.length) candidate.options = [...field.options];
        if (field.defaultValue !== undefined) candidate.defaultValue = field.defaultValue;
        return [candidate];
    });
    return [...base, ...optional];
}

function isOptionalFieldType(value: RunningHubWorkflowInputField["type"]): value is PracticeModuleInputField["type"] {
    return value === "number" || value === "enum" || value === "boolean";
}

function capabilityForModule(module: Exclude<PracticeModuleKind, "script">): LogicalModelCapability {
    return module === "storyboard-image" ? "image" : module === "storyboard-video" ? "video" : "audio";
}
