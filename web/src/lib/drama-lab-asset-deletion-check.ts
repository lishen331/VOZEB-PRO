import type { DramaAssetVisualDetails } from "@/lib/drama-project-contract";

export type DramaAssetKind = "characters" | "scenes" | "props";
export type DramaAssetImpactShot = { id: string; shotNumber: number; title?: string; episodeId: string };
export type DramaAssetDeletionCheck = { assetId: string; kind: DramaAssetKind; canDelete: boolean; requiresConfirmation: boolean; affectedShots: DramaAssetImpactShot[]; message: string };

export function checkDramaAssetDeletion(input: {
    assetId: string;
    kind: DramaAssetKind;
    asset?: DramaAssetVisualDetails & { id?: string; name?: string };
    shots: Array<DramaAssetImpactShot & { sceneId?: string; characterIds?: string[]; propIds?: string[] }>;
}): DramaAssetDeletionCheck {
    const affectedShots = input.shots
        .filter((shot) => (input.kind === "scenes" ? shot.sceneId === input.assetId : input.kind === "characters" ? shot.characterIds?.includes(input.assetId) : shot.propIds?.includes(input.assetId)))
        .map(({ id, shotNumber, title, episodeId }) => ({ id, shotNumber, title, episodeId }));
    const name = input.asset?.name?.trim() || input.assetId;
    return {
        assetId: input.assetId,
        kind: input.kind,
        canDelete: false,
        requiresConfirmation: affectedShots.length > 0,
        affectedShots,
        message: affectedShots.length ? `“${name}”已被${affectedShots.length}个分镜引用，删除前必须确认影响范围` : `“${name}”当前未关联分镜，可在删除契约完成后操作`,
    };
}
