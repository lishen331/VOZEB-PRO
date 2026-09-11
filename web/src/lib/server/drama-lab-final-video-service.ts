import { createHash, randomUUID } from "node:crypto";

import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { createStoredGenerationTask, getStoredGenerationTask, getStoredGenerationTaskByRequest, transitionStoredGenerationTask } from "@/lib/server/generation-task-store";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadMediaToFile } from "@/lib/server/media-download";
import { runFfmpeg, runFfprobe } from "@/lib/server/ffmpeg";
import { writeReferenceMediaFile } from "@/lib/server/reference-asset-store";

const TTL_MS = 24 * 60 * 60 * 1000;
export const DRAMA_LAB_FINAL_VIDEO_TASK_KIND = "drama_lab_final_video" as const;

export class DramaLabFinalVideoError extends Error {
    constructor(
        message: string,
        readonly status = 422,
    ) {
        super(message);
    }
}

type FinalVideoInput = { userId: string; projectId: string; episodeId: string; clientRequestId?: string };
type FinalVideoTaskStatus = "pending" | "running" | "success" | "error" | "cancelled" | "needs_review";
type FinalVideoShotSnapshot = {
    shotId: string;
    order: number;
    videoUrl: string;
    audioMode?: DramaShot["audioMode"];
    audioUrl?: string;
    dialogueAudioUrl?: string;
    narrationAudioUrl?: string;
    subtitle?: string;
    duration: number;
    sourceUpdatedAt: string;
    generationTaskId?: string;
};
export type DramaLabFinalVideoSnapshot = {
    taskKind: typeof DRAMA_LAB_FINAL_VIDEO_TASK_KIND;
    projectId: string;
    episodeId: string;
    ownerUserId: string;
    requesterUserId: string;
    sourceUpdatedAt: string;
    ratio: string;
    shotIds: string[];
    shots: FinalVideoShotSnapshot[];
    inputHash: string;
};
export type DramaLabFinalVideoTask = {
    id: string;
    userId: string;
    status: FinalVideoTaskStatus;
    createdAt: number;
    updatedAt: number;
    surface: "drama";
    featureModule: "drama-lab";
    projectId: string;
    episodeId: string;
    clientRequestId?: string;
    taskKind: typeof DRAMA_LAB_FINAL_VIDEO_TASK_KIND;
    inputSnapshot: DramaLabFinalVideoSnapshot;
    error?: string;
    result?: { artifactId: string; url: string; mimeType: string };
    attemptNo?: number;
};

export type FinalVideoExecutionDeps = {
    download?: typeof downloadMediaToFile;
    ffmpeg?: typeof runFfmpeg;
    ffprobe?: typeof runFfprobe;
    writeArtifact?: typeof writeReferenceMediaFile;
    tempRoot?: string;
};

export async function executeDramaLabFinalVideoTask(taskId: string, deps: FinalVideoExecutionDeps = {}) {
    const task = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", taskId);
    if (!task || task.taskKind !== DRAMA_LAB_FINAL_VIDEO_TASK_KIND) throw new DramaLabFinalVideoError("成片任务不存在", 404);
    if (task.status === "cancelled") return task;
    if (task.status === "success") return task;
    const current = await updateFinalVideoTask(task, { status: "running", error: undefined });
    if (!current) throw new DramaLabFinalVideoError("成片任务状态已变化", 409);
    const workdir = await mkdtemp(join(deps.tempRoot || tmpdir(), "vozeb-final-video-"));
    const download = deps.download || downloadMediaToFile;
    const ffmpeg = deps.ffmpeg || runFfmpeg;
    const ffprobe = deps.ffprobe || runFfprobe;
    const writeArtifact = deps.writeArtifact || writeReferenceMediaFile;
    const origin = "http://localhost";
    try {
        const files: string[] = [];
        for (const shot of current.inputSnapshot.shots) {
            const file = join(workdir, `${files.length}.mp4`);
            await download(shot.videoUrl, file, { origin, maxBytes: 300 * 1024 * 1024 });
            files.push(file);
            const latest = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", taskId);
            if (latest?.status === "cancelled") return latest;
        }
        const concatFile = join(workdir, "inputs.txt");
        await writeFile(concatFile, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
        const output = join(workdir, "final.mp4");
        await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", output], { cwd: workdir });
        const afterFfmpeg = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", taskId);
        if (afterFfmpeg?.status === "cancelled") return afterFfmpeg;
        const probe = await ffprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type,width,height", "-of", "json", output], { cwd: workdir });
        if (!probe.stdout.includes("video")) throw new DramaLabFinalVideoError("成片缺少视频流", 422);
        const stored = await writeArtifact(output, "video", "video/mp4", true, {
            ownerUserId: current.inputSnapshot.ownerUserId,
            source: "drama-lab-final-video",
            taskId: taskId,
            projectId: current.projectId,
            originalName: "短剧成片.mp4",
            conversationId: undefined,
        });
        const beforePublish = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", taskId);
        if (beforePublish?.status === "cancelled") return beforePublish;
        return (await updateFinalVideoTask(current, { status: "success", result: { artifactId: stored.token, url: stored.url || `/api/reference-assets/${stored.token}`, mimeType: "video/mp4" } })) || current;
    } catch (error) {
        const latest = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", taskId);
        if (latest?.status === "cancelled") return latest;
        return (await updateFinalVideoTask(current, { status: "error", error: error instanceof Error ? error.message : "成片合成失败" })) || current;
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function updateFinalVideoTask(task: DramaLabFinalVideoTask, patch: Partial<DramaLabFinalVideoTask> & { status: FinalVideoTaskStatus }) {
    return transitionStoredGenerationTask("render", task.id, task.userId, [task.status], patch, TTL_MS);
}

export async function getDramaLabFinalVideoTask(input: { userId: string; projectId: string; taskId: string; episodeId?: string; clientRequestId?: string }) {
    const task = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", input.taskId);
    if (!task || task.taskKind !== DRAMA_LAB_FINAL_VIDEO_TASK_KIND || task.projectId !== input.projectId || (input.episodeId && task.episodeId !== input.episodeId)) throw new DramaLabFinalVideoError("成片任务不存在", 404);
    await assertFinalVideoProjectAccess(input.userId, input.projectId, input.episodeId || task.episodeId);
    return publicFinalVideoTask(task);
}

export async function cancelDramaLabFinalVideoTask(input: { userId: string; projectId: string; taskId: string; episodeId?: string; clientRequestId?: string }) {
    const task = await getFinalVideoTaskForUser(input);
    if (!["pending", "running"].includes(task.status)) throw new DramaLabFinalVideoError("当前成片任务无法取消", 409);
    const cancelled = await updateFinalVideoTask(task, { status: "cancelled", error: "任务已取消" });
    if (!cancelled) throw new DramaLabFinalVideoError("任务状态已变化，无法取消", 409);
    return publicFinalVideoTask(cancelled);
}

export async function retryDramaLabFinalVideoTask(input: { userId: string; projectId: string; taskId: string; episodeId?: string; clientRequestId?: string }) {
    const task = await getFinalVideoTaskForUser(input);
    if (!["error", "cancelled", "needs_review"].includes(task.status)) throw new DramaLabFinalVideoError("当前成片任务不可重试", 409);
    await assertFinalVideoProjectAccess(input.userId, input.projectId, input.episodeId || task.episodeId);
    const now = Date.now();
    const retry: DramaLabFinalVideoTask = {
        ...task,
        id: randomUUID(),
        status: "pending",
        createdAt: now,
        updatedAt: now,
        attemptNo: (task.attemptNo || 1) + 1,
        error: undefined,
        result: undefined,
    };
    const created = await createStoredGenerationTask("render", retry, TTL_MS);
    return publicFinalVideoTask(created);
}

export function publicFinalVideoTask(task: DramaLabFinalVideoTask) {
    return {
        id: task.id,
        projectId: task.projectId,
        episodeId: task.episodeId,
        status: task.status,
        taskKind: task.taskKind,
        attemptNo: task.attemptNo || 1,
        clientRequestId: task.clientRequestId,
        inputHash: task.inputSnapshot.inputHash,
        shotIds: task.inputSnapshot.shotIds,
        result: task.result,
        error: task.status === "error" || task.status === "needs_review" ? "成片任务执行失败" : task.error === "任务已取消" ? task.error : undefined,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
    };
}

async function getFinalVideoTaskForUser(input: { userId: string; projectId: string; taskId: string; episodeId?: string; clientRequestId?: string }) {
    const task = await getStoredGenerationTask<DramaLabFinalVideoTask>("render", input.taskId);
    if (!task || task.taskKind !== DRAMA_LAB_FINAL_VIDEO_TASK_KIND || task.projectId !== input.projectId || (input.episodeId && task.episodeId !== input.episodeId)) throw new DramaLabFinalVideoError("成片任务不存在", 404);
    await assertFinalVideoProjectAccess(input.userId, input.projectId, input.episodeId || task.episodeId);
    return task;
}

async function assertFinalVideoProjectAccess(userId: string, projectId: string, episodeId: string) {
    const resolved = await resolveDramaLabProjectForRequest(userId, projectId);
    if (!resolved?.project?.episodes.some((episode) => episode.id === episodeId)) throw new DramaLabFinalVideoError("成片任务不存在", 404);
}
export async function createDramaLabFinalVideoTask(input: FinalVideoInput) {
    const projectResolution = await resolveDramaLabProjectForRequest(input.userId, input.projectId);
    const project = projectResolution?.project;
    if (!project) throw new DramaLabFinalVideoError("短剧项目不存在", 404);
    const ownerUserId = projectResolution.ownerUserId;
    const episode = project.episodes.find((item) => item.id === input.episodeId);
    if (!episode) throw new DramaLabFinalVideoError("短剧剧集不存在", 404);
    await assertDramaLabStageAllowed(input.userId, input.projectId, "final_export", { episodeId: input.episodeId, resourceType: "episode", resourceId: input.episodeId });
    const requestId = input.clientRequestId?.trim() || undefined;
    if (requestId) {
        const existing = await getStoredGenerationTaskByRequest<DramaLabFinalVideoTask>("render", input.userId, requestId);
        if (existing && existing.taskKind === DRAMA_LAB_FINAL_VIDEO_TASK_KIND) {
            if (existing.projectId !== input.projectId || existing.episodeId !== input.episodeId) throw new DramaLabFinalVideoError("请求标识已用于其他剧集", 409);
            const nextSnapshot = buildFinalVideoSnapshot(project, episode, ownerUserId, input.userId);
            if (existing.inputSnapshot.inputHash !== nextSnapshot.inputHash) throw new DramaLabFinalVideoError("当前请求的素材已变化，请重新提交", 409);
            return existing;
        }
    }
    const snapshot = buildFinalVideoSnapshot(project, episode, ownerUserId, input.userId);
    const now = Date.now();
    const task: DramaLabFinalVideoTask = {
        id: randomUUID(),
        userId: input.userId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        surface: "drama",
        featureModule: "drama-lab",
        projectId: project.id,
        episodeId: episode.id,
        clientRequestId: requestId,
        attemptNo: 1,
        taskKind: DRAMA_LAB_FINAL_VIDEO_TASK_KIND,
        inputSnapshot: snapshot,
    };
    const created = await createStoredGenerationTask("render", task, TTL_MS);
    if (created.taskKind !== DRAMA_LAB_FINAL_VIDEO_TASK_KIND || created.projectId !== task.projectId || created.episodeId !== task.episodeId || created.inputSnapshot.inputHash !== task.inputSnapshot.inputHash)
        throw new DramaLabFinalVideoError("成片任务请求标识发生冲突", 409);
    return created;
}

function buildFinalVideoSnapshot(project: DramaProject, episode: DramaEpisode, ownerUserId: string, requesterUserId: string): DramaLabFinalVideoSnapshot {
    const shots = [...(episode.shots || [])]
        .sort((a, b) => a.order - b.order)
        .map((shot) => {
            const videoUrl = shot.videoUrl?.trim();
            if (!videoUrl) throw new DramaLabFinalVideoError(`分镜 ${shot.id} 尚未完成视频`, 400);
            const audio = shot.audioMode === "mute" ? {} : { audioUrl: shot.audioUrl, dialogueAudioUrl: shot.dialogueAudio?.url, narrationAudioUrl: shot.narrationAudio?.url };
            return { shotId: shot.id, order: shot.order, videoUrl, audioMode: shot.audioMode, ...audio, subtitle: shot.subtitle, duration: shot.duration, sourceUpdatedAt: project.updatedAt, generationTaskId: shot.generationTaskId };
        });
    if (!shots.length) throw new DramaLabFinalVideoError("当前剧集没有可合成的分镜", 400);
    const base = {
        taskKind: DRAMA_LAB_FINAL_VIDEO_TASK_KIND,
        projectId: project.id,
        episodeId: episode.id,
        ownerUserId,
        requesterUserId,
        sourceUpdatedAt: project.updatedAt,
        ratio: project.ratio,
        shotIds: shots.map((shot) => shot.shotId),
        shots,
    };
    return { ...base, inputHash: createHash("sha256").update(JSON.stringify(base)).digest("hex") };
}
