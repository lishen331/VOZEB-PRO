import { IMAGE_REFERENCE_ROLE_CONSTRAINTS, normalizeImageReferenceRoles, type ImageReferenceRole } from "./image-reference-roles";

export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}

export function buildImageReferencePromptText(prompt: string, references: readonly unknown[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    const labels = references.map((_, index) => imageReferenceLabel(index));
    return `Reference images: ${labels.join(", ")}. Use the reference image as real visual input, not as a text description. If a reference image contains a person or character, keep the same identity/character, face proportions, hairstyle, body shape, clothing, and main pose as much as possible. Only change the scene, style, background, or details requested by the user. Do not replace the referenced person with a new person.\n\n参考图片编号：${labels.join("、")}。如果参考图中包含人物或角色，请保持同一人物/角色、五官比例、发型、体型、服饰和主要姿态，只按用户要求修改场景、风格、背景或细节，不要换成新人物。\n\n${text}`;
}

function buildCanvasReferenceRoleText(references: readonly { id?: string }[], referenceRoles: Record<string, ImageReferenceRole | ImageReferenceRole[]>) {
    const normalized = normalizeImageReferenceRoles(referenceRoles);
    return Object.entries(normalized)
        .filter(([id, roles]) => references.some((reference) => reference.id === id) && roles.some((role) => role !== "original"))
        .map(([id, roles]) => {
            const index = references.findIndex((reference) => reference.id === id);
            const constraints = roles
                .filter((role): role is Exclude<ImageReferenceRole, "original"> => role !== "original")
                .map((role) => IMAGE_REFERENCE_ROLE_CONSTRAINTS[role])
                .join("；");
            return `参考图${index + 1}用途：${constraints}`;
        })
        .join("\n");
}

/** Resolve the prompt sent to an image provider. Canvas direct generation keeps the user's prompt intact. */
export function buildImageTaskPrompt(task: {
    prompt: string;
    source?: string;
    config: { systemPrompt?: string; outputBackground?: string; outputMode?: string };
    references: readonly { id?: string }[];
    referenceRoles?: Record<string, ImageReferenceRole | ImageReferenceRole[]>;
}) {
    const base = task.source === "canvas" ? task.prompt.trim() : buildImageReferencePromptText(task.prompt, task.references);
    const roleText = task.source === "canvas" ? buildCanvasReferenceRoleText(task.references, task.referenceRoles || {}) : "";
    const withRoles = roleText ? `${base}\n\n用户明确指定的参考图用途：\n${roleText}` : base;
    const withOutput =
        task.config.outputMode === "layers"
            ? `${withRoles}\n\n分层任务要求：一次请求返回完整的多图片结果数组。每个前景结果只包含一个独立元素，必须与源图同宽高、保留原始坐标、使用源图原始像素和真实透明 Alpha；另返回一张同宽高、已移除所有前景元素并只补全遮挡区域的干净背景。禁止拼图、裁片、缩放、重绘、改字、合并元素、改动元素外区域或把已分离元素补回背景。`
            : task.config.outputBackground === "transparent"
              ? `${withRoles}\n\n输出要求：只保留参考图中的目标元素，去除裁切范围外的背景，输出带真实透明 Alpha 的 PNG。不要补画背景、文字、装饰或其他元素，不要改变目标元素的颜色、结构、比例和边缘。`
              : withRoles;
    const systemPrompt = (task.config.systemPrompt || "").trim();
    return systemPrompt ? `${systemPrompt}\n\n${withOutput}` : withOutput;
}
