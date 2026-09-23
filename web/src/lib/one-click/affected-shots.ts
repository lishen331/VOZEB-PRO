import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

export type OneClickAssetKind = "characters" | "scenes" | "props";

export type AffectedShot = { episodeId: string; shot: DramaShot; index: number };

/**
 * 找出引用了该资产的分镜，对应 L 的 `getCharAffectedStoryboards` /
 * `getPropAffectedStoryboards` / `getSceneAffectedStoryboards`。
 *
 * 判定依据就是分镜自身的绑定字段：角色看 `characterIds`、道具看 `propIds`、
 * 场景看 `sceneId`。纯派生，不需要服务端支持 —— 改了资产设定图后，
 * 用户需要知道"哪些分镜图会跟着过时"。
 *
 * `index` 是分镜在本集中的序号（从 1 开始），用于显示 L 的 `#N` 标号。
 */
export function findAffectedShots(project: DramaProject, kind: OneClickAssetKind, assetId: string): AffectedShot[] {
    const id = assetId.trim();
    if (!id) return [];
    const out: AffectedShot[] = [];
    for (const episode of project.episodes) {
        episode.shots.forEach((shot, position) => {
            if (shotReferencesAsset(shot, kind, id)) out.push({ episodeId: episode.id, shot, index: position + 1 });
        });
    }
    return out;
}

/** 单个分镜是否引用了该资产。 */
export function shotReferencesAsset(shot: DramaShot, kind: OneClickAssetKind, assetId: string) {
    if (kind === "characters") return (shot.characterIds || []).includes(assetId);
    if (kind === "props") return (shot.propIds || []).includes(assetId);
    return shot.sceneId === assetId;
}

/** 只取某一集内受影响的分镜（资产面板当前只操作打开的那一集）。 */
export function findAffectedShotsInEpisode(episode: DramaEpisode, kind: OneClickAssetKind, assetId: string): AffectedShot[] {
    const id = assetId.trim();
    if (!id) return [];
    return episode.shots.flatMap((shot, position) => (shotReferencesAsset(shot, kind, id) ? [{ episodeId: episode.id, shot, index: position + 1 }] : []));
}
