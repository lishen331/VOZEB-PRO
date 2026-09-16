import type { DramaAssetProfile } from "./drama-project-contract";

export function dramaLabCharacterAnchorLines(profile?: DramaAssetProfile) {
    if (!profile) return [];
    const colors = profile.color_anchors;
    return [
        profile.visualIdentity ? `视觉识别：${profile.visualIdentity}` : "",
        profile.styling ? `造型与材质：${profile.styling}` : "",
        profile.colorPalette ? `固定色彩：${profile.colorPalette}` : "",
        profile.consistencyRules ? `一致性规则：${profile.consistencyRules}` : "",
        profile.face_shape ? `脸型：${profile.face_shape}` : "",
        profile.facial_features ? `五官特征：${profile.facial_features}` : "",
        profile.unique_marks ? `独特标记：${profile.unique_marks}` : "",
        colors ? `颜色锚点：头发 ${colors.hair || "未指定"}；眼睛 ${colors.eyes || "未指定"}；肤色 ${colors.skin || "未指定"}；主服装 ${colors.primary_outfit || "未指定"}` : "",
        profile.skin_texture ? `皮肤质感：${profile.skin_texture}` : "",
        profile.hair_style ? `发型：${profile.hair_style}` : "",
    ].filter(Boolean);
}

export function dramaLabCharacterAnchorBlock(profile?: DramaAssetProfile) {
    const lines = dramaLabCharacterAnchorLines(profile);
    return lines.length ? `【视觉锚点】\n${lines.join("\n")}` : "";
}
