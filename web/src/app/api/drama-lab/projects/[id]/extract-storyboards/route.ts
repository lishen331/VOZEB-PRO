import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { randomUUID } from "node:crypto";

import { after, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabWorkflowError, advanceDramaLabWorkflow, dramaLabWorkflowTaskView, startDramaLabWorkflow } from "@/lib/server/drama-lab-workflow-task-service";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";
export const maxDuration = 2400;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 128 * 1024);
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
        const requestId = typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID();
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });

        const { project } = await resolveDramaLabProjectForRequest(user.id, id);
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });

        const task = await startDramaLabWorkflow({
            userId: user.id,
            projectId: id,
            sourceEpisodeId: episodeId,
            requestId,
            options: { mode: "storyboard_extract", scope: "current" },
            origin: new URL(request.url).origin,
            cookie: request.headers.get("cookie") || "",
        });
        after(() => advanceDramaLabWorkflow({ userId: user.id, taskId: task.id, origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" }).catch((error) => console.warn("Drama storyboard extraction advance deferred", error)));
        return NextResponse.json({ code: 0, data: { taskId: task.id, task: dramaLabWorkflowTaskView(task) }, msg: "分镜提取任务已创建" }, { status: 202 });
    } catch (error) {
        const status = error instanceof FeatureModuleDisabledError ? 403 : error instanceof DramaLabWorkflowError || isDramaLabCollaborationError(error) ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜提取失败" }, { status });
    }
}
