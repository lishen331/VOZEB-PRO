import { createHash, randomUUID } from "node:crypto";

import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { createStoredGenerationTask, getStoredGenerationTaskByRequest } from "@/lib/server/generation-task-store";

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
    status: "pending";
    createdAt: number;
    updatedAt: number;
    surface: "drama";
    featureModule: "drama-lab";
    projectId: string;
    episodeId: string;
    clientRequestId?: string;
    taskKind: typeof DRAMA_LAB_FINAL_VIDEO_TASK_KIND;
    inputSnapshot: DramaLabFinalVideoSnapshot;
};

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
        if (existing && existing.taskKind === DRAMA_LAB_FINAL_VIDEO_TASK_KIND) return existing;
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
        taskKind: DRAMA_LAB_FINAL_VIDEO_TASK_KIND,
        inputSnapshot: snapshot,
    };
    return createStoredGenerationTask("render", task, TTL_MS);
}

function buildFinalVideoSnapshot(project: DramaProject, episode: DramaEpisode, ownerUserId: string, requesterUserId: string): DramaLabFinalVideoSnapshot {
    const shots = [...(episode.shots || [])]
        .sort((a, b) => a.order - b.order)
        .map((shot) => {
            const videoUrl = shot.videoUrl?.trim();
            if (!videoUrl) throw new DramaLabFinalVideoError(`分镜 ${shot.id} 尚未完成视频`, 400);
            const audio = shot.audioMode === "mute" ? {} : { audioUrl: shot.audioUrl, dialogueAudioUrl: shot.dialogueAudio?.url, narrationAudioUrl: shot.narrationAudio?.url };
            return { shotId: shot.id, order: shot.order, videoUrl, ...audio, subtitle: shot.subtitle, duration: shot.duration, sourceUpdatedAt: project.updatedAt, generationTaskId: shot.generationTaskId };
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
