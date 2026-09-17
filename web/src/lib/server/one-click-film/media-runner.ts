import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getImageTask } from "@/lib/server/image-task-store";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { getVideoTask } from "@/lib/server/video-task-store";
import { syncOneClickShotGeneration } from "./sync-runner";

export type OneClickMediaKind = "image" | "video";

export type OneClickMediaInput = {
    taskId: string;
    userId: string;
    project: DramaProject;
    episodeIds: string[];
    runtime: { origin: string; cookie: string };
};

type ShotRef = { episodeId: string; shot: DramaShot };

/**
 * 分镜图 / 分镜视频步骤。
 *
 * 这里必须走一键成片自有的 /api/one-click-film/.../generate-image|generate-video，
 * 不能再经由 /api/drama-lab/...：后者把上游 context 的 featureModule 写成 "drama-lab"，
 * 会把商单用量记到教学版账上，同时让商单链路依赖教学版的协作阶段闸门。
 *
 * 与 L 一致的关键语义：
 * - 已有成品直接沿用，不重复提交、不重复扣费；
 * - 任务仍在执行时只轮询，绝不重新提交（复用同一个上游 provider task）；
 * - 上游失败即抛错，由父任务转入 error 并允许用户重试；
 * - 逐个分镜推进，任一分镜未完成即返回 pending，父任务下一轮继续。
 */
export async function runOneClickMediaForEpisodes(kind: OneClickMediaKind, input: OneClickMediaInput) {
    let project = input.project;
    const refs = collectShots(input);
    if (!refs.length) throw new Error("一键成片项目没有分镜");

    const childTaskIds: string[] = [];
    const outputRefs: Array<Record<string, unknown>> = [];
    let pending = false;

    for (const { episodeId, shot } of refs) {
        const state = kind === "image" ? imageState(shot) : videoState(shot);

        if (state.url) {
            if (state.taskId) childTaskIds.push(state.taskId);
            outputRefs.push({ episodeId, shotId: shot.id, kind: kind === "image" ? "storyboard-image" : "storyboard-video", url: state.url });
            continue;
        }

        if (state.taskId) {
            childTaskIds.push(state.taskId);
            const task = kind === "image" ? await getImageTask(state.taskId) : await getVideoTask(state.taskId);
            if (task?.status === "error") throw new Error(task.error || `${label(kind)}生成失败（分集 ${episodeId} 分镜 ${shot.id}）`);
            if (task?.status === "cancelled") throw new Error(`${label(kind)}任务已取消（分集 ${episodeId} 分镜 ${shot.id}）`);

            // 关键：结果回写必须由这里主动触发。
            // 调 sync 的原本只有创作工坊工作流服务和创作工坊 UI，images/videos 改走一键成片
            // 自有路由后就没有任何东西会回写商单分镜了，两步会永久停在 pending。
            const synced = await syncOneClickShotGeneration({ userId: input.userId, project, episodeId, shotId: shot.id });
            if (synced.changed) {
                project = synced.project;
                const after = kind === "image" ? imageState(synced.shot) : videoState(synced.shot);
                if (after.url) {
                    outputRefs.push({ episodeId, shotId: shot.id, kind: kind === "image" ? "storyboard-image" : "storyboard-video", url: after.url });
                    continue;
                }
                const failure = kind === "image" ? synced.shot.storyboardError : synced.shot.generationError;
                if (failure) throw new Error(`${failure}（分集 ${episodeId} 分镜 ${shot.id}）`);
            }
            // 仍在执行：只轮询，绝不重新提交（复用同一个上游 provider task）。
            pending = true;
            continue;
        }

        const created = await createMediaTask(kind, input, episodeId, shot.id);
        childTaskIds.push(created);
        pending = true;
    }

    return { status: pending ? ("pending" as const) : ("success" as const), childTaskIds: [...new Set(childTaskIds)], outputRefs };
}

function label(kind: OneClickMediaKind) {
    return kind === "image" ? "分镜图" : "分镜视频";
}

function collectShots(input: OneClickMediaInput): ShotRef[] {
    return input.project.episodes.filter((episode) => input.episodeIds.includes(episode.id)).flatMap((episode) => episode.shots.map((shot) => ({ episodeId: episode.id, shot })));
}

function imageState(shot: DramaShot) {
    return {
        url: shot.frames?.key?.url?.trim() || shot.storyboardImageUrl?.trim() || "",
        taskId: shot.storyboardTaskId?.trim() || "",
    };
}

function videoState(shot: DramaShot) {
    return { url: shot.videoUrl?.trim() || "", taskId: shot.generationTaskId?.trim() || "" };
}

async function createMediaTask(kind: OneClickMediaKind, input: OneClickMediaInput, episodeId: string, shotId: string) {
    const path = kind === "image" ? "generate-image" : "generate-video";
    const url = `${input.runtime.origin}/api/one-click-film/projects/${encodeURIComponent(input.project.id)}/shots/${encodeURIComponent(shotId)}/${path}?episodeId=${encodeURIComponent(episodeId)}`;
    const response = await fetchInternalApi(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: input.runtime.cookie },
        body: JSON.stringify({ parentTaskId: input.taskId }),
    });
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: { task?: { id?: string } }; msg?: string };
    const created = payload.data?.task?.id;
    if (!response.ok || payload.code !== 0 || !created) {
        throw new Error(payload.msg || `${label(kind)}任务创建失败（分集 ${episodeId} 分镜 ${shotId}）`);
    }
    return created;
}
