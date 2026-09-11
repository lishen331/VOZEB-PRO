import { normalizeDramaAssetGenerationLayout } from "./drama-asset-generation-contract";
import type { DramaAssetVisualDetails, DramaAssetProfile } from "./drama-project-contract";
import { resolveDramaLabStylePrompt } from "./drama-lab-style-prompt";

export function readDramaLabAssetVisualDetails(value: unknown): DramaAssetVisualDetails {
    if (!value || typeof value !== "object") return {};
    const input = value as Record<string, unknown>;
    const details: DramaAssetVisualDetails = {};
    for (const key of ["appearance", "imagePrompt", "polishedPrompt", "singleImagePrompt", "role", "type", "time"] as const) {
        const text = input[key];
        if (typeof text === "string" && text.trim()) details[key] = text.trim();
    }
    if (input.generationLayout === "single" || input.generationLayout === "four_view") details.generationLayout = input.generationLayout;
    if (Array.isArray(input.stages)) {
        const stages = input.stages.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const stage = item as Record<string, unknown>;
            const range = Array.isArray(stage.episodeRange) ? stage.episodeRange.map(Number) : [];
            const appearance = typeof stage.appearance === "string" ? stage.appearance.trim() : "";
            return range.length === 2 && range.every((value) => Number.isFinite(value) && value >= 1) && appearance ? [{ episodeRange: [Math.floor(range[0]), Math.floor(range[1])] as [number, number], appearance }] : [];
        });
        if (stages.length) details.stages = stages;
    }
    return details;
}

export function buildDramaLabAssetImagePrompt(project: { style?: string; aspectRatio?: string }, asset: DramaAssetVisualDetails & { name?: string; description?: string; profile?: DramaAssetProfile }, kind: "characters" | "scenes" | "props") {
    const label = { characters: "角色", scenes: "场景", props: "道具" }[kind];
    const profile = asset.profile;
    const polishedPrompt = asset.polishedPrompt?.trim();
    if (polishedPrompt) return polishedPrompt;
    const layout = normalizeDramaAssetGenerationLayout(kind, asset.generationLayout);
    return [
        `${label}设定图，${project.aspectRatio || "16:9"}，${resolveDramaLabStylePrompt(project.style).zh || "保持项目统一风格"}`,
        asset.imagePrompt?.trim() || [`名称：${asset.name || ""}`, asset.description ? `文字设定：${asset.description}` : ""].filter(Boolean).join("\n"),
        kind === "characters" && asset.appearance ? `人物外貌：${asset.appearance}` : "",
        kind === "scenes" && asset.time ? `时间：${asset.time}` : "",
        profile?.visualIdentity ? `视觉识别：${profile.visualIdentity}` : "",
        profile?.styling ? `造型与材质：${profile.styling}` : "",
        profile?.colorPalette ? `固定色彩：${profile.colorPalette}` : "",
        profile?.consistencyRules ? `一致性规则：${profile.consistencyRules}` : "",
        kind === "characters"
            ? layout === "four_view"
                ? "角色四视图设定板占位布局：同一角色的正面、背面、侧面和脸部或服装细节，干净中性背景，不添加文字。"
                : "单人角色设定图，五官、体型和服装清晰，干净中性背景，不添加文字。"
            : kind === "scenes"
              ? layout === "four_view"
                  ? "场景四格参考板占位布局：同一空间的主视图、替代角度、细节和材质区域，无人物无角色，不添加文字。"
                  : "纯场景背景，无人物、无角色、无人物动作，不添加文字。"
              : layout === "four_view"
                ? "道具四视图参考板占位布局：同一道具的正面、侧面、背面和材质细节，无人物无手无环境杂物，不添加文字。"
                : "单一道具主体，纯色无缝棚拍背景，无人物无手无环境无杂物，真实物理尺度，不添加文字。",
    ]
        .filter(Boolean)
        .join("\n");
}
