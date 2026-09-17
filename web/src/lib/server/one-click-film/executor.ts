import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { advanceDramaLabWorkflow, dramaLabWorkflowTaskView, startDramaLabWorkflow } from "@/lib/server/drama-lab-workflow-task-service";
import { createDramaLabFinalVideoTask, executeDramaLabFinalVideoTask } from "@/lib/server/drama-lab-final-video-service";
import { runOneClickAudioForEpisodes } from "./audio-runner";
import { runOneClickMediaForEpisodes } from "./media-runner";
import type { OneClickFilmExecutor, OneClickFilmStepKey } from "./types";

type RuntimeInput = { origin: string; cookie: string };

export function createOneClickFilmExecutor(runtime: RuntimeInput): OneClickFilmExecutor {
    return async ({ task, step }) => {
        const project = await getDramaProjectForUser(task.userId, task.projectId);
        const episodeIds = task.workflow.episodeIds.length ? task.workflow.episodeIds : project.episodes.map((episode) => episode.id);
        if (step.key === "script") {
            const missing = episodeIds.filter((id) => !project.episodes.find((episode) => episode.id === id)?.script.trim());
            if (missing.length) throw new Error(`以下分集缺少剧本：${missing.join("、")}`);
            return { status: "success", outputRefs: episodeIds.map((episodeId) => ({ episodeId, kind: "script" })) };
        }
        if (step.key === "assets") return runWorkflowChildForEpisodes(task, step.key, "assets", episodeIds, runtime);
        if (step.key === "storyboard") return runWorkflowChildForEpisodes(task, step.key, "storyboard_extract", episodeIds, runtime);
        // 分镜图/分镜视频必须走一键成片自有路由，否则上游 featureModule 会写成 drama-lab，
        // 把商单用量记到教学版账上（见 docs/audits 第三轮审查）。
        if (step.key === "images") return runOneClickMediaForEpisodes("image", { taskId: task.id, userId: task.userId, project, episodeIds, runtime });
        if (step.key === "videos") return runOneClickMediaForEpisodes("video", { taskId: task.id, userId: task.userId, project, episodeIds, runtime });
        if (step.key === "audio") {
            return runOneClickAudioForEpisodes({ taskId: task.id, userId: task.userId, project, episodeIds, runtime });
        }
        return runComposeForEpisodes(task, episodeIds);
    };
}

/** L 依次处理选定分集：每集单独触发一次 scope=current 子工作流，不复用 scope=all（那会把项目内全部分集都纳入，超出用户实际选择）。 */
async function runWorkflowChildForEpisodes(task: Parameters<OneClickFilmExecutor>[0]["task"], key: OneClickFilmStepKey, mode: "assets" | "storyboard_extract" | "storyboard" | "video", episodeIds: string[], runtime: RuntimeInput) {
    if (!episodeIds.length) throw new Error("一键成片项目没有分集");
    const childTaskIds: string[] = [];
    const outputRefs: Array<Record<string, unknown>> = [];
    for (const sourceEpisodeId of episodeIds) {
        const child = await startDramaLabWorkflow({
            userId: task.userId,
            projectId: task.projectId,
            sourceEpisodeId,
            requestId: `${task.id}:${key}:${sourceEpisodeId}`,
            options: { mode, scope: "current", autoExport: false },
            origin: runtime.origin,
            cookie: runtime.cookie,
        });
        const advanced = await advanceDramaLabWorkflow({ userId: task.userId, taskId: child.id, origin: runtime.origin, cookie: runtime.cookie });
        if (!advanced) throw new Error(`${key} 子任务不存在（分集 ${sourceEpisodeId}）`);
        const view = dramaLabWorkflowTaskView(advanced);
        if (view.status === "error") throw new Error(view.error || `${key} 子任务失败（分集 ${sourceEpisodeId}）`);
        if (view.status === "cancelled") throw new Error(`${key} 子任务已取消（分集 ${sourceEpisodeId}）`);
        childTaskIds.push(view.id);
        outputRefs.push(...view.outputRefs);
        if (view.status !== "success") return { status: "pending" as const, childTaskIds, outputRefs };
    }
    return { status: "success" as const, childTaskIds, outputRefs };
}

async function runComposeForEpisodes(task: Parameters<OneClickFilmExecutor>[0]["task"], episodeIds: string[]) {
    if (!episodeIds.length) throw new Error("一键成片项目没有分集");
    const childTaskIds: string[] = [];
    const outputRefs: Array<Record<string, unknown>> = [];
    for (const episodeId of episodeIds) {
        const child = await createDramaLabFinalVideoTask({ userId: task.userId, projectId: task.projectId, episodeId, clientRequestId: `${task.id}:compose:${episodeId}` });
        const advanced = await executeDramaLabFinalVideoTask(child.id);
        if (advanced.status === "error") throw new Error(advanced.error || `成片合成失败（分集 ${episodeId}）`);
        childTaskIds.push(advanced.id);
        if (advanced.result?.url) outputRefs.push({ kind: "final-video", episodeId, url: advanced.result.url });
        if (advanced.status !== "success") return { status: "pending" as const, childTaskIds, outputRefs };
    }
    return { status: "success" as const, childTaskIds, outputRefs };
}
