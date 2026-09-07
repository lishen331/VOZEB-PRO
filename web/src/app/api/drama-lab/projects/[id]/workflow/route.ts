import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { randomUUID } from "node:crypto";

import { after, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import {
    advanceDramaLabWorkflow,
    cancelDramaLabWorkflow,
    DramaLabWorkflowError,
    dramaLabWorkflowTaskView,
    findActiveDramaLabWorkflow,
    getDramaLabWorkflowTask,
    resumeDramaLabWorkflow,
    startDramaLabWorkflow,
} from "@/lib/server/drama-lab-workflow-task-service";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "Please log in" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
        const { project } = await resolveDramaLabProjectForRequest(user.id, id);
        const sourceEpisodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : project.activeEpisodeId || project.episodes[0]?.id || "";
        if (!sourceEpisodeId || !project.episodes.some((episode) => episode.id === sourceEpisodeId)) return NextResponse.json({ code: 400, data: null, msg: "Episode not found" }, { status: 400 });
        const requestId = typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : request.headers.get("x-vozeb-pro-client-request-id")?.trim().slice(0, 160) || randomUUID();
        const task = await startDramaLabWorkflow({
            userId: user.id,
            projectId: id,
            sourceEpisodeId,
            requestId,
            options: {
                mode: body.mode === "assets" || body.mode === "storyboard_extract" || body.mode === "storyboard" || body.mode === "video" ? body.mode : undefined,
                scope: body.scope === "all" ? "all" : "current",
                ratio: typeof body.ratio === "string" ? body.ratio : undefined,
                duration: typeof body.duration === "string" || typeof body.duration === "number" ? String(body.duration) : undefined,
                language: typeof body.language === "string" ? body.language : undefined,
                visualStyle: typeof body.visualStyle === "string" ? body.visualStyle : undefined,
                autoExport: body.autoExport === true,
            },
            origin: new URL(request.url).origin,
            cookie: request.headers.get("cookie") || "",
        });
        after(() => advanceDramaLabWorkflow({ userId: user.id, taskId: task.id, origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" }).catch((error) => console.warn("Drama workflow advance deferred", error)));
        return NextResponse.json({ code: 0, data: dramaLabWorkflowTaskView(task), msg: "Workflow task created" }, { status: 202 });
    } catch (error) {
        const status = error instanceof FeatureModuleDisabledError ? 403 : error instanceof DramaLabWorkflowError || isDramaLabCollaborationError(error) ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "Unable to create workflow" }, { status });
    }
}

export async function GET(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "Please log in" }, { status: 401 });
    try {
        const { id } = await params;
        const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || "";
        const task = taskId ? await getDramaLabWorkflowTask(taskId, user.id, id) : await findActiveDramaLabWorkflow(user.id, id);
        if (!task) return NextResponse.json({ code: 0, data: null, msg: "OK" });
        const advanced = await advanceDramaLabWorkflow({ userId: user.id, taskId: task.id, origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" });
        return NextResponse.json({ code: 0, data: advanced ? dramaLabWorkflowTaskView(advanced) : dramaLabWorkflowTaskView(task), msg: "OK" });
    } catch (error) {
        const status = error instanceof DramaLabWorkflowError || isDramaLabCollaborationError(error) ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "Unable to read workflow" }, { status });
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "Please log in" }, { status: 401 });
    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
        const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
        const action = body.action;
        if (!taskId || (action !== "cancel" && action !== "resume")) return NextResponse.json({ code: 400, data: null, msg: "Unsupported workflow action" }, { status: 400 });
        const task = await getDramaLabWorkflowTask(taskId, user.id, id);
        if (!task) return NextResponse.json({ code: 404, data: null, msg: "Workflow task not found" }, { status: 404 });
        const changed = action === "cancel" ? await cancelDramaLabWorkflow(task, user.id, new URL(request.url).origin, request.headers.get("cookie") || "") : await resumeDramaLabWorkflow(task, user.id);
        if (!changed) return NextResponse.json({ code: 409, data: null, msg: "Workflow state cannot be changed" }, { status: 409 });
        if (action === "resume") after(() => advanceDramaLabWorkflow({ userId: user.id, taskId, origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" }).catch((error) => console.warn("Drama workflow resume deferred", error)));
        return NextResponse.json({ code: 0, data: dramaLabWorkflowTaskView(changed), msg: action === "cancel" ? "Workflow cancelled" : "Workflow resumed" });
    } catch (error) {
        const status = error instanceof DramaLabWorkflowError || isDramaLabCollaborationError(error) ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "Unable to update workflow" }, { status });
    }
}
