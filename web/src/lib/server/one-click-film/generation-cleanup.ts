import type { DramaEpisode, DramaProject, DramaShot, DramaShotFrameState } from "@/lib/drama-project-contract";

/** L 的三个删除端点都是"软删生成记录"，这里用同一套 kind 区分。 */
export type OneClickCleanupKind = "image" | "video" | "merge";

export class OneClickCleanupError extends Error {
    readonly status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.name = "OneClickCleanupError";
        this.status = status;
    }
}

export type OneClickCleanupResult = {
    project: DramaProject;
    /** 被删掉的记录数，0 表示没有匹配（调用方据此回 404，与 L 的 '记录不存在' 一致）。 */
    removed: number;
};

/**
 * 删除一条分镜图生成记录，对应 L `DELETE /images/:id`（imageService.deleteById）。
 *
 * L 除了软删 image_generations 那一行，还会**解除分镜首/尾帧绑定**，
 * 避免留下悬空引用（first_frame_image_id / image_url / local_path 一并清空）。
 * V 的等价物是 `storyboardHistory` 里的一条记录，绑定面是
 * `storyboardImageUrl` 与 `frames.first/last`，所以这三处都要一起清。
 */
export function removeOneClickImageRecord(project: DramaProject, episodeId: string, shotId: string, recordId: string): OneClickCleanupResult {
    return mapShot(project, episodeId, shotId, (shot) => {
        const history = shot.storyboardHistory || [];
        const target = history.find((entry) => entry.id === recordId);
        if (!target) return null;

        const patch: Partial<DramaShot> = { storyboardHistory: history.filter((entry) => entry.id !== recordId) };
        // 主图指向被删记录时必须清空，否则界面还在引用一条已删除的记录。
        if (target.url && shot.storyboardImageUrl === target.url) {
            patch.storyboardImageUrl = undefined;
            patch.storyboardImageWidth = undefined;
            patch.storyboardImageHeight = undefined;
        }
        if (target.url && shot.storyboardEndImageUrl === target.url) {
            patch.storyboardEndImageUrl = undefined;
            patch.storyboardEndImageWidth = undefined;
            patch.storyboardEndImageHeight = undefined;
        }

        // 对应 L 清 first_frame_image_id / last_frame_image_id 的那两条 UPDATE。
        const frames = unbindFrames(shot.frames, target.url, target.taskId);
        if (frames.changed) patch.frames = frames.frames;
        if (shot.firstFrameCandidate && matchesRecord(shot.firstFrameCandidate.url, shot.firstFrameCandidate.sourceVideoTaskId, target.url, target.taskId)) {
            patch.firstFrameCandidate = undefined;
        }
        return patch;
    });
}

/**
 * 删除一条分镜视频生成记录，对应 L `DELETE /videos/:id`（videoService.deleteById）。
 *
 * L 这条只软删 video_generations 一行，不解绑分镜（它没有 first_frame_video_id 之类的列）。
 * 但 V 的 `videoUrl` 会指向历史里的某一条，若不清掉就会留下悬空地址 —— 这属于
 * 承载结构差异带来的必要清理，不是给 L 加逻辑。
 */
export function removeOneClickVideoRecord(project: DramaProject, episodeId: string, shotId: string, recordId: string): OneClickCleanupResult {
    return mapShot(project, episodeId, shotId, (shot) => {
        const history = shot.videoHistory || [];
        const target = history.find((entry) => entry.id === recordId);
        if (!target) return null;

        const patch: Partial<DramaShot> = { videoHistory: history.filter((entry) => entry.id !== recordId) };
        if (target.url && shot.videoUrl === target.url) patch.videoUrl = undefined;
        return patch;
    });
}

/**
 * 删除本集的成片记录，对应 L `DELETE /video-merges/:merge_id`（videoMergeService.deleteById）。
 *
 * L 的 video_merges 是一张独立表、可有多条；V 每集只保留一个 `renderTask`，
 * 所以这里按 renderTask.id 匹配删除，语义上等价于"删掉这条成片记录"。
 */
export function removeOneClickMergeRecord(project: DramaProject, episodeId: string, recordId: string): OneClickCleanupResult {
    const episode = findEpisode(project, episodeId);
    if (!episode.renderTask || episode.renderTask.id !== recordId) return { project, removed: 0 };
    const episodes = project.episodes.map((item) => (item.id === episodeId ? { ...item, renderTask: undefined } : item));
    return { project: { ...project, episodes }, removed: 1 };
}

function findEpisode(project: DramaProject, episodeId: string): DramaEpisode {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new OneClickCleanupError("当前剧集不存在", 404);
    return episode;
}

function mapShot(project: DramaProject, episodeId: string, shotId: string, build: (shot: DramaShot) => Partial<DramaShot> | null): OneClickCleanupResult {
    const episode = findEpisode(project, episodeId);
    const shot = episode.shots.find((item) => item.id === shotId);
    if (!shot) throw new OneClickCleanupError("当前分镜不存在", 404);

    const patch = build(shot);
    if (!patch) return { project, removed: 0 };

    const episodes = project.episodes.map((item) => (item.id === episodeId ? { ...item, shots: item.shots.map((entry) => (entry.id === shotId ? { ...entry, ...patch } : entry)) } : item));
    return { project: { ...project, episodes }, removed: 1 };
}

/** 对应 L 把 first/last frame 的 image_id、image_url、local_path 一并置空。 */
function unbindFrames(frames: DramaShot["frames"], url: string | undefined, taskId: string | undefined) {
    if (!frames) return { frames, changed: false };
    let changed = false;
    const next: NonNullable<DramaShot["frames"]> = {};
    for (const [type, frame] of Object.entries(frames) as Array<["first" | "key" | "last", DramaShotFrameState | undefined]>) {
        if (!frame) continue;
        if (matchesRecord(frame.url, frame.taskId, url, taskId)) {
            changed = true;
            // 锁定的帧也要解绑：底层记录已删除，留着就是悬空引用。
            next[type] = { ...frame, url: undefined, storageKey: undefined, width: undefined, height: undefined, status: "idle", locked: false };
            continue;
        }
        next[type] = frame;
    }
    return { frames: next, changed };
}

function matchesRecord(candidateUrl: string | undefined, candidateTaskId: string | undefined, url: string | undefined, taskId: string | undefined) {
    if (url && candidateUrl && candidateUrl === url) return true;
    return Boolean(taskId && candidateTaskId && candidateTaskId === taskId);
}
