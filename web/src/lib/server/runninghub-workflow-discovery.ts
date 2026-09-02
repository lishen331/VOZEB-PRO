import { createHash } from "node:crypto";

import type { LogicalModelCapability, RunningHubNodeMapping, RunningHubOutputMapping, RunningHubWorkflowInputField } from "@/lib/auth/store-types";

export type RunningHubNodeCandidate = {
    nodeId: string;
    fieldName: string;
    nodeTitle: string;
    nodeType: string;
    role: "prompt" | "image" | "video" | "audio" | "duration" | "enum" | "boolean" | "number" | "output" | "unknown";
    label: string;
    inputType?: RunningHubWorkflowInputField["type"];
    defaultValue?: string | number | boolean | null;
    hasExternalFileDependency: boolean;
    confidence: "high" | "medium" | "low";
};

export type RunningHubWorkflowDiscovery = {
    workflowId: string;
    workflowType?: string;
    nodeCount: number;
    candidates: RunningHubNodeCandidate[];
    suggestedInputs: RunningHubWorkflowInputField[];
    suggestedNodeMappings: RunningHubNodeMapping[];
    suggestedOutputs: RunningHubOutputMapping[];
    warnings: string[];
    workflowJsonFingerprint: string;
};

type Node = { id: string; type: string; title: string; inputs: Record<string, unknown> };

export function analyzeRunningHubWorkflowJson(input: { workflowId: string; raw: unknown; capability: LogicalModelCapability }): RunningHubWorkflowDiscovery {
    const nodes = extractNodes(input.raw);
    const candidates = nodes.flatMap((node) => analyzeNode(node, input.capability));
    const warnings = Array.from(
        new Set([
            ...candidates.filter((item) => item.hasExternalFileDependency).map((item) => `${item.nodeId}.${item.fieldName} 发现默认文件依赖，正式调用时需要上传替代素材`),
            ...ambiguousWarnings(candidates),
            ...(nodes.length ? [] : ["未识别到可配置的工作流节点"]),
        ]),
    );
    const suggestedInputs: RunningHubWorkflowInputField[] = [];
    const suggestedNodeMappings: RunningHubNodeMapping[] = [];
    for (const role of ["prompt", "image", "video", "audio", "duration", "enum", "boolean", "number"] as const) {
        const roleCandidates = candidates.filter((item) => item.role === role);
        if (roleCandidates.length !== 1) continue;
        const candidate = roleCandidates[0];
        const key = inputKeyFor(candidate, role);
        const inputType = candidate.inputType || inputTypeForRole(role);
        if (!inputType) continue;
        suggestedInputs.push({ key, label: candidate.label, type: inputType, required: candidate.hasExternalFileDependency || role === "prompt" });
        suggestedNodeMappings.push({
            paramKey: key,
            nodeId: candidate.nodeId,
            fieldName: candidate.fieldName,
            valueType: valueTypeForInput(inputType),
            source: candidate.hasExternalFileDependency ? "INPUT" : "INPUT_OR_DEFAULT",
            inputKey: key,
            ...(candidate.defaultValue !== undefined ? { defaultValue: candidate.defaultValue } : {}),
        });
    }
    const outputCandidates = candidates.filter((item) => item.role === "output");
    const suggestedOutputs = outputCandidates.map((candidate, index) => ({
        key: outputKeyFor(candidate, input.capability, index),
        label: candidate.label,
        nodeId: candidate.nodeId,
        assetType: outputTypeFor(candidate, input.capability),
        required: true,
        primary: index === 0,
    }));
    return {
        workflowId: input.workflowId.trim(),
        ...(readWorkflowType(input.raw) ? { workflowType: readWorkflowType(input.raw) } : {}),
        nodeCount: nodes.length,
        candidates,
        suggestedInputs,
        suggestedNodeMappings,
        suggestedOutputs,
        warnings,
        workflowJsonFingerprint: createHash("sha256").update(stableStringify(input.raw)).digest("hex"),
    };
}

function extractNodes(raw: unknown): Node[] {
    const found: Node[] = [];
    const seen = new Set<string>();
    walk(parseJsonValue(raw), "", (value, key) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const record = value as Record<string, unknown>;
        const inputs = record.inputs;
        const type = text(record.class_type) || text(record.nodeType) || text(record.type);
        if (!inputs || typeof inputs !== "object" || Array.isArray(inputs) || !type) return;
        const id = text(record.id) || key;
        if (!id || seen.has(id)) return;
        seen.add(id);
        found.push({ id, type, title: text(record._meta && typeof record._meta === "object" ? (record._meta as Record<string, unknown>).title : undefined) || text(record.title) || type, inputs: inputs as Record<string, unknown> });
    });
    return found;
}

function analyzeNode(node: Node, capability: LogicalModelCapability): RunningHubNodeCandidate[] {
    const outputNode = isOutputNode(node);
    if (outputNode) return [{ nodeId: node.id, fieldName: outputField(node), nodeTitle: node.title, nodeType: node.type, role: "output", label: outputLabel(node, capability), hasExternalFileDependency: false, confidence: "high" }];
    const matches = Object.entries(node.inputs).flatMap(([fieldName, value]) => {
        if (isNodeLink(value)) return [];
        const role = classifyRole(node, fieldName, value);
        if (!role) return [];
        const inputType = inputTypeForRole(role);
        return [
            {
                nodeId: node.id,
                fieldName,
                nodeTitle: node.title,
                nodeType: node.type,
                role,
                label: candidateLabel(role, fieldName, node.id),
                ...(inputType ? { inputType } : {}),
                ...(isJsonPrimitive(value) ? { defaultValue: value } : {}),
                hasExternalFileDependency: isExternalFileDependency(value, role),
                confidence: confidenceFor(node, fieldName, role),
            },
        ];
    });
    return matches.length ? matches : [{ nodeId: node.id, fieldName: "", nodeTitle: node.title, nodeType: node.type, role: "unknown", label: "待确认节点", hasExternalFileDependency: false, confidence: "low" }];
}

function classifyRole(node: Node, fieldName: string, value: unknown): RunningHubNodeCandidate["role"] | undefined {
    const field = fieldName.toLowerCase();
    const type = node.type.toLowerCase();
    if (/(duration|seconds|时长)/i.test(field) && typeof value === "number") return "duration";
    if (typeof value === "boolean") return "boolean";
    if (Array.isArray(value) && value.length && value.every((item) => isJsonPrimitive(item))) return "enum";
    if (typeof value === "number") return "number";
    if (isFileLike(value, "image") || /(loadimage|image|参考图|图片)/i.test(`${type} ${field}`)) return "image";
    if (isFileLike(value, "video") || /(loadvideo|video|视频)/i.test(`${type} ${field}`)) return "video";
    if (isFileLike(value, "audio") || /(loadaudio|audio|音频|声音)/i.test(`${type} ${field}`)) return "audio";
    if (typeof value === "string" && /(prompt|text|value|内容|提示词|文本)/i.test(field)) return "prompt";
    return undefined;
}

function inputTypeForRole(role: RunningHubNodeCandidate["role"]): RunningHubWorkflowInputField["type"] | undefined {
    return role === "prompt" ? "textarea" : role === "image" ? "image" : role === "video" ? "video" : role === "audio" ? "audio" : role === "duration" || role === "number" ? "number" : role === "enum" ? "enum" : role === "boolean" ? "boolean" : undefined;
}

function valueTypeForInput(type: RunningHubWorkflowInputField["type"]): RunningHubNodeMapping["valueType"] {
    return type === "number" ? "NUMBER" : type === "boolean" ? "BOOLEAN" : type === "images" || type === "enum" ? "JSON" : "STRING";
}

function isOutputNode(node: Node) {
    return /(saveimage|savevideo|saveaudio|videocombine|audiooutput|imagesave|previewimage|previewvideo|previewaudio|输出|结果)/i.test(`${node.type} ${node.title}`);
}

function outputField(node: Node) {
    return Object.keys(node.inputs).find((key) => /(image|video|audio|output|result|filename)/i.test(key)) || "output";
}

function outputTypeFor(candidate: RunningHubNodeCandidate, capability: LogicalModelCapability): RunningHubOutputMapping["assetType"] {
    const value = `${candidate.nodeType} ${candidate.nodeTitle}`.toLowerCase();
    return /audio|声音|配音|音乐/.test(value) ? "AUDIO" : /video|视频/.test(value) ? "VIDEO" : /image|图片|图像/.test(value) ? "IMAGE" : capability === "audio" ? "AUDIO" : capability === "video" ? "VIDEO" : capability === "image" ? "IMAGE" : "TEXT";
}

function candidateLabel(role: RunningHubNodeCandidate["role"], field: string, nodeId: string) {
    if (role === "prompt") return "提示词";
    if (role === "image") return `参考图 ${nodeId}`;
    if (role === "video") return "参考视频";
    if (role === "audio") return "参考音频";
    if (role === "duration") return "视频时长";
    if (role === "enum") return `枚举 · ${field}`;
    if (role === "boolean") return `开关 · ${field}`;
    return field;
}

function outputLabel(node: Node, capability: LogicalModelCapability) {
    const type = outputTypeFor({ nodeId: node.id, fieldName: "output", nodeTitle: node.title, nodeType: node.type, role: "output", label: "", hasExternalFileDependency: false, confidence: "high" }, capability);
    return type === "IMAGE" ? "输出图片" : type === "VIDEO" ? "输出视频" : type === "AUDIO" ? "输出音频" : "输出文本";
}

function inputKeyFor(candidate: RunningHubNodeCandidate, role: RunningHubNodeCandidate["role"]) {
    if (role === "image") return `referenceImage${candidate.nodeId}`;
    return role === "duration" ? "duration" : role;
}

function outputKeyFor(candidate: RunningHubNodeCandidate, capability: LogicalModelCapability, index: number) {
    return capability === "image" ? `image${index + 1}` : capability === "video" ? `video${index + 1}` : capability === "audio" ? `audio${index + 1}` : `text${index + 1}`;
}

function confidenceFor(node: Node, field: string, role: RunningHubNodeCandidate["role"]): RunningHubNodeCandidate["confidence"] {
    if (role === "prompt" && /prompt/i.test(field)) return "high";
    if (["image", "video", "audio"].includes(role) && /(load|image|video|audio)/i.test(node.type)) return "high";
    return "medium";
}

function ambiguousWarnings(candidates: RunningHubNodeCandidate[]) {
    return ["prompt", "image", "video", "audio"].flatMap((role) => {
        const matches = candidates.filter((candidate) => candidate.role === role);
        return matches.length > 1 ? [`发现多个${role === "prompt" ? "提示词" : role === "image" ? "参考图" : role === "video" ? "参考视频" : "参考音频"}候选，请确认后再保存映射`] : [];
    });
}

function readWorkflowType(raw: unknown) {
    let result = "";
    walk(parseJsonValue(raw), "", (value) => {
        if (result || !value || typeof value !== "object" || Array.isArray(value)) return;
        const record = value as Record<string, unknown>;
        result = text(record.workflowType) || text(record.workflow_type) || (text(record.type) && !record.inputs ? text(record.type) : "");
    });
    return result;
}

function isExternalFileDependency(value: unknown, role: RunningHubNodeCandidate["role"]) {
    return ["image", "video", "audio"].includes(role) && typeof value === "string" && Boolean(value.trim()) && !/^\{\{/i.test(value);
}

function isFileLike(value: unknown, role: string) {
    if (typeof value !== "string") return false;
    return role === "image" ? /\.(?:png|jpe?g|webp|gif)$/i.test(value) : role === "video" ? /\.(?:mp4|mov|webm|mkv)$/i.test(value) : /\.(?:mp3|wav|m4a|flac|ogg)$/i.test(value);
}

function isNodeLink(value: unknown) {
    return Array.isArray(value) && value.length >= 1 && typeof value[0] === "string" && value.length <= 2;
}

function parseJsonValue(value: unknown): unknown {
    if (typeof value !== "string") return value;
    try {
        const parsed: unknown = JSON.parse(value);
        return parsed;
    } catch {
        return value;
    }
}

function walk(value: unknown, key: string, visitor: (value: unknown, key: string) => void) {
    visitor(value, key);
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, String(index), visitor));
    else if (value && typeof value === "object") Object.entries(value).forEach(([childKey, child]) => walk(child, childKey, visitor));
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).sort().join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(",")}}`;
    return JSON.stringify(value);
}

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
    return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
