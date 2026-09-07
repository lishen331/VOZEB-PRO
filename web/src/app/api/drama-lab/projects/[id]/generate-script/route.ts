import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { randomUUID } from "node:crypto";

import { after, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { cancelDramaLabStoryTask, DramaLabStoryGenerationError, findActiveDramaLabStoryTask, getDramaLabStoryTaskView, startDramaLabStoryGeneration, storyTaskView } from "@/lib/server/drama-lab-story-generation-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { getTextTask } from "@/lib/server/text-task-store";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        const { project } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "script");
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : project.activeEpisodeId || project.episodes[0]?.id || "";
        if (!episodeId || !project.episodes.some((episode) => episode.id === episodeId)) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不存在" }, { status: 400 });
        const task = await startDramaLabStoryGeneration({
            userId: user.id,
            projectId: id,
            sourceEpisodeId: episodeId,
            requestId: typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID(),
            storyOutline: typeof body.storyOutline === "string" ? body.storyOutline : project.summary,
            storyStyle: typeof body.storyStyle === "string" ? body.storyStyle : project.style,
            scriptType: typeof body.scriptType === "string" ? body.scriptType : "短剧",
            episodeCount: typeof body.episodeCount === "string" || typeof body.episodeCount === "number" ? body.episodeCount : 1,
            model: typeof body.model === "string" ? body.model : undefined,
        });
        const data = storyTaskView(task);
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        after(() => runGenerationTaskRecoveryBatch({ origin, cookie: request.headers.get("cookie") || "", limit: 1, taskIds: [task.id] }));
        return NextResponse.json({ code: 0, data: { ...data, taskId: task.id }, msg: "剧本生成任务已创建" }, { status: 202 });
    } catch (error) {
        const status = error instanceof FeatureModuleDisabledError ? 403 : error instanceof DramaLabStoryGenerationError || error isDramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "剧本生成失败" }, { status });
    }
}

export async function GET(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || "";
        if (!taskId) {
            const activeTask = await findActiveDramaLabStoryTask(user.id, id);
            if (!activeTask) return NextResponse.json({ code: 0, data: null, msg: "OK" });
            const activeData = storyTaskView(activeTask);
            if (activeData.status === "pending" || activeData.status === "running") {
                const origin = resolveInternalOrigin(new URL(request.url).origin);
                after(() => runGenerationTaskRecoveryBatch({ origin, cookie: request.headers.get("cookie") || "", limit: 1, taskIds: [activeTask.id], userRequested: true }));
            }
            return NextResponse.json({ code: 0, data: { ...activeData, taskId: activeTask.id }, msg: "OK" });
        }
        // The service verifies the caller's active project membership and the
        // task's project boundary. Do not substitute the task owner here:
        // project task visibility is a collaboration permission, not a
        // storage-owner identity.
        const task = await getTextTask(taskId);
        await resolveDramaLabProjectForRequest(user.id, id);
        if (!task || task.storyBatch?.projectId !== id) return NextResponse.json({ code: 404, data: null, msg: "故事生成任务不存在或已过期" }, { status: 404 });
        const data = await getDramaLabStoryTaskView(task.id, user.id, id);
        if (!data) return NextResponse.json({ code: 404, data: null, msg: "故事生成任务不存在或已过期" }, { status: 404 });
        if (data.status === "pending" || data.status === "running") {
            const origin = resolveInternalOrigin(new URL(request.url).origin);
            after(() => runGenerationTaskRecoveryBatch({ origin, cookie: request.headers.get("cookie") || "", limit: 1, taskIds: [task.id], userRequested: true }));
        }
        return NextResponse.json({ code: 0, data, msg: "OK" });
    } catch (error) {
        const status = error instanceof DramaLabStoryGenerationError || error isDramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "任务状态查询失败" }, { status });
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
        const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
        if (body.action !== "cancel" || !taskId) return NextResponse.json({ code: 400, data: null, msg: "仅支持取消故事生成任务" }, { status: 400 });
        const task = await getTextTask(taskId);
        await resolveDramaLabProjectForRequest(user.id, id);
        if (!task || task.storyBatch?.projectId !== id) return NextResponse.json({ code: 404, data: null, msg: "故事生成任务不存在或已过期" }, { status: 404 });
        const cancelled = await cancelDramaLabStoryTask(task, resolveInternalOrigin(new URL(request.url).origin), request.headers.get("cookie") || "", user.id, id);
        if (!cancelled) return NextResponse.json({ code: 409, data: null, msg: "当前故事生成任务无法取消" }, { status: 409 });
        return NextResponse.json({ code: 0, data: storyTaskView(cancelled), msg: "故事生成任务已取消" });
    } catch (error) {
        const status = error instanceof DramaLabStoryGenerationError || error isDramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "任务取消失败" }, { status });
    }
}
