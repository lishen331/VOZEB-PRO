export type ResourceImageReference = { id?: string; url?: string; storageKey?: string; role?: string; label?: string };

export function normalizeResourceGenerationReferences(references: ResourceImageReference[]) {
    return references
        .filter((item) => item.url && item.role !== "primary" && item.role !== "history")
        .slice(0, 9)
        .map((item, index) => ({ ...item, id: item.id || `reference-${index + 1}`, label: `图${index + 1}` }));
}

export function buildResourceImageRequest(promptValue: string, references: ResourceImageReference[]) {
    const prompt = promptValue.trim();
    const normalized = normalizeResourceGenerationReferences(references);
    if (!prompt && !normalized.length) throw new Error("请输入提示词或添加参考图");
    return {
        mode: prompt && normalized.length ? ("text-image-to-image" as const) : prompt ? ("text-to-image" as const) : ("image-to-image" as const),
        prompt: prompt || "根据提供的参考图片生成图片",
        references: normalized,
    };
}

export function setResourcePrimaryImage(currentUrl: string | undefined, references: ResourceImageReference[], next: ResourceImageReference) {
    const history = references.filter((item) => item.id !== next.id && item.role !== "primary");
    if (currentUrl && currentUrl !== next.url) history.unshift({ id: `history-${Date.now()}`, url: currentUrl, role: "history" });
    return { primaryUrl: next.url || currentUrl || "", references: history };
}

export function insertResourceMention(value: string, selectionStart: number, selectionEnd: number, label: string) {
    const start = Math.max(0, Math.min(value.length, selectionStart));
    const end = Math.max(start, Math.min(value.length, selectionEnd));
    const token = `@${label} `;
    return { value: `${value.slice(0, start)}${token}${value.slice(end)}`, cursor: start + token.length };
}
