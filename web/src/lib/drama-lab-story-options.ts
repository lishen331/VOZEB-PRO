export type DramaLabStoryOptionKind = "style" | "type";

export const DRAMA_LAB_CUSTOM_OPTION_VALUE = "__drama_lab_custom_option__";

export const DRAMA_LAB_STORY_STYLE_PRESETS = [
    { value: "modern", label: "现代" },
    { value: "ancient", label: "古风" },
    { value: "fantasy", label: "奇幻" },
    { value: "daily", label: "日常" },
] as const;

export const DRAMA_LAB_SCRIPT_TYPE_PRESETS = [
    { value: "drama", label: "剧情" },
    { value: "comedy", label: "喜剧" },
    { value: "adventure", label: "冒险" },
] as const;

const STORY_STYLE_LABELS: Record<string, string> = Object.fromEntries(DRAMA_LAB_STORY_STYLE_PRESETS.map((item) => [item.value, item.label]));
const SCRIPT_TYPE_LABELS: Record<string, string> = Object.fromEntries(DRAMA_LAB_SCRIPT_TYPE_PRESETS.map((item) => [item.value, item.label]));

export function normalizeDramaLabStoryOption(value: unknown) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

export function dramaLabStoryOptionLabel(kind: DramaLabStoryOptionKind, value: string) {
    const normalized = normalizeDramaLabStoryOption(value);
    return (kind === "style" ? STORY_STYLE_LABELS : SCRIPT_TYPE_LABELS)[normalized] || normalized;
}
