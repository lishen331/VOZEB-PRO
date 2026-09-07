import type { Asset } from "@/lib/library-asset-contract";

export type DramaLibraryAssetType = "character" | "scene" | "prop";

export const DRAMA_LIBRARY_ASSET_LABELS: Record<DramaLibraryAssetType, string> = {
    character: "角色",
    scene: "场景",
    prop: "道具",
};

export function dramaLibraryAssetType(asset: Pick<Asset, "metadata" | "tags">): DramaLibraryAssetType | undefined {
    const explicit = asset.metadata?.dramaAssetType;
    if (explicit === "character" || explicit === "scene" || explicit === "prop") return explicit;
    if (!asset.tags.includes("短剧")) return undefined;
    return (Object.entries(DRAMA_LIBRARY_ASSET_LABELS) as Array<[DramaLibraryAssetType, string]>).find(([, label]) => asset.tags.includes(label))?.[0];
}

export function isDramaLibraryAsset(asset: Pick<Asset, "metadata" | "tags">, type: DramaLibraryAssetType) {
    return dramaLibraryAssetType(asset) === type;
}
