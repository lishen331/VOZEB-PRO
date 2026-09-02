import type { DramaEpisode, DramaProject, DramaShot, DramaTaskStatus } from "@/lib/drama-project-contract";
import { getAudioTask } from "@/lib/server/audio-task-store";
import { DramaProjectStoreError, updateDramaProject } from "@/lib/server/drama-project-store";
import { hasStoredGenerationTaskContextConflict } from "@/lib/server/generation-task-store";

export class DramaLabAudioError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

export type DramaLabAudioKind = "dialogue" | "narration";

/**
 * Older shots persisted one root audio task without saying which track owned
 * it. Infer that owner once so a legacy narration task cannot be reused for a
 * dialogue request (or vice versa). New shots with either dedicated field do
 * not use this fallback at all.
 */
export function legacyDramaAudioKind(shot: DramaShot): DramaLabAudioKind {
    const utterances = Array.isArray(shot.utterances) ? shot.utterances : [];
    // Legacy production shots often kept dialogue only in `subtitle`.
    // Treat it as dialogue because the old queue used that field for spoken
    // lines and never persisted a separate narration marker.
    const hasDialogue = Boolean(shot.dialogue?.trim() || shot.subtitle?.trim() || utterances.some((item) => item.type === "dialogue" && item.text.trim()));
    const hasNarration = Boolean(shot.narration?.trim() || utterances.some((item) => item.type === "voiceover" && item.text.trim()));
    // `audioMode=voiceover` is the legacy switch for generated audio, not a
    // narration marker. Prefer actual text ownership so old dialogue shots
    // are recovered into the dialogue track instead of being duplicated as
    // narration. If both fields exist, dialogue is the conservative owner.
    if (hasDialogue) return "dialogue";
    if (hasNarration) return "narration";
    return "dialogue";
}

export function legacyDramaAudioTaskId(shot: DramaShot, kind: DramaLabAudioKind) {
    const dedicated = kind === "narration" ? shot.narrationAudio : shot.dialogueAudio;
    if (dedicated) return undefined;
    const legacyTaskId = shot.audioTaskId?.trim() || undefined;
    if (!legacyTaskId) return undefined;
    const opposite = kind === "narration" ? shot.dialogueAudio : shot.narrationAudio;
    if (opposite?.taskId?.trim() === legacyTaskId) return undefined;
    // If only the opposite dedicated track exists, the root projection can
    // still represent this missing track when the persisted text identifies
    // it unambiguously (a common partially-migrated legacy shape).
    if ((shot.dialogueAudio || shot.narrationAudio) && strictLegacyDramaAudioKind(shot) !== kind) return undefined;
    if (legacyDramaAudioKind(shot) !== kind) return undefined;
    return legacyTaskId;
}

export type DramaLabAudioInput = {
    prompt: string;
    kind: DramaLabAudioKind;
    speaker?: string;
    voice?: string;
    speed?: number;
    instructions?: string;
};

export type DramaLabAudioContext = {
    project: DramaProject;
    episode: DramaEpisode;
    shot: DramaShot;
};

/** Resolve a deterministic TTS input from the shot's persisted utterances. */
export function prepareDramaLabAudio(project: DramaProject, episodeId: string, shotId: string, requestedKind: unknown = "dialogue"): DramaLabAudioInput & DramaLabAudioContext {
    const context = findShot(project, episodeId, shotId);
    const kind: DramaLabAudioKind = requestedKind === "narration" ? "narration" : "dialogue";
    // The persisted contract calls the narration utterance type "voiceover";
    // the API deliberately exposes the clearer "narration" track name.
    const utteranceType = kind === "narration" ? "voiceover" : "dialogue";
    const utterances = (Array.isArray(context.shot.utterances) ? context.shot.utterances : []).filter((item) => item.type === utteranceType && item.text.trim());
    const fallback = kind === "narration" ? context.shot.narration?.trim() : context.shot.dialogue?.trim() || context.shot.subtitle?.trim();
    const prompt = (utterances.length ? utterances.map((item) => item.text.trim()).join("\n") : fallback || "").trim();
    if (!prompt) throw new DramaLabAudioError(kind === "narration" ? "当前镜头没有旁白文本" : "当前镜头没有对白文本", 400);
    const speaker = utterances.find((item) => item.speaker.trim())?.speaker.trim();
    const character = speaker ? context.project.characters.find((item) => item.name.trim().toLocaleLowerCase() === speaker.toLocaleLowerCase()) : undefined;
    const profile = character?.voiceProfile;
    return {
        ...context,
        prompt: prompt.slice(0, 20_000),
        kind,
        ...(speaker ? { speaker } : {}),
        ...(profile?.voice ? { voice: profile.voice } : {}),
        ...(profile?.speed ? { speed: profile.speed } : {}),
        ...(profile?.instructions ? { instructions: profile.instructions } : {}),
    };
}

export function findShot(project: DramaProject, episodeId: string, shotId: string): DramaLabAudioContext {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new DramaLabAudioError("短剧剧集不存在", 404);
    const shot = episode.shots.find((item) => item.id === shotId);
    if (!shot) throw new DramaLabAudioError("短剧镜头不存在", 404);
    return { project, episode, shot };
}

export function assertAudioTaskContext(
    task: { userId?: string; surface?: string; projectId?: string; episodeId?: string; shotId?: string; audioKind?: unknown },
    input: { userId: string; projectId: string; episodeId: string; shotId: string; audioKind?: DramaLabAudioKind; shot?: DramaShot; projectOwnerUserId?: string; allowedUserIds?: readonly string[] },
) {
    const allowedUserIds = input.allowedUserIds || [input.userId, input.projectOwnerUserId].filter((value): value is string => Boolean(value));
    if (!task.userId || !allowedUserIds.includes(task.userId) || task.surface !== "drama" || task.projectId !== input.projectId || task.episodeId !== input.episodeId || task.shotId !== input.shotId) {
        throw new DramaLabAudioError("音频任务上下文与当前短剧镜头不匹配", 409);
    }
    const rawTaskKind = typeof task.audioKind === "string" ? task.audioKind.trim() : "";
    const taskKind = rawTaskKind === "narration" || rawTaskKind === "dialogue" ? rawTaskKind : undefined;
    if (rawTaskKind && !taskKind) throw new DramaLabAudioError("音频任务轨道类型无效", 409);
    if (taskKind && input.audioKind && taskKind !== input.audioKind) throw new DramaLabAudioError("audio task kind does not match the requested track", 409);
    // Very old root audio tasks did not persist their track kind.  When the
    // shot has not yet been migrated to dedicated fields, infer ownership
    // from its persisted text instead of allowing an explicit cross-track
    // task id to be attached to the wrong card.
    if (!taskKind && input.audioKind && input.shot) {
        const requestedDedicated = input.audioKind === "narration" ? input.shot.narrationAudio : input.shot.dialogueAudio;
        const inferredKind = input.shot.dialogueAudio || input.shot.narrationAudio
            ? strictLegacyDramaAudioKind(input.shot)
            : legacyDramaAudioKind(input.shot);
        if (!requestedDedicated && inferredKind !== input.audioKind) {
        throw new DramaLabAudioError("旧版音频任务与请求的音频轨道不匹配", 409);
        }
    }
}

/** Ensure a status check can only write the task currently bound to a track. */
export function assertAudioTaskBinding(shot: DramaShot, kind: DramaLabAudioKind, taskId: string) {
    const dedicated = kind === "narration" ? shot.narrationAudio : shot.dialogueAudio;
    // Do not disable the legacy fallback merely because the *opposite* track
    // has already been migrated. During a partial migration the root task can
    // legitimately belong to the still-missing track. `legacyDramaAudioTaskId`
    // performs the strict text-ownership check before returning that ID.
    const boundTaskId = dedicated?.taskId || legacyDramaAudioTaskId(shot, kind);
    if (!boundTaskId || boundTaskId !== taskId) throw new DramaLabAudioError("音频任务未绑定到当前镜头轨道", 409);
}

export async function syncDramaLabAudioTask(input: { userId: string; project: DramaProject; episodeId: string; shotId: string; taskId: string; kind?: DramaLabAudioKind; projectOwnerUserId?: string }) {
    const context = findShot(input.project, input.episodeId, input.shotId);
    const task = await getAudioTask(input.taskId);
    if (!task) throw new DramaLabAudioError("音频任务不存在或已过期", 404);
    if (hasStoredGenerationTaskContextConflict(task)) throw new DramaLabAudioError("音频任务上下文存在冲突，无法安全回写", 409);
    const metadata = task as AudioTaskMetadata;
    const storedTaskKind = audioKindFromMetadata(metadata.audioKind);
    const inferredKind: DramaLabAudioKind = context.shot.narrationAudio && !context.shot.dialogueAudio ? "narration" : !context.shot.narrationAudio && !context.shot.dialogueAudio ? legacyDramaAudioKind(context.shot) : "dialogue";
    const kind: DramaLabAudioKind = input.kind || storedTaskKind || inferredKind;
    assertAudioTaskContext(task, { userId: input.userId, projectOwnerUserId: input.projectOwnerUserId, projectId: input.project.id, episodeId: input.episodeId, shotId: input.shotId, audioKind: kind, shot: context.shot });
    assertAudioTaskBinding(context.shot, kind, task.id);

    const patch: Partial<DramaShot> = {};
    const previousState = kind === "narration" ? context.shot.narrationAudio : context.shot.dialogueAudio;
    const state: NonNullable<DramaShot["dialogueAudio"]> = {
        ...previousState,
        status: task.status === "success" ? "success" : task.status === "error" ? "error" : task.status === "cancelled" ? "cancelled" : "running",
        taskId: task.id,
        attempt: task.attemptNo ?? previousState?.attempt,
        speaker: cleanAudioMetadata(metadata.speaker) || previousState?.speaker,
        voice: cleanAudioMetadata(metadata.config?.voice) || previousState?.voice,
        speed: parseSpeed(metadata.config?.speed) ?? previousState?.speed,
        instructions: cleanAudioMetadata(metadata.config?.instructions) || previousState?.instructions,
        error: undefined,
        url: undefined,
        mimeType: undefined,
    };
    if (task.status === "success") {
        const url = stableUrl(task.result?.url);
        if (!url) {
            state.status = "error";
            state.error = "音频任务完成但没有可播放地址";
        } else {
            state.status = "success";
            state.url = url;
            state.mimeType = task.result?.mimeType;
        }
    } else if (task.status === "error" || task.status === "cancelled") {
        state.status = task.status;
        state.error = task.error || (task.status === "cancelled" ? "音频任务已取消" : "音频生成失败");
    }
    if (kind === "narration") patch.narrationAudio = state;
    else patch.dialogueAudio = state;
    // Keep legacy fields projected to the latest requested track.
    patch.audioStatus = state.status;
    patch.audioAttempt = state.attempt;
    patch.audioTaskId = state.taskId;
    patch.audioError = state.error;
    patch.audioUrl = state.url;

    if (!Object.keys(patch).length) return input.project;
    const latestShot = context.shot;
    const nextEpisode = { ...context.episode, shots: context.episode.shots.map((shot) => (shot.id === latestShot.id ? { ...shot, ...patch } : shot)) };
    const nextProject = { ...input.project, episodes: input.project.episodes.map((episode) => (episode.id === nextEpisode.id ? nextEpisode : episode)), updatedAt: new Date().toISOString() };
    try {
        return await updateDramaProject(input.projectOwnerUserId || input.userId, nextProject, input.project.updatedAt);
    } catch (error) {
        if (error instanceof DramaProjectStoreError) throw new DramaLabAudioError(error.message, error.status);
        throw error;
    }
}

type AudioTaskMetadata = { audioKind?: unknown; speaker?: unknown; config?: { voice?: unknown; speed?: unknown; instructions?: unknown } };

function audioKindFromMetadata(value: unknown): DramaLabAudioKind | undefined {
    return value === "narration" || value === "dialogue" ? value : undefined;
}

function parseSpeed(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.max(0.25, Math.min(4, number)) : undefined;
}

function cleanAudioMetadata(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 2_000) || undefined : undefined;
}

function stableUrl(value: unknown) {
    const url = typeof value === "string" ? value.trim() : "";
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

function strictLegacyDramaAudioKind(shot: DramaShot): DramaLabAudioKind | undefined {
    const utterances = Array.isArray(shot.utterances) ? shot.utterances : [];
    const hasDialogue = Boolean(shot.dialogue?.trim() || shot.subtitle?.trim() || utterances.some((item) => item.type === "dialogue" && item.text.trim()));
    const hasNarration = Boolean(shot.narration?.trim() || utterances.some((item) => item.type === "voiceover" && item.text.trim()));
    if (hasDialogue && !hasNarration) return "dialogue";
    if (hasNarration && !hasDialogue) return "narration";
    return undefined;
}

export function isAudioActive(status: unknown): status is Extract<DramaTaskStatus, "queued" | "pending" | "running"> {
    return status === "queued" || status === "pending" || status === "running";
}
