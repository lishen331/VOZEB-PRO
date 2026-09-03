import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DramaProject, DramaShot, DramaShotFrameCandidate, DramaShotFrameState } from "@/lib/drama-project-contract";
import { appendDramaLabGenerationHistory, DramaLabShotGenerationError, findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { ffmpegAvailable, runFfmpeg, runFfprobe } from "@/lib/server/ffmpeg";
import { downloadMediaToFile } from "@/lib/server/media-download";
import { writeReferenceMediaFile } from "@/lib/server/reference-asset-store";
import { getVideoTask } from "@/lib/server/video-task-store";
import { getLocalMediaRegistration } from "@/lib/server/local-media-registry";
import { localMediaStorageKeyFromValue } from "@/lib/server/local-media-references";

const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_FRAME_BYTES = 20 * 1024 * 1024;

export type DramaLabTailFrameExtractionInput = {
    userId: string;
    /** Storage owner for the project aggregate; task/media ownership stays userId. */
    projectOwnerUserId?: string;
    origin: string;
    cookie: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
};

export type DramaLabTailFrameExtractionResult = {
    frame: DramaShotFrameState;
    nextShot: { id: string; candidate: DramaShotFrameCandidate } | null;
};

export type DramaLabFirstFrameCandidateInput = {
    userId: string;
    /** Storage owner for the project aggregate; task/media ownership stays userId. */
    projectOwnerUserId?: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
    candidateId: string;
    replaceExisting?: boolean;
};

export type DramaLabFirstFrameCandidateResult = {
    shot: DramaShot;
    candidate: null;
    replaced?: boolean;
};

/**
 * Extract the real tail frame from the current shot's completed video.
 * The extracted image is stored independently; the next shot only receives
 * a candidate until a later confirmation request binds it as its first frame.
 */
export async function extractDramaLabTailFrame(input: DramaLabTailFrameExtractionInput): Promise<DramaLabTailFrameExtractionResult> {
    const { episode, shot } = findShot(input.project, input.episodeId, input.shotId);
    const generationTaskId = shot.generationTaskId?.trim();
    if (!generationTaskId) throw new DramaLabShotGenerationError("当前分镜没有可提取尾帧的视频任务", 409);

    const task = await getVideoTask(generationTaskId);
    if (task && isProjectActor(task.userId, input) && !taskBelongsToShot(task, input.project.id, input.episodeId, shot.id)) throw new DramaLabShotGenerationError("video task context does not match this drama shot", 409);
    if (!task || !isProjectActor(task.userId, input)) throw new DramaLabShotGenerationError("当前分镜的视频任务不存在或不属于当前项目成员", 409);
    if (task.status !== "success") throw new DramaLabShotGenerationError("当前分镜的视频任务尚未成功完成", 409);

    const taskResult = task.result as Record<string, unknown> | undefined;
    const sourceUrl = [task.result?.url, taskResult?.serverUrl, task.result?.remoteUrl, taskResult?.dataUrl].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || "";
    if (!isPersistentMediaUrl(sourceUrl)) throw new DramaLabShotGenerationError("当前分镜的视频结果地址不可用，请先同步视频结果", 409);

    const nextShot = nextDramaLabShot(episode.shots, shot);
    const existingTail = shot.frames?.last;
    if (existingTail?.locked && !(await isReusableTailFrame(existingTail, generationTaskId, input))) {
        throw new DramaLabShotGenerationError("当前分镜尾帧已锁定，不能被新的提取结果覆盖", 409);
    }
    const existingCandidate = nextShot?.firstFrameCandidate;
    if (nextShot && existingCandidate && (await isReusableCandidate(existingCandidate, nextShot, input))) {
        return { frame: shot.frames?.last || candidateAsFrame(existingCandidate), nextShot: { id: nextShot.id, candidate: existingCandidate } };
    }

    // A successful extraction may have persisted the current tail before the
    // candidate write was interrupted (for example, an autosave conflict or a
    // page refresh). Reuse that registered media instead of downloading and
    // extracting the same video again. A locked frame is never replaced by a
    // different source task; a valid same-task frame remains reusable.
    if (await isReusableTailFrame(existingTail, generationTaskId, input)) {
        return ensureNextShotCandidate({ input, shot, nextShot, frame: existingTail!, generationTaskId });
    }

    if (!(await ffmpegAvailable())) throw new DramaLabShotGenerationError("当前服务器未安装 FFmpeg，无法提取视频尾帧", 503);

    const workdir = await mkdtemp(join(tmpdir(), "vozeb-pro-tail-frame-"));
    const sourcePath = join(workdir, "source-video");
    const outputPath = join(workdir, "tail-frame.jpg");
    try {
        try {
            await downloadMediaToFile(sourceUrl, sourcePath, {
                origin: input.origin,
                cookie: input.cookie,
                maxBytes: MAX_VIDEO_BYTES,
            });
            await runFfmpeg(["-sseof", "-1", "-i", sourcePath, "-update", "1", "-frames:v", "1", "-q:v", "2", "-y", outputPath], { cwd: workdir, timeoutMs: 3 * 60_000 });
            const outputStat = await stat(outputPath);
            if (!outputStat.isFile() || outputStat.size <= 0 || outputStat.size > MAX_FRAME_BYTES) throw new Error("尾帧图片为空或超过大小限制");
        } catch (error) {
            throw new DramaLabShotGenerationError(`视频尾帧提取失败：${error instanceof Error ? error.message : "未知错误"}`, 502);
        }

        const dimensions = await readFrameDimensions(outputPath, workdir);
        let asset: Awaited<ReturnType<typeof writeReferenceMediaFile>>;
        try {
            asset = await writeReferenceMediaFile(outputPath, "image", "image/jpeg", true, {
                ownerUserId: input.projectOwnerUserId || input.userId,
                source: "drama-lab-tail-frame",
                taskId: generationTaskId,
                projectId: input.project.id,
                originalName: `${shot.id}-tail-frame.jpg`,
                maxBytes: MAX_FRAME_BYTES,
            });
        } catch (error) {
            throw new DramaLabShotGenerationError(`视频尾帧持久化失败：${error instanceof Error ? error.message : "未知错误"}`, 502);
        }

        const frameUrl = asset.url || `/api/reference-assets/${asset.token}`;
        const sourceVideoHistoryId = shot.videoHistory?.find((entry) => entry.taskId === generationTaskId)?.id || generationTaskId;
        const frame: DramaShotFrameState = {
            ...(shot.frames?.last || {}),
            prompt: shot.frames?.last?.prompt || `从视频任务 ${generationTaskId} 提取的真实尾帧`,
            description: shot.frames?.last?.description || "从当前分镜已完成视频提取的真实最后一帧",
            status: "success",
            taskId: generationTaskId,
            url: frameUrl,
            storageKey: asset.token,
            width: dimensions.width,
            height: dimensions.height,
            error: undefined,
            source: "video_tail",
            sourceVideoTaskId: generationTaskId,
            sourceShotId: shot.id,
            sourceVideoHistoryId,
            locked: true,
        };

        const persistedCurrent = await persistDramaLabShotUpdate({
            userId: input.userId,
            projectOwnerUserId: input.projectOwnerUserId,
            project: input.project,
            episodeId: input.episodeId,
            shotId: shot.id,
            patch: { frames: { ...shot.frames, last: frame } },
            // Do not replay a stale full-frames patch after a conflict. A
            // concurrent frame lock must win; the caller can retry against the
            // latest project snapshot instead of overwriting that lock.
            retryOnConflict: false,
        });
        const persistedNextShot = nextDramaLabShot(persistedCurrent.episodes.find((item) => item.id === input.episodeId)?.shots || [], shot.id);
        return ensureNextShotCandidate({ input: { ...input, project: persistedCurrent }, shot, nextShot: persistedNextShot, frame, generationTaskId, sourceVideoHistoryId });
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
}

/**
 * Bind a server-created tail-frame candidate to the next shot. Candidate IDs
 * are resolved from the project snapshot supplied by the authenticated route;
 * a client can never provide an arbitrary media URL as a candidate.
 */
export async function acceptDramaLabFirstFrameCandidate(input: DramaLabFirstFrameCandidateInput): Promise<DramaLabFirstFrameCandidateResult> {
    const { shot } = findShot(input.project, input.episodeId, input.shotId);
    const candidate = shot.firstFrameCandidate;
    if (!candidate || candidate.id !== input.candidateId) throw new DramaLabShotGenerationError("候选首帧不存在或不属于当前项目", 404);
    const source = input.project.episodes.find((episode) => episode.id === input.episodeId)?.shots.find((sourceShot) => sourceShot.id === candidate.sourceShotId);
    if (!source || source.generationTaskId !== candidate.sourceVideoTaskId) throw new DramaLabShotGenerationError("候选首帧的来源分镜无效", 404);
    const sourceEpisode = input.project.episodes.find((episode) => episode.id === input.episodeId);
    const expectedTarget = sourceEpisode ? nextDramaLabShot(sourceEpisode.shots, source) : undefined;
    if (candidate.frameType !== "first" || candidate.source !== "video_tail" || expectedTarget?.id !== shot.id) throw new DramaLabShotGenerationError("candidate target shot is invalid", 404);
    const sourceHistory = source.videoHistory?.find((entry) => entry.id === candidate.sourceVideoHistoryId || entry.taskId === candidate.sourceVideoTaskId);
    if (!sourceHistory && candidate.sourceVideoHistoryId !== candidate.sourceVideoTaskId) throw new DramaLabShotGenerationError("候选首帧的来源视频记录无效", 404);
    const sourceTask = await getVideoTask(candidate.sourceVideoTaskId);
    if (sourceTask && !taskBelongsToShot(sourceTask, input.project.id, input.episodeId, source.id)) throw new DramaLabShotGenerationError("candidate source task is invalid", 404);
    if (!sourceTask || !isProjectActor(sourceTask.userId, input) || sourceTask.status !== "success") throw new DramaLabShotGenerationError("候选首帧的来源视频任务无效", 404);
    if (!candidate.storageKey) throw new DramaLabShotGenerationError("候选首帧媒体未完成登记", 404);
    const registration = await getLocalMediaRegistration(candidate.storageKey);
    if (
        !registration ||
        !isProjectActor(registration.ownerUserId, input) ||
        registration.projectId !== input.project.id ||
        registration.taskId !== candidate.sourceVideoTaskId ||
        registration.type !== "image" ||
        registration.source !== "drama-lab-tail-frame" ||
        registration.storageClass !== "permanent" ||
        Boolean(registration.expiresAt && Date.parse(registration.expiresAt) <= Date.now())
    ) {
        throw new DramaLabShotGenerationError("候选首帧媒体不存在或不属于当前项目", 404);
    }
    if (canonicalReferenceStorageKey(candidate.url) !== normalizeStorageKey(candidate.storageKey)) throw new DramaLabShotGenerationError("candidate media URL does not match its storage key", 404);

    if (registration?.scope !== "reference") throw new DramaLabShotGenerationError("candidate media scope is invalid", 404);
    const currentFirst = shot.frames?.first;
    const hasExistingFirst = Boolean(currentFirst?.url);
    if (hasExistingFirst && currentFirst?.locked) throw new DramaLabShotGenerationError("current first frame is locked", 409);
    if (hasExistingFirst && !input.replaceExisting) throw new DramaLabShotGenerationError("当前镜头已有首帧，请确认是否替换", 409);

    const history =
        hasExistingFirst && currentFirst
            ? appendDramaLabGenerationHistory(currentFirst.history, {
                  id: `frame:first:${currentFirst.taskId || currentFirst.url}`,
                  taskId: currentFirst.taskId || `frame:first:${currentFirst.url}`,
                  url: currentFirst.url!,
                  prompt: currentFirst.prompt || "",
                  createdAt: new Date().toISOString(),
                  width: currentFirst.width,
                  height: currentFirst.height,
              })
            : currentFirst?.history;
    const first: DramaShotFrameState = {
        ...(currentFirst || { prompt: "" }),
        prompt: currentFirst?.prompt || "",
        description: currentFirst?.description || "从上一分镜视频尾帧确认的首帧",
        status: "success",
        taskId: undefined,
        attempt: undefined,
        url: candidate.url,
        storageKey: candidate.storageKey,
        width: candidate.width,
        height: candidate.height,
        error: undefined,
        history,
        source: "video_tail",
        sourceVideoTaskId: candidate.sourceVideoTaskId,
        sourceShotId: candidate.sourceShotId,
        sourceVideoHistoryId: candidate.sourceVideoHistoryId,
        locked: true,
    };
    const persisted = await persistDramaLabShotUpdate({
        userId: input.userId,
        projectOwnerUserId: input.projectOwnerUserId,
        project: input.project,
        episodeId: input.episodeId,
        shotId: input.shotId,
        patch: { frames: { ...shot.frames, first }, firstFrameCandidate: undefined },
        retryOnConflict: false,
    });
    return { shot: findShot(persisted, input.episodeId, input.shotId).shot, candidate: null, ...(hasExistingFirst ? { replaced: true } : {}) };
}

function nextDramaLabShot(shots: DramaShot[], current: DramaShot | string) {
    const currentOrder = typeof current === "string" ? shots.find((shot) => shot.id === current)?.order : current.order;
    if (currentOrder === undefined) return undefined;
    return shots.filter((candidate) => candidate.id !== (typeof current === "string" ? current : current.id) && candidate.order > currentOrder).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0];
}

function candidateAsFrame(candidate: DramaShotFrameCandidate): DramaShotFrameState {
    return {
        prompt: "",
        description: "从上一分镜视频尾帧生成的首帧候选",
        status: "success",
        url: candidate.url,
        storageKey: candidate.storageKey,
        width: candidate.width,
        height: candidate.height,
        source: "video_tail",
        sourceVideoTaskId: candidate.sourceVideoTaskId,
        sourceShotId: candidate.sourceShotId,
        sourceVideoHistoryId: candidate.sourceVideoHistoryId,
        locked: false,
    };
}

type EnsureCandidateInput = {
    input: DramaLabTailFrameExtractionInput;
    shot: DramaShot;
    nextShot: DramaShot | undefined;
    frame: DramaShotFrameState;
    generationTaskId: string;
    sourceVideoHistoryId?: string;
};

async function ensureNextShotCandidate(args: EnsureCandidateInput): Promise<DramaLabTailFrameExtractionResult> {
    const { input, shot, nextShot, frame, generationTaskId } = args;
    if (!nextShot) return { frame, nextShot: null };
    const existingCandidate = nextShot.firstFrameCandidate;
    if (existingCandidate) {
        // Never replace a candidate produced from another video task. It may
        // represent a deliberate pending choice from a newer workflow.
        if (existingCandidate.sourceVideoTaskId !== generationTaskId || (await isRegisteredTailFrameMedia(existingCandidate.storageKey, existingCandidate.url, generationTaskId, input))) {
            return { frame, nextShot: { id: nextShot.id, candidate: existingCandidate } };
        }
    }

    // A reusable frame must already be registered by the media store. This is
    // also what the candidate acceptance endpoint uses to prove ownership.
    if (!frame.storageKey || !isPersistentMediaUrl(frame.url || "")) return { frame, nextShot: null };
    const sourceVideoHistoryId = frame.sourceVideoHistoryId || args.sourceVideoHistoryId || shot.videoHistory?.find((entry) => entry.taskId === generationTaskId)?.id || generationTaskId;
    const candidate: DramaShotFrameCandidate = {
        id: stableCandidateId(generationTaskId, nextShot.id),
        frameType: "first",
        url: frame.url!,
        storageKey: frame.storageKey,
        width: frame.width,
        height: frame.height,
        source: "video_tail",
        sourceVideoTaskId: generationTaskId,
        sourceShotId: shot.id,
        sourceVideoHistoryId,
        createdAt: new Date().toISOString(),
        projectUpdatedAt: input.project.updatedAt,
    };
    const persisted = await persistDramaLabShotUpdate({
        userId: input.userId,
        projectOwnerUserId: input.projectOwnerUserId,
        project: input.project,
        episodeId: input.episodeId,
        shotId: nextShot.id,
        patch: { firstFrameCandidate: candidate },
        // The candidate is derived from this snapshot. If the next shot was
        // edited or its candidate was accepted concurrently, surface the
        // conflict instead of replaying a stale candidate onto the latest
        // project state.
        retryOnConflict: false,
    });
    const latestNextShot = nextDramaLabShot(persisted.episodes.find((item) => item.id === input.episodeId)?.shots || [], shot.id);
    return { frame, nextShot: latestNextShot?.firstFrameCandidate ? { id: latestNextShot.id, candidate: latestNextShot.firstFrameCandidate } : { id: nextShot.id, candidate } };
}

async function isReusableTailFrame(frame: DramaShotFrameState | undefined, generationTaskId: string, input: Pick<DramaLabTailFrameExtractionInput, "userId" | "project" | "projectOwnerUserId">) {
    if (!frame || frame.source !== "video_tail" || frame.sourceVideoTaskId !== generationTaskId || frame.status !== "success") return false;
    return isRegisteredTailFrameMedia(frame.storageKey, frame.url, generationTaskId, input);
}

async function isReusableCandidate(candidate: DramaShotFrameCandidate, targetShot: DramaShot, input: DramaLabTailFrameExtractionInput) {
    if (candidate.frameType !== "first" || candidate.source !== "video_tail") return false;
    const episode = input.project.episodes.find((item) => item.id === input.episodeId);
    const sourceShot = episode?.shots.find((item) => item.id === candidate.sourceShotId);
    if (!sourceShot || sourceShot.generationTaskId !== candidate.sourceVideoTaskId) return false;
    const expectedTarget = nextDramaLabShot(episode?.shots || [], sourceShot);
    if (!expectedTarget || expectedTarget.id !== targetShot.id) return false;
    const sourceTask = await getVideoTask(candidate.sourceVideoTaskId);
    if (!sourceTask || !isProjectActor(sourceTask.userId, input) || sourceTask.status !== "success") return false;
    if (!taskBelongsToShot(sourceTask, input.project.id, input.episodeId, sourceShot.id)) return false;
    return isRegisteredTailFrameMedia(candidate.storageKey, candidate.url, candidate.sourceVideoTaskId, input);
}

function taskBelongsToShot(task: { surface?: string; projectId?: string; episodeId?: string; shotId?: string } | null | undefined, projectId: string, episodeId: string, shotId: string) {
    if (!task) return false;
    const contextValues = [task.surface, task.projectId, task.episodeId, task.shotId].filter(Boolean);
    // Preserve access to tasks created before the drama task-context contract;
    // any task that carries context must match the current shot exactly.
    if (!contextValues.length) return true;
    return task.surface === "drama" && task.projectId === projectId && task.episodeId === episodeId && task.shotId === shotId;
}

function canonicalReferenceStorageKey(url: string | undefined) {
    const value = typeof url === "string" ? url.trim().replace(/\\/g, "/") : "";
    if (!value.startsWith("/api/reference-assets/")) return "";
    return localMediaStorageKeyFromValue(value);
}

function normalizeStorageKey(value: string) {
    return value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Tasks and registered media may have been created by the project owner
 * while an active collaborator performs the current request. Keep the
 * caller/member identity for audit and billing, but accept the owner-backed
 * resource only after the route has already resolved project membership. */
function isProjectActor(actorId: string | undefined, input: { userId: string; projectOwnerUserId?: string }) {
    if (!actorId) return false;
    return actorId === input.userId || actorId === (input.projectOwnerUserId || input.userId);
}

async function isRegisteredTailFrameMedia(storageKey: string | undefined, url: string | undefined, generationTaskId: string, input: Pick<DramaLabTailFrameExtractionInput, "userId" | "project" | "projectOwnerUserId">) {
    if (!storageKey || !isPersistentMediaUrl(url || "")) return false;
    const registration = await getLocalMediaRegistration(storageKey);
    if (!registration) return false;
    if (registration.scope !== "reference") return false;
    if (registration.storageKey !== normalizeStorageKey(storageKey)) return false;
    if (!isProjectActor(registration.ownerUserId, input)) return false;
    if (registration.projectId !== input.project.id) return false;
    if (registration.taskId !== generationTaskId) return false;
    if (registration.type !== "image") return false;
    if (registration.source !== "drama-lab-tail-frame") return false;
    if (registration.storageClass !== "permanent") return false;
    if (registration.expiresAt && Date.parse(registration.expiresAt) <= Date.now()) return false;
    return canonicalReferenceStorageKey(url) === registration.storageKey;
}

function stableCandidateId(taskId: string, shotId: string) {
    return `tail-frame-${taskId}-${shotId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

function isPersistentMediaUrl(value: string) {
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) return false;
    if (value.startsWith("/")) return true;
    try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

async function readFrameDimensions(path: string, cwd: string) {
    try {
        const result = await runFfprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path], { cwd, timeoutMs: 30_000 });
        const parsed = JSON.parse(result.stdout) as { streams?: Array<{ width?: number; height?: number }> };
        const width = positiveInteger(parsed.streams?.[0]?.width);
        const height = positiveInteger(parsed.streams?.[0]?.height);
        return { width, height };
    } catch {
        return { width: undefined, height: undefined };
    }
}

function positiveInteger(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}
