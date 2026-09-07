import type { RunningHubNodeMapping, RunningHubWorkflowConfig, RunningHubWorkflowInputField } from "@/lib/auth/store-types";

import { buildProviderRequest } from "./provider-task-config";

export type RunningHubWorkflowReference = { type: string; inputKey?: string; url?: string; assetId?: string };
export type RunningHubWorkflowExecution = {
    payload: Record<string, unknown>;
    nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }>;
    resolvedInput: Record<string, unknown>;
    workflowJsonOverride?: string;
};

const STORYBOARD_SLOTS = [
    { inputKey: "characterPropImage1", loadImageNode: "20", referenceNode: "18", branchNodes: ["20", "41", "22", "23", "18"] },
    { inputKey: "characterPropImage2", loadImageNode: "24", referenceNode: "28", branchNodes: ["24", "42", "26", "27", "28"] },
    { inputKey: "characterPropImage3", loadImageNode: "48", referenceNode: "45", branchNodes: ["48", "47", "43", "44", "45"] },
] as const;

export function prepareRunningHubWorkflowExecution(input: {
    config: RunningHubWorkflowConfig;
    businessInput: Record<string, unknown>;
    references: RunningHubWorkflowReference[];
}): RunningHubWorkflowExecution {
    const config = input.config;
    if (config.adapterType === "storyboard-shot" && !text(input.businessInput.sceneImage) && !input.references.some((reference) => reference.inputKey === "sceneImage" && Boolean(referenceValue(reference)))) {
        throw new Error("分镜图缺少主场景图（sceneImage）");
    }
    const resolvedInput = resolveInputValues(config, input.businessInput, input.references);
    const adapterType = config.adapterType || "generic";
    let workflowJsonOverride: string | undefined;

    if (adapterType === "character-main-view") workflowJsonOverride = prepareCharacter(config, resolvedInput);
    if (adapterType === "prop-main-view") workflowJsonOverride = prepareProp(config, resolvedInput);
    if (adapterType === "storyboard-shot") workflowJsonOverride = prepareStoryboard(config, resolvedInput);
    if (adapterType === "storyboard-shot-video") prepareVideo(resolvedInput);
    if (adapterType === "storyboard-dialogue-audio") prepareDialogue(config, resolvedInput);

    const nodeInfoList = config.nodeMappings.flatMap((mapping) => {
        const field = config.inputSchema.find((item) => item.key === mapping.inputKey);
        if (!field) throw new Error(`配置错误：节点映射引用了不存在的参数 "${mapping.inputKey}"（请重新读取工作流）`);
        const raw = resolvedInput[mapping.inputKey];
        if (isEmpty(raw)) {
            if (mapping.source === "INPUT_OR_DEFAULT" && mapping.defaultValue !== undefined) return [{ nodeId: mapping.nodeId, fieldName: mapping.fieldName, fieldValue: convertValue(mapping, mapping.defaultValue) }];
            return [];
        }
        return [{ nodeId: mapping.nodeId, fieldName: mapping.fieldName, fieldValue: convertValue(mapping, raw) }];
    });
    const workflow = workflowJsonOverride || config.workflowApiJson;
    const defaults = { workflowId: config.workflowId, nodeInfoList, ...(workflow ? { workflow } : {}) };
    const values = { ...resolvedInput, ...defaults };
    const payload = buildProviderRequest(config.requestTemplate, defaults, values);
    const result: Record<string, unknown> = { ...payload, workflowId: config.workflowId, nodeInfoList };
    if (workflow) result.workflow = workflow;
    if (config.runOptions) {
        if (isOfficialCreatePath(config.createPath)) Object.assign(result, allowlistedRunOptions(config.runOptions));
        else result.runOptions = config.runOptions;
    }
    return { payload: result, nodeInfoList, resolvedInput, ...(workflowJsonOverride ? { workflowJsonOverride } : {}) };
}

function resolveInputValues(config: RunningHubWorkflowConfig, businessInput: Record<string, unknown>, references: RunningHubWorkflowReference[]) {
    const resolved: Record<string, unknown> = { ...businessInput };
    for (const field of config.inputSchema) {
        if (resolved[field.key] !== undefined) continue;
        if (field.type === "images") {
            const values = references.filter((reference) => reference.type === "image").map(referenceValue).filter(Boolean);
            if (values.length) resolved[field.key] = values;
            continue;
        }
        const reference = references.find((item) => item.inputKey === field.key || (!item.inputKey && item.type === field.type));
        if (reference) resolved[field.key] = referenceValue(reference);
        else if (field.defaultValue !== undefined) resolved[field.key] = field.defaultValue;
    }
    validateInputSchema(config.inputSchema, resolved);
    return resolved;
}

function validateInputSchema(fields: RunningHubWorkflowInputField[], values: Record<string, unknown>) {
    for (const field of fields) {
        const value = values[field.key];
        if (isEmpty(value)) {
            if (field.required) throw new Error(`缺少必填参数：${field.label || field.key}`);
            continue;
        }
        if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`参数类型错误：${field.label || field.key}`);
        if (field.type === "boolean" && typeof value !== "boolean") throw new Error(`参数类型错误：${field.label || field.key}`);
        if (["text", "textarea", "image", "video", "audio", "enum"].includes(field.type) && typeof value !== "string") throw new Error(`参数类型错误：${field.label || field.key}`);
        if (field.type === "images" && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) throw new Error(`参数类型错误：${field.label || field.key}`);
        if (field.type === "enum" && field.options?.length && !field.options.includes(String(value))) throw new Error(`参数值无效：${field.label || field.key}`);
    }
}

function prepareCharacter(config: RunningHubWorkflowConfig, values: Record<string, unknown>) {
    if (hasText(values.referenceImage)) return undefined;
    const graph = parseWorkflowGraph(config, "character");
    ["131", "147", "148", "154"].forEach((nodeId) => delete graph[nodeId]);
    stripInput(graph, "178", "image");
    relink(graph, "134", "positive", "140");
    return stringifyGraph(graph);
}

function prepareProp(config: RunningHubWorkflowConfig, values: Record<string, unknown>) {
    if (hasText(values.referenceImage)) return undefined;
    const graph = parseWorkflowGraph(config, "prop");
    delete graph["13"];
    delete graph["68"];
    stripInput(graph, "59", "images.image_1");
    return stringifyGraph(graph);
}

function prepareStoryboard(config: RunningHubWorkflowConfig, values: Record<string, unknown>) {
    const sceneImage = text(values.sceneImage);
    if (!sceneImage) throw new Error("分镜图缺少主场景图（sceneImage）");
    const packed = STORYBOARD_SLOTS.map((slot) => text(values[slot.inputKey])).filter(Boolean);
    STORYBOARD_SLOTS.forEach((slot, index) => {
        if (packed[index]) values[slot.inputKey] = packed[index];
        else delete values[slot.inputKey];
    });
    const graph = parseWorkflowGraph(config, "storyboard");
    setInput(graph, "13", "image", sceneImage);
    if (positive(values.width)) setInput(graph, "40", "width", values.width);
    if (positive(values.height)) setInput(graph, "40", "height", values.height);
    let lastReference = "17";
    let trimming = false;
    STORYBOARD_SLOTS.forEach((slot) => {
        const value = text(values[slot.inputKey]);
        if (!trimming && value) {
            setInput(graph, slot.loadImageNode, "image", value);
            lastReference = slot.referenceNode;
        } else {
            trimming = true;
            slot.branchNodes.forEach((nodeId) => delete graph[nodeId]);
        }
    });
    relink(graph, "4", "positive", lastReference);
    relink(graph, "4", "negative", lastReference);
    return stringifyGraph(graph);
}

function prepareVideo(values: Record<string, unknown>) {
    const audio = text(values.audio);
    if (values.audioEnabled === true && !audio) throw new Error("启用台词音频后必须提供音频");
    const audioEnabled = values.audioEnabled === true && Boolean(audio) ? true : values.audioEnabled === false ? false : Boolean(audio);
    values.audioEnabled = audioEnabled;
    if (!audioEnabled) delete values.audio;
    values.duration = Math.ceil(positive(values.duration) || 6);
}

function prepareDialogue(config: RunningHubWorkflowConfig, values: Record<string, unknown>) {
    const rawLines = Array.isArray(values.lines) ? values.lines : [];
    if (!rawLines.length) return;
    const lines = rawLines.filter((raw) => {
        const line = record(raw);
        return Boolean(text(line.text));
    });
    if (lines.length > 10) throw new Error("配音最多支持 10 句有效台词");
    const supported = new Set(config.inputSchema.map((field) => field.key));
    for (const [index, raw] of lines.entries()) {
        const line = record(raw);
        const slot = index + 1;
        const audio = text(line.audioUrl) || text(line.audio);
        if (audio && supported.has(`s${slot}_audio`)) values[`s${slot}_audio`] = audio;
        const emotion = record(line.emotion);
        for (const key of ["happy", "sad", "disgust", "fear", "surprise", "angry"]) {
            if (typeof emotion[key] === "number" && Number.isFinite(emotion[key]) && supported.has(`s${slot}_${key}`)) values[`s${slot}_${key}`] = emotion[key];
        }
    }
    delete values.lines;
}

function parseWorkflowGraph(config: RunningHubWorkflowConfig, label: string) {
    if (!config.workflowApiJson?.trim()) throw new Error(`${label} 工作流缺少 API 格式 JSON，请在工作流配置页重新拉取`);
    try {
        const parsed = JSON.parse(config.workflowApiJson) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("不是对象");
        return structuredClone(parsed) as Record<string, Record<string, unknown>>;
    } catch (error) {
        if (error instanceof Error && error.message.includes("API 格式")) throw error;
        throw new Error(`${label} 工作流 API JSON 解析失败`);
    }
}

function setInput(graph: Record<string, Record<string, unknown>>, nodeId: string, field: string, value: unknown) {
    const node = graph[nodeId];
    if (!node || !node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) return;
    (node.inputs as Record<string, unknown>)[field] = value;
}

function stripInput(graph: Record<string, Record<string, unknown>>, nodeId: string, field: string) {
    const node = graph[nodeId];
    if (!node || !node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) return;
    delete (node.inputs as Record<string, unknown>)[field];
}

function relink(graph: Record<string, Record<string, unknown>>, nodeId: string, field: string, targetNodeId: string) {
    setInput(graph, nodeId, field, [targetNodeId, 0]);
}

function stringifyGraph(graph: Record<string, Record<string, unknown>>) {
    return JSON.stringify(graph);
}

function convertValue(mapping: RunningHubNodeMapping, value: unknown) {
    if (mapping.valueType === "NUMBER") {
        const result = Number(value);
        if (!Number.isFinite(result)) throw new Error(`参数不是有效数字：${String(value)}`);
        return result;
    }
    if (mapping.valueType === "BOOLEAN") {
        if (typeof value === "boolean") return value;
        if (value === "true" || value === 1 || value === "1") return true;
        if (value === "false" || value === 0 || value === "0") return false;
        throw new Error(`参数不是有效布尔值：${String(value)}`);
    }
    if (mapping.valueType === "JSON") return value;
    return Array.isArray(value) ? value.join(",") : typeof value === "string" ? value.trim() : String(value);
}

function referenceValue(reference: RunningHubWorkflowReference) {
    return text(reference.url) || text(reference.assetId);
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function hasText(value: unknown) {
    return Boolean(text(value));
}

function positive(value: unknown) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isEmpty(value: unknown) {
    return value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
}

function isOfficialCreatePath(path: string) {
    return path.replace(/\/+$/, "").toLowerCase() === "/task/openapi/create";
}

function allowlistedRunOptions(options: Record<string, string | number | boolean | null>) {
    const keys = new Set(["addMetadata", "instanceType", "usePersonalQueue", "retainSeconds", "accessPassword"]);
    return Object.fromEntries(Object.entries(options).filter(([key, value]) => keys.has(key) && value !== null && (key !== "retainSeconds" || Number(value) >= 10 && Number(value) <= 180)));
}
