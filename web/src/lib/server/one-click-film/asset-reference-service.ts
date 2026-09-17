import { dramaAssetPrimaryReference, dramaAssetReferences } from "@/lib/drama-asset-references";
import type { DramaAssetReference, DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";

import type { OneClickAssetKind } from "./asset-image-service";

export class OneClickAssetReferenceError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "OneClickAssetReferenceError";
    }
}

/** 与资产一起持久化的旧字段镜像：创作工坊一直同步维护，保持一致避免旧读取路径拿不到主图。 */
function primaryMirror(primary?: DramaAssetReference) {
    return {
        primaryReferenceId: primary?.id,
        referenceImageUrl: primary?.url,
        referenceStorageKey: primary?.storageKey,
    };
}

export function oneClickAssetReferencePatch(asset: DramaNamedAsset, references: DramaAssetReference[], primary?: DramaAssetReference) {
    void asset;
    return { references, ...primaryMirror(primary) };
}

/**
 * 追加上传的参考图。
 *
 * L / 创作工坊语义：新图追加在末尾；主图**优先保留原有主图**，仅当资产原本没有任何
 * 参考图时才把第一张新上传的设为主图。不能因为一次上传就悄悄改掉用户选定的主图。
 */
export function appendOneClickAssetReferences(asset: DramaNamedAsset, uploaded: DramaAssetReference[]) {
    if (!uploaded.length) throw new OneClickAssetReferenceError("没有可上传的参考图");
    const current = dramaAssetReferences(asset);
    const references = [...current, ...uploaded];
    const primary = dramaAssetPrimaryReference(asset) || current[0] || uploaded[0];
    return oneClickAssetReferencePatch(asset, references, primary);
}

/**
 * 设为主图。
 *
 * 对应 L `PUT /characters/:id/image`。沿用 `createAssetGeneratedPrimary` 的排序语义：
 * 新主图置顶并标记 primary，旧主图降级为 history，其余保持相对顺序。
 */
export function setOneClickAssetPrimaryReference(asset: DramaNamedAsset, referenceId: string) {
    const references = dramaAssetReferences(asset);
    const target = references.find((item) => item.id === referenceId);
    if (!target) throw new OneClickAssetReferenceError("参考图不存在", 404);
    const previous = dramaAssetPrimaryReference(asset);
    if (previous?.id === target.id) return oneClickAssetReferencePatch(asset, references, target);

    const remaining = references.filter((item) => item.id !== target.id && item.id !== previous?.id);
    const next: DramaAssetReference[] = [{ ...target, role: "primary" as const }, ...(previous ? [{ ...previous, role: "history" as const }] : []), ...remaining];
    return oneClickAssetReferencePatch(asset, next, next[0]);
}

/** 移除一张参考图；若删掉的是主图，主图顺延到剩余第一张。 */
export function removeOneClickAssetReference(asset: DramaNamedAsset, referenceId: string) {
    const references = dramaAssetReferences(asset);
    if (!references.some((item) => item.id === referenceId)) throw new OneClickAssetReferenceError("参考图不存在", 404);
    const next = references.filter((item) => item.id !== referenceId);
    const previous = dramaAssetPrimaryReference(asset);
    const primary = previous && previous.id !== referenceId ? previous : next[0];
    return oneClickAssetReferencePatch(asset, next, primary);
}

/** 把资产补丁写回项目的对应集合，返回新的项目对象（纯函数，不落库）。 */
export function applyOneClickAssetPatch(project: DramaProject, kind: OneClickAssetKind, assetId: string, patch: Partial<DramaNamedAsset>): DramaProject {
    const assets = (project[kind] as DramaNamedAsset[] | undefined) || [];
    if (!assets.some((item) => item.id === assetId)) throw new OneClickAssetReferenceError("资产不存在", 404);
    return { ...project, [kind]: assets.map((item) => (item.id === assetId ? { ...item, ...patch } : item)) } as DramaProject;
}
