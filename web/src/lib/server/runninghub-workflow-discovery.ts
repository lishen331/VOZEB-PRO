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
    options?: string[];
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
        const roleCandidates = candidates.filter((item) => item.role === role && (isInternalKnobRole(role) ? isBusinessSelector(item.fieldName) : true));
        if (!roleCandidates.length) continue;
        // 提示词：多个时跳过自动映射（歧义），由用户手动配置
        if (role === "prompt" && roleCandidates.length > 1) {
            continue;
        }
        const effectiveCandidates = roleCandidates;
        effectiveCandidates.forEach((candidate, index) => {
            const key = inputKeyFor(role, index);
            const inputType = candidate.inputType || inputTypeForRole(role);
            if (!inputType) return;
            // 参考素材：只有真实外部文件依赖才必填，没有默认值 = 可选
            const isRequired = role === "prompt" || (["image", "video", "audio"].includes(role) && candidate.hasExternalFileDependency);
            suggestedInputs.push({
                key,
                label: effectiveCandidates.length > 1 && role === "image" ? `参考图 ${index + 1}` : candidate.label,
                type: inputType,
                required: isRequired,
                ...(role === "enum" && candidate.options && candidate.options.length ? { options: candidate.options } : {}),
            });
            suggestedNodeMappings.push({
                paramKey: key,
                nodeId: candidate.nodeId,
                fieldName: candidate.fieldName,
                valueType: valueTypeForInput(inputType),
                source: candidate.hasExternalFileDependency ? "INPUT" : "INPUT_OR_DEFAULT",
                inputKey: key,
                ...(safeDefaultValue(candidate.fieldName, candidate.defaultValue) !== undefined ? { defaultValue: safeDefaultValue(candidate.fieldName, candidate.defaultValue) } : {}),
            });
        });
    }
    const outputCandidates = candidates.filter((item) => item.role === "output");
    const suggestedOutputs = outputCandidates.map((candidate, index) => ({
        key: outputKeyFor(input.capability, index),
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
    walk(raw, "", (value, key) => {
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
                ...(safeDefaultValue(fieldName, value) !== undefined ? { defaultValue: safeDefaultValue(fieldName, value) } : {}),
                ...(role === "enum" ? { options: enumOptions(value) } : {}),
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
    // 名称里带 image/video/audio 的尺寸类字段（ref_image_size、image_width…）是内部旋钮，
    // 不能因为含有素材关键词就当成参考文件入参，否则会把素材 URL 塞进尺寸字段导致上游失败。
    const nameHint = (keyword: RegExp) => keyword.test(`${type} ${field}`) && !FILE_DIMENSION_GUARD.test(field);

    // 优先级 1: 数值类型和布尔类型（强类型优先）
    if (/(duration|seconds|时长)/i.test(field) && typeof value === "number") return "duration";
    if (typeof value === "boolean") return "boolean";
    if (Array.isArray(value) && value.length && value.every((item) => isJsonPrimitive(item)) && !isNodeLink(value)) return "enum";
    if (typeof value === "number") return "number";

    // 优先级 2: 字符串字段 - 先判断语义再判断文件名
    if (typeof value === "string") {
        // 2.1 提示词字段优先（避免 "prompt: 'example.png'" 被误判为图片）
        if (/(prompt|text|value|内容|提示词|文本)/i.test(field)) return "prompt";

        // 2.2 文件类字段 - 同时检查字段名和值的格式
        const hasImageExt = /\.(?:png|jpe?g|webp|gif)$/i.test(value);
        const hasVideoExt = /\.(?:mp4|mov|webm|mkv)$/i.test(value);
        const hasAudioExt = /\.(?:mp3|wav|m4a|flac|ogg)$/i.test(value);

        // 必须字段名包含素材关键词 + 值是文件路径，才识别为素材输入
        if (hasImageExt && nameHint(/(loadimage|image|参考图|图片)/i)) return "image";
        if (hasVideoExt && nameHint(/(loadvideo|video|视频)/i)) return "video";
        if (hasAudioExt && nameHint(/(loadaudio|audio|音频|声音)/i)) return "audio";
    }

    // 优先级 3: 仅根据字段名推断（无默认值或默认值不是字符串）
    if (nameHint(/(loadimage|image|参考图|图片)/i)) return "image";
    if (nameHint(/(loadvideo|video|视频)/i)) return "video";
    if (nameHint(/(loadaudio|audio|音频|声音)/i)) return "audio";

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

function inputKeyFor(role: RunningHubNodeCandidate["role"], index = 0) {
    if (role === "image") return `referenceImage${index + 1}`;
    if (role === "video") return `referenceVideo${index + 1}`;
    if (role === "audio") return `referenceAudio${index + 1}`;
    if (role === "duration") return "duration";
    if (role === "prompt") return "prompt";
    return `${role}${index + 1}`;
}

function outputKeyFor(capability: LogicalModelCapability, index: number) {
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
    walk(raw, "", (value) => {
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
    return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && (typeof value[1] === "number" || (value[1] && typeof value[1] === "object"));
}

function safeDefaultValue(fieldName: string, value: unknown) {
    if (!isJsonPrimitive(value) || isSensitiveField(fieldName)) return undefined;
    if (typeof value === "string") return /^\{\{[^}]+\}\}$/.test(value.trim()) ? value : undefined;
    return value;
}

function isSensitiveField(value: string) {
    return /(?:token|secret|password|api[_-]?key|authorization|private[_-]?key|credential)/i.test(value);
}

function parseJsonValue(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
    try {
        const parsed: unknown = JSON.parse(trimmed);
        return parsed && typeof parsed === "object" ? parsed : value;
    } catch {
        return value;
    }
}

function walk(value: unknown, key: string, visitor: (value: unknown, key: string) => void) {
    const current = parseJsonValue(value);
    visitor(current, key);
    if (Array.isArray(current)) current.forEach((item, index) => walk(item, String(index), visitor));
    else if (current && typeof current === "object") Object.entries(current).forEach(([childKey, child]) => walk(child, childKey, visitor));
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
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

function enumOptions(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => (isJsonPrimitive(item) ? String(item) : "")).filter(Boolean) : [];
}

// RunningHub 工作流在上游已完整配置，下游业务只应覆盖语义入口（提示词/参考素材/时长）
// 以及少量真业务选择项（宽高比/分辨率/画质等）。采样步数、种子、降噪等内部旋钮已调好，
// 不应作为入参暴露，否则既是表单噪点，留空又会被强转成 0 发给上游导致失败。
const BUSINESS_SELECTOR_FIELD = /(aspect|ratio|比例|resolution|分辨率|orientation|方向|dimension|画幅|width|宽度|宽高|height|高度|size|尺寸|quality|画质|清晰|duration|时长|seconds?|秒)/i;
const INTERNAL_KNOB_FIELD = /(steps?|seed|denoise|cfg|sampler|scheduler|bit_?depth|strength|noise|megapixel|guidance|clip_?skip|batch|latent|eta|sigma|subseed|refiner|karras|采样|步数|降噪|种子|模型强度)/i;
// image/video/audio 关键词若出现在尺寸/比例/分辨率字段里，是内部旋钮而非参考素材入口
const FILE_DIMENSION_GUARD = /(size|尺寸|width|宽|height|高|ratio|比例|resolution|分辨率|dimension|画幅|megapixel|scale|缩放)/i;

function isInternalKnobRole(role: RunningHubNodeCandidate["role"]) {
    return role === "enum" || role === "number" || role === "boolean";
}

function isBusinessSelector(fieldName: string) {
    return BUSINESS_SELECTOR_FIELD.test(fieldName) && !INTERNAL_KNOB_FIELD.test(fieldName);
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
