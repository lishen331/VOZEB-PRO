import { resolveDramaLabStylePrompt } from "./drama-lab-style-prompt";
import type { DramaAssetProfile, DramaAssetVisualDetails } from "./drama-project-contract";
import { normalizeDramaAssetGenerationLayout } from "./drama-asset-generation-contract";

type AssetKind = "characters" | "scenes" | "props";
type AssetInput = DramaAssetVisualDetails & { name?: string; description?: string; profile?: DramaAssetProfile };

export function dramaLabAssetPromptField(kind: AssetKind, asset: AssetInput) {
    const layout = normalizeDramaAssetGenerationLayout(kind, asset.generationLayout);
    if (kind === "scenes" && layout === "single") return asset.singleImagePrompt?.trim() || "";
    return asset.polishedPrompt?.trim() || "";
}

export function buildDramaLabAssetFinalPrompt(project: { style?: string; aspectRatio?: string }, asset: AssetInput, kind: AssetKind, visualDescription: string) {
    const layout = normalizeDramaAssetGenerationLayout(kind, asset.generationLayout);
    const style = resolveDramaLabStylePrompt(project.style);
    const styleBlock = [
        `【画风·最高优先级】${kind === "characters" || layout === "four_view" ? "所有面板统一：" : ""}${style.zh}`,
        style.en ? `MANDATORY ART STYLE${kind === "characters" || layout === "four_view" ? " (all panels)" : ""}: ${style.en}.` : "",
    ]
        .filter(Boolean)
        .join("\n");
    const anchor = asset.profile
        ? `\n\n【视觉锚点】\n视觉识别：${asset.profile.visualIdentity || "未指定"}\n造型与材质：${asset.profile.styling || "未指定"}\n固定色彩：${asset.profile.colorPalette || "未指定"}\n一致性规则：${asset.profile.consistencyRules || "未指定"}`
        : "";
    const description = visualDescription.trim() || asset.imagePrompt?.trim() || asset.appearance?.trim() || asset.description?.trim() || asset.name || "";
    const sourceFacts = assetSourceFacts(kind, asset, description);
    return `${styleBlock}\n\n${layoutContract(kind, layout, project.aspectRatio)}\n\n---\n\n${description}${sourceFacts}${anchor}`.trim();
}

export function assetPromptPolishInstruction(kind: AssetKind, layout: "single" | "four_view") {
    if (kind === "characters") return "只整理角色明确的外貌、体型、脸型、发型、服装、材质和可见标志，不写场景和剧情；所有视图必须保持同一角色、同一年龄、同一妆面、同一发型、同一服装版本。";
    if (kind === "scenes" && layout === "four_view") return "只整理同一场景的建筑结构、空间边界、地面材质、关键陈设、光线、时段、天气与四个差异化机位；四格结构和视觉条件必须一致，绝不出现人物。";
    if (kind === "scenes") return "整理为一张连续场景参考图的可见空间描述，包含完整边界、建筑、地面、陈设、光线、时段和氛围；绝不出现人物、剪影或文字。";
    if (layout === "four_view") return "只整理同一道具明确可见的轮廓、真实尺寸、材质、颜色、工艺、磨损和结构细节；四个视图必须是同一道具，不出现人物、手、环境或其他物体。";
    return "整理为单一道具资产主图描述，只保留明确可见的轮廓、真实尺寸、材质、颜色、工艺和磨损；纯色无缝棚拍背景，无人物、无手、无环境、无其他物体。";
}

function layoutContract(kind: AssetKind, layout: "single" | "four_view", ratio = "16:9") {
    if (kind === "characters")
        return `Industrial character reference sheet — image only, no text reply.\nONE image, single canvas (NOT a 2×2 or 4×4 grid, NOT four equal quadrants), ${ratio}. Top: thin light-gray technical TITLE BAR using the character name. Main area FIXED SPLIT: LEFT ~1/3 COLUMN = FACE HERO CLOSE-UP; RIGHT ~2/3 labeled sub-panels = FRONT VIEW (front full body), BACK VIEW (back full body), SIDE PROFILE CLOSE-UP (90° face close-up, not full body), COSTUME / SUIT DETAIL VIEW, MATERIAL & TEXTURE NOTES. No left-profile full-body panel. FRONT and BACK: same character, same outfit, same proportions, same lighting and scale; neutral standing, head-to-toe, arms at sides, no action pose. SIDE PROFILE CLOSE-UP complements the same face identity. Costume/material only in right-side panels. Solid white background, fine light-gray dividers, no environment, no watermark or logos.`;
    if (kind === "scenes" && layout === "four_view")
        return `Scene environment reference sheet — image only, no text reply. ONE image: 2×2 grid, ${ratio}. TL=establishing wide showing full space and boundaries. TR=main activity zone medium shot. BL=signature environmental detail close-up. BR=alternate angle of the same place. No people, characters, silhouettes, human shadows, text, labels, watermarks or location lettering. Same architecture, terrain, ground materials, key furnishings, light, time and weather across all panels; only focal length and camera angle may change.`;
    if (kind === "scenes")
        return `Scene environment reference — image only, no text reply. ONE single continuous image, ${ratio}; no grid, split panels or collage. Wide establishing view showing the complete space, boundaries, architecture, ground materials, key furnishings, lighting, time, weather and atmosphere. No people, characters, silhouettes, human shadows, text, labels, watermarks or location lettering.`;
    if (layout === "four_view")
        return `Prop technical reference sheet — image only, no text reply. ONE image with four clearly separated views of the exact same prop: FRONT VIEW, SIDE VIEW, BACK VIEW, and MATERIAL / STRUCTURE DETAIL, ${ratio}. Identical proportions, scale, materials, colors, construction and wear marks across every view. Single prop only, seamless solid-color studio backdrop, soft even studio light, no extra objects, no people, no hands, no furniture, no ground/table, no environment, no text, logos or packaging unless integral to the prop.`;
    return `Single prop asset hero image — image only, no text reply, ${ratio}. Exactly one prop at realistic physical scale, centered and fully visible, showing silhouette, material, color, craftsmanship and wear. Seamless matte solid-color studio backdrop, soft even studio light, only a minimal contact shadow. No extra objects, no people, no hands, no furniture, no ground/table, no environment, no text, logos or packaging unless integral to the prop.`;
}

function assetSourceFacts(kind: AssetKind, asset: AssetInput, primaryDescription: string) {
    const facts =
        kind === "characters"
            ? [
                  asset.name && `名称：${asset.name}`,
                  asset.description && asset.description !== primaryDescription && `简介：${asset.description}`,
                  asset.appearance && asset.appearance !== primaryDescription && `外貌描述：${asset.appearance}`,
                  asset.role && `角色身份：${asset.role}`,
              ]
            : kind === "scenes"
              ? [asset.time && `时段：${asset.time}`]
              : [asset.type && `道具类型：${asset.type}`];
    const presentFacts = facts.filter(Boolean);
    return presentFacts.length ? `\n\n【原始资产事实】\n${presentFacts.join("\n")}` : "";
}
