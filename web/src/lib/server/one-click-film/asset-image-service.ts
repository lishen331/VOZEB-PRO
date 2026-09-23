import type { DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { dramaAssetPrimaryReference, dramaAssetReferences } from "@/lib/drama-asset-references";
import { normalizeDramaAssetGenerationLayout } from "@/lib/drama-asset-generation-contract";
import { buildDramaLabAssetImagePrompt } from "@/lib/drama-lab-asset-image-prompt";

export type OneClickAssetKind = "characters" | "scenes" | "props";

export class OneClickAssetImageError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "OneClickAssetImageError";
    }
}

export function findOneClickAsset(project: DramaProject, kind: OneClickAssetKind, assetId: string): DramaNamedAsset {
    const asset = (project[kind] as DramaNamedAsset[] | undefined)?.find((item) => item.id === assetId);
    if (!asset) throw new OneClickAssetImageError("资产不存在", 404);
    return asset;
}

/**
 * L 的版式约定：角色固定四视图，场景/道具默认单图（可切四格）。
 * 与创作工坊面板同一判定，避免商单侧悄悄改版式。
 */
export function resolveOneClickAssetLayout(kind: OneClickAssetKind, asset: Pick<DramaNamedAsset, "generationLayout">, requested?: string) {
    if (kind === "characters") return "four_view" as const;
    return normalizeDramaAssetGenerationLayout(kind, requested === "four_view" || requested === "single" ? requested : asset.generationLayout);
}

/**
 * 组装资产设定图的最终生图请求。
 *
 * 参考图选取规则照抄创作工坊面板：
 * - 角色：只用已有参考图（四视图靠提示词约束，不把主图当锚点重复注入）
 * - 场景/道具：主参考图优先，再补其余参考图，去重后最多 10 张
 */
/**
 * 是否具备可生图的主体描述。
 *
 * 注意不能用「拼装后的提示词是否为空」来判断：`buildDramaLabAssetFinalPrompt` 总会
 * 先拼上画风块与版式合同，返回值永远非空。若只看它，空资产也会被放行，
 * 最终提交给模型的提示词里只有样板、没有主体。
 */
function hasVisualSubject(kind: OneClickAssetKind, asset: DramaNamedAsset) {
    const saved = kind === "scenes" && asset.generationLayout !== "four_view" ? asset.singleImagePrompt : asset.polishedPrompt;
    return Boolean(saved?.trim() || asset.imagePrompt?.trim() || asset.appearance?.trim() || asset.description?.trim() || asset.name?.trim());
}

export function buildOneClickAssetImageRequest(project: DramaProject, kind: OneClickAssetKind, asset: DramaNamedAsset, requestedLayout?: string) {
    const layout = resolveOneClickAssetLayout(kind, asset, requestedLayout);
    const effectiveAsset = { ...asset, generationLayout: layout };
    if (!hasVisualSubject(kind, effectiveAsset)) throw new OneClickAssetImageError("该资产还没有名称或描述，请先补全资料或生成生图提示词");
    const prompt = buildDramaLabAssetImagePrompt({ style: project.style, aspectRatio: project.ratio }, effectiveAsset, kind);

    const canonical = dramaAssetReferences(effectiveAsset);
    const primary = dramaAssetPrimaryReference(effectiveAsset);
    const ordered = kind === "characters" ? canonical : [primary, ...canonical].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const seen = new Set<string>();
    const references = ordered
        .filter((reference) => {
            if (seen.has(reference.url)) return false;
            seen.add(reference.url);
            return true;
        })
        .slice(0, 10);

    return { layout, prompt, references, asset: effectiveAsset };
}
