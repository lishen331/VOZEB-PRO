export const IMAGE_REFERENCE_ROLE_LABELS = {
    original: "原始参考",
    identity: "身份参考",
    clothing: "服装参考",
    skin: "肤质参考",
    style: "风格参考",
    pose: "动作/姿态参考",
    composition: "构图/镜位参考",
    scene: "场景/背景参考",
    lighting: "光线/色彩参考",
    product: "商品结构参考",
    prop: "道具参考",
} as const;

export type ImageReferenceRole = keyof typeof IMAGE_REFERENCE_ROLE_LABELS;
export type ImageReferenceRoles = Record<string, ImageReferenceRole[]>;

export const IMAGE_REFERENCE_ROLE_VALUES = Object.keys(IMAGE_REFERENCE_ROLE_LABELS) as ImageReferenceRole[];

export const IMAGE_REFERENCE_ROLE_CONSTRAINTS: Record<Exclude<ImageReferenceRole, "original">, string> = {
    identity: "仅参考人物身份、脸部特征与五官比例",
    clothing: "仅参考服装、穿着结构与材质细节",
    skin: "仅参考皮肤质感、肤色与纹理",
    style: "仅参考整体视觉风格、媒介质感与艺术表现",
    pose: "仅参考动作、姿态与身体状态",
    composition: "仅参考构图、景别、镜位与画面布局",
    scene: "仅参考场景、背景空间与环境元素",
    lighting: "仅参考光线方向、色彩关系与氛围",
    product: "仅参考商品结构、比例、材质与关键细节",
    prop: "仅参考道具外观、结构与使用状态",
};

export function normalizeImageReferenceRoles(value: Record<string, ImageReferenceRole | ImageReferenceRole[] | undefined> | undefined): ImageReferenceRoles {
    if (!value) return {};
    return Object.fromEntries(
        Object.entries(value).map(([id, roles]) => {
            const next = Array.isArray(roles) ? roles : roles ? [roles] : [];
            const deduped = Array.from(new Set(next.filter((role): role is ImageReferenceRole => role in IMAGE_REFERENCE_ROLE_LABELS)));
            return [id, (deduped.length ? deduped : ["original"]) as ImageReferenceRole[]];
        }),
    );
}

export function toggleImageReferenceRole(current: ImageReferenceRole[] | undefined, role: ImageReferenceRole): ImageReferenceRole[] {
    const selected = new Set<ImageReferenceRole>(current?.length ? current : ["original"]);
    if (role === "original") return ["original"];
    selected.delete("original");
    if (selected.has(role)) selected.delete(role);
    else selected.add(role);
    return selected.size ? Array.from(selected) : ["original"];
}

export function imageReferenceRoleSummary(roles: ImageReferenceRole[] | undefined) {
    const normalized: ImageReferenceRole[] = roles?.length ? roles : ["original"];
    return normalized.map((role) => IMAGE_REFERENCE_ROLE_LABELS[role]).join(" + ");
}
