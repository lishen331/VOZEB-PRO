import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabAudioError, assertAudioTaskBinding, assertAudioTaskContext, legacyDramaAudioTaskId, syncDramaLabAudioTask } from "@/lib/server/drama-lab-audio-service";
import { getAudioTask } from "@/lib/server/audio-task-store";
import { getStoredGenerationTaskRecord, hasStoredGenerationTaskContextConflict } from "@/lib/server/generation-task-store";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { recoverGenerationTaskFromUpstream } from "@/lib/server/generation-task-user-recovery";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const query = new URL(request.url).searchParams;
        const episodeId = query.get("episodeId")?.trim() || "";
        const kind = query.get("kind") === "narration" ? "narration" : "dialogue";
        if (!episodeId) throw new DramaLabAudioError("当前剧集不能为空");
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        if (!project) throw new DramaLabAudioError("短剧项目不存在", 404);
        const shot = project.episodes.find((episode) => episode.id === episodeId)?.shots.find((item) => item.id === shotId);
        const trackState = shot ? (kind === "narration" ? shot.narrationAudio : shot.dialogueAudio) : undefined;
        const taskId = query.get("taskId")?.trim() || trackState?.taskId || (shot ? legacyDramaAudioTaskId(shot, kind) : undefined) || "";
        if (!taskId) throw new DramaLabAudioError("当前镜头没有可恢复的音频任务", 409);
        const task = await getAudioTask(taskId);
        if (!task) throw new DramaLabAudioError("音频任务不存在或已过期", 404);
        // A durable task row can disagree with its payload/context after a
        // partial migration or a failed write.  Never query the upstream
        // provider for such a task: recovery must be read-only until the
        // owner can resolve the conflict explicitly.
        if (hasStoredGenerationTaskContextConflict(task)) throw new DramaLabAudioError("音频任务上下文存在冲突，无法安全恢复", 409);
        // Keep dialogue and narration recovery isolated. A task from the
        // other track must never be attached to this shot's requested audio
        // state, even when the project/episode/shot ids happen to match.
        if (!shot) throw new DramaLabAudioError("短剧镜头不存在", 404);
        assertAudioTaskBinding(shot, kind, taskId);
        assertAudioTaskContext(task, { userId: user.id, projectOwnerUserId: ownerUserId, projectId: id, episodeId, shotId, audioKind: kind, shot });
        if (task.status === "success") {
            const updated = await syncDramaLabAudioTask({ userId: user.id, projectOwnerUserId: ownerUserId, project, episodeId, shotId, taskId, kind });
            return NextResponse.json({ code: 0, data: { task, project: updated }, msg: "音频任务已完成" });
        }
        if (task.status !== "pending" && task.status !== "running") throw new DramaLabAudioError("当前音频任务无法继续检查", 409);
        const schedule = await getStoredGenerationTaskRecord("audio", taskId);
        if (schedule && hasStoredGenerationTaskContextConflict(schedule)) throw new DramaLabAudioError("音频任务调度上下文存在冲突，无法安全恢复", 409);
        // A task can still be pending while its initial worker has not been
        // picked up (for example, when the request's background callback was
        // interrupted). Wake that same durable task instead of creating a
        // second upstream request. Keep the persisted phase unchanged so a
        // concurrent worker in `submitting` cannot be downgraded to
        // `created`, which would make a later retry unsafe.
        const executionPhase = schedule?.executionPhase || task.executionPhase || (task.status === "pending" ? "created" : undefined);
        const upstreamTaskId = task.upstream?.id || schedule?.upstreamTaskId;
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        const publicOrigin = new URL(request.url).origin;
        const cookie = request.headers.get("cookie") || "";

        if (executionPhase === "submitting" && !upstreamTaskId) {
            // The provider may have accepted the request even though the
            // response was lost. Do not submit again without an identity.
            throw new DramaLabAudioError("音频任务在提交阶段中断，未取得上游任务 ID，请等待人工复核", 409);
        }

        if (executionPhase === "result_ready" || executionPhase === "persisting" || (!upstreamTaskId && executionPhase === "created")) {
            await wakeAudioTask({ taskId, origin, publicOrigin, cookie });
        } else {
            if (!upstreamTaskId) throw new DramaLabAudioError("原音频任务没有保存上游任务 ID，无法安全恢复", 409);
            const recovered = await recoverGenerationTaskFromUpstream({
                type: "audio",
                id: taskId,
                upstreamTaskId,
                channelId: task.config.channelId,
                provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
                queryPath: schedule?.queryPath || task.config.advancedConfig?.queryPath,
                submittedAt: schedule?.submittedAt || task.createdAt,
                origin,
                publicOrigin,
                cookie,
            });
            if (!recovered) throw new DramaLabAudioError("音频任务状态无法恢复，请刷新后重试", 409);
        }
        const latestTask = await getAudioTask(taskId);
        const latestProject = (await resolveDramaLabProjectForRequest(user.id, id)).project;
        const updated = latestProject && latestTask ? await syncDramaLabAudioTask({ userId: user.id, projectOwnerUserId: ownerUserId, project: latestProject, episodeId, shotId, taskId, kind }) : latestProject;
        return NextResponse.json({ code: 0, data: { task: latestTask, project: updated }, msg: "音频任务已重新检查" });
    } catch (error) {
        const status = error instanceof DramaLabAudioError || error instanceof DramaProjectStoreError || error isDramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "音频任务恢复失败" }, { status });
    }
}

async function wakeAudioTask(input: { taskId: string; origin: string; publicOrigin: string; cookie: string }) {
    // Only re-arm the existing scheduler row. `scheduleGenerationTask` is an
    // UPDATE, so a missing row fails closed rather than silently creating a
    // task that the worker cannot reconcile.
    const rearmed = await scheduleGenerationTask("audio", input.taskId, {
        nextPollAt: Date.now(),
        lastUpstreamStatus: "user_recovery_requested",
    });
    if (!rearmed) throw new DramaLabAudioError("音频任务状态已变化，请刷新后重试", 409);
    await runGenerationTaskRecoveryBatch({
        origin: input.origin,
        publicOrigin: input.publicOrigin,
        cookie: input.cookie,
        limit: 1,
        taskIds: [input.taskId],
        userRequested: true,
    });
}
