import type { DramaProject } from "@/lib/drama-project-contract";
import { getAuthSettings } from "@/lib/auth/store";
import { getAudioTask } from "@/lib/server/audio-task-store";
import { DramaLabAudioError, prepareDramaLabAudio, type DramaLabAudioKind } from "@/lib/server/drama-lab-audio-service";
import { persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { fetchInternalApi } from "@/lib/server/internal-origin";

const KINDS: DramaLabAudioKind[] = ["dialogue", "narration"];

export type OneClickAudioRuntime = { origin: string; cookie: string };

export type OneClickAudioInput = {
    taskId: string;
    userId: string;
    project: DramaProject;
    episodeIds: string[];
    runtime: OneClickAudioRuntime;
    /**
     * 只处理这些分镜。省略表示整集（工作流用法）。
     *
     * 单镜配音复用同一个 runner 而不是复制一份逻辑：上游 context 的
     * `featureModule: "one-click-film"` 只能有一处来源，一旦分叉就容易漏写，
     * 导致商单用量记到教学版账上（这类计费归属 bug 已经出现过一次）。
     */
    shotIds?: string[];
    /** 只处理这些音轨类型。省略表示对白与旁白都做。 */
    kinds?: DramaLabAudioKind[];
};

/**
 * L 的配音步骤只补齐缺失音轨：已有音频直接沿用，进行中的任务继续轮询，
 * 不重复提交 TTS，也不把「没有文本」当成失败。
 */
export async function runOneClickAudioForEpisodes(input: OneClickAudioInput) {
    const childTaskIds: string[] = [];
    const outputRefs: Array<Record<string, unknown>> = [];
    let pending = false;
    let model = "";

    for (const episode of input.project.episodes.filter((item) => input.episodeIds.includes(item.id))) {
        const shots = input.shotIds?.length ? episode.shots.filter((shot) => input.shotIds?.includes(shot.id)) : episode.shots;
        const kinds = input.kinds?.length ? KINDS.filter((kind) => input.kinds?.includes(kind)) : KINDS;
        for (const shot of shots) {
            for (const kind of kinds) {
                let prepared;
                try {
                    prepared = prepareDramaLabAudio(input.project, episode.id, shot.id, kind);
                } catch (error) {
                    // 没有对白/旁白文本的镜头在 L 中直接跳过，不产生任务也不算失败。
                    if (error instanceof DramaLabAudioError && error.status === 400) continue;
                    throw error;
                }

                const state = kind === "narration" ? shot.narrationAudio : shot.dialogueAudio;
                if (state?.url) {
                    if (state.taskId) childTaskIds.push(state.taskId);
                    outputRefs.push({ episodeId: episode.id, shotId: shot.id, kind: kind + "-audio", url: state.url });
                    continue;
                }

                if (state?.taskId) {
                    const existing = await getAudioTask(state.taskId);
                    childTaskIds.push(state.taskId);
                    if (existing?.status === "success" && existing.result?.url) {
                        await persistAudioResult(input, episode.id, shot.id, kind, state.attempt || 1, existing.result.url, state.taskId);
                        outputRefs.push({ episodeId: episode.id, shotId: shot.id, kind: kind + "-audio", url: existing.result.url });
                        continue;
                    }
                    if (existing?.status === "error") throw new Error(existing.error || "配音任务失败（分集 " + episode.id + " 镜头 " + shot.id + "）");
                    if (existing?.status === "pending" || existing?.status === "running") {
                        pending = true;
                        continue;
                    }
                }

                if (!model) {
                    const settings = await getAuthSettings();
                    model = settings.defaultModels.audioModel?.trim() || "";
                    if (!model) throw new Error("后台尚未配置可用的默认音频模型");
                }

                const attemptNo = (state?.attempt || 0) + 1;
                const requestId = input.taskId + ":audio:" + episode.id + ":" + shot.id + ":" + kind + ":attempt-" + attemptNo;
                const response = await fetchInternalApi(input.runtime.origin + "/api/audio-tasks", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        cookie: input.runtime.cookie,
                        "X-VOZEB-PRO-Client-Request-Id": requestId,
                        "X-VOZEB-PRO-Attempt-No": String(attemptNo),
                    },
                    body: JSON.stringify({
                        config: {
                            model,
                            ...(prepared.voice ? { voice: prepared.voice } : {}),
                            ...(Number.isFinite(Number(prepared.speed)) ? { speed: String(prepared.speed) } : {}),
                            ...(prepared.instructions ? { instructions: prepared.instructions.slice(0, 2_000) } : {}),
                        },
                        prompt: prepared.prompt,
                        source: "drama",
                        context: {
                            conversationId: input.project.creativeConversationId,
                            surface: "drama",
                            featureModule: "one-click-film",
                            projectId: input.project.id,
                            episodeId: episode.id,
                            shotId: shot.id,
                            attemptNo,
                            clientRequestId: requestId,
                            audioKind: kind,
                            speaker: prepared.speaker,
                        },
                    }),
                });
                const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string }; error?: string };
                if (!response.ok || !payload.task?.id) throw new Error(payload.error || "配音任务创建失败（分集 " + episode.id + " 镜头 " + shot.id + "）");

                const status = payload.task.status === "success" ? "success" : "running";
                await persistDramaLabShotUpdate({
                    userId: input.userId,
                    project: input.project,
                    episodeId: episode.id,
                    shotId: shot.id,
                    patch: {
                        ...(kind === "narration"
                            ? { narrationAudio: { status, taskId: payload.task.id, attempt: attemptNo, speaker: prepared.speaker, voice: prepared.voice, speed: prepared.speed } }
                            : { dialogueAudio: { status, taskId: payload.task.id, attempt: attemptNo, speaker: prepared.speaker, voice: prepared.voice, speed: prepared.speed } }),
                        audioStatus: status,
                        audioTaskId: payload.task.id,
                        audioAttempt: attemptNo,
                        audioError: undefined,
                    },
                });
                childTaskIds.push(payload.task.id);
                pending = true;
            }
        }
    }

    return { status: pending ? ("pending" as const) : ("success" as const), childTaskIds: [...new Set(childTaskIds)], outputRefs };
}

async function persistAudioResult(input: OneClickAudioInput, episodeId: string, shotId: string, kind: DramaLabAudioKind, attempt: number, url: string, taskId: string) {
    const audioState = { status: "success" as const, taskId, attempt, url };
    await persistDramaLabShotUpdate({
        userId: input.userId,
        project: input.project,
        episodeId,
        shotId,
        patch: {
            ...(kind === "narration" ? { narrationAudio: audioState } : { dialogueAudio: audioState }),
            audioStatus: "success",
            audioTaskId: taskId,
            audioError: undefined,
        },
    });
}
