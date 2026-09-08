import type { DramaAssetVisualDetails, DramaAssetProfile } from "./drama-project-contract";
import { resolveDramaLabStylePrompt } from "./drama-lab-style-prompt";

export function readDramaLabAssetVisualDetails(value: unknown): DramaAssetVisualDetails {
    if (!value || typeof value !== "object") return {};
    const input = value as Record<string, unknown>;
    return Object.fromEntries(
        (["appearance", "imagePrompt", "role", "type", "time"] as const).flatMap((key) => {
            const text = input[key];
            return typeof text === "string" && text.trim() ? [[key, text.trim()]] : [];
        }),
    );
}

export function buildDramaLabAssetImagePrompt(project: { style?: string; aspectRatio?: string }, asset: DramaAssetVisualDetails & { name?: string; description?: string; profile?: DramaAssetProfile }, kind: "characters" | "scenes" | "props") {
    const label = { characters: "角色", scenes: "场景", props: "道具" }[kind];
    const profile = asset.profile;
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
            ? "完整人物设定视图，五官、体型和服装清晰，干净中性背景，不添加文字。"
            : kind === "scenes"
              ? "纯场景背景，无人物、无角色、无人物动作，不添加文字。"
              : "单一道具主体，纯色无缝棚拍背景，无人物无手无环境无杂物，真实物理尺度，不添加文字。",
    ]
        .filter(Boolean)
        .join("\n");
}
