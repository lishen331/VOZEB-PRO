export const IP_VISIBILITIES = ["public", "school"] as const;
export const IP_AUTHORIZATION_MODES = ["multi_school", "exclusive"] as const;
export const IP_STATUSES = ["enabled", "disabled"] as const;
export const IP_ASSET_KINDS = ["text", "image", "audio", "video"] as const;
export const IP_USAGE_ACTIONS = ["reference", "download_item", "download_package"] as const;
export const IP_REFERENCE_ENTRY_VISIBLE = false;

export const IP_ITEM_CATEGORIES = {
    text: ["story_summary", "worldbuilding", "character_biography", "script", "derivative_script", "creation_notes"],
    image: ["character", "scene", "prop", "effect", "style"],
    audio: ["background_music", "theme_music", "character_voice", "narration", "sound_effect"],
    video: ["trailer", "action", "performance", "shot", "clip"],
} as const;

export type IpVisibility = (typeof IP_VISIBILITIES)[number];
export type IpAuthorizationMode = (typeof IP_AUTHORIZATION_MODES)[number];
export type IpStatus = (typeof IP_STATUSES)[number];
export type IpAssetKind = (typeof IP_ASSET_KINDS)[number];
export type IpItemCategory = (typeof IP_ITEM_CATEGORIES)[IpAssetKind][number];
export type IpUsageAction = (typeof IP_USAGE_ACTIONS)[number];
export type IpReference = { type: "ip"; id: string; subIpId: string; itemIds: string[] };

const IP_ASSET_KIND_SET = new Set<string>(IP_ASSET_KINDS);
const IP_ITEM_CATEGORY_SETS = Object.fromEntries(Object.entries(IP_ITEM_CATEGORIES).map(([kind, categories]) => [kind, new Set<string>(categories)])) as Record<IpAssetKind, Set<string>>;
const IP_ITEM_CATEGORY_LABELS: Record<IpItemCategory, string> = {
    story_summary: "故事梗概",
    worldbuilding: "世界观",
    character_biography: "人物小传",
    script: "剧本",
    derivative_script: "衍生剧本",
    creation_notes: "创作说明",
    character: "角色",
    scene: "场景",
    prop: "道具",
    effect: "特效",
    style: "风格",
    background_music: "背景音乐",
    theme_music: "主题音乐",
    character_voice: "角色配音",
    narration: "旁白",
    sound_effect: "音效",
    trailer: "预告片",
    action: "动作",
    performance: "表演",
    shot: "镜头",
    clip: "片段",
};

export function normalizeIpItemCategory(kind: unknown, value: unknown): IpItemCategory | null {
    if (typeof kind !== "string" || !IP_ASSET_KIND_SET.has(kind) || typeof value !== "string") return null;
    const category = value.trim();
    return IP_ITEM_CATEGORY_SETS[kind as IpAssetKind].has(category) ? (category as IpItemCategory) : null;
}

export function ipItemCategoryLabel(category: IpItemCategory) {
    return IP_ITEM_CATEGORY_LABELS[category];
}

export function normalizeIpReference(value: unknown): IpReference | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    if (source.type !== "ip" || typeof source.id !== "string" || typeof source.subIpId !== "string" || !Array.isArray(source.itemIds)) return null;
    const id = source.id.trim();
    const subIpId = source.subIpId.trim();
    if (!id || !subIpId || source.itemIds.some((item) => typeof item !== "string")) return null;

    const itemIds = source.itemIds.map((item) => (item as string).trim()).filter(Boolean);
    if (new Set(itemIds).size !== itemIds.length) return null;
    return { type: "ip", id, subIpId, itemIds };
}

export function ipAuthorizationLabel(mode: IpAuthorizationMode) {
    return mode === "exclusive" ? "独家授权" : "多校授权";
}
