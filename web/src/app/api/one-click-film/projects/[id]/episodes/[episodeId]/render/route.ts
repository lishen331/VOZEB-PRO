import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabFinalVideoError, cancelDramaLabFinalVideoTask, createDramaLabFinalVideoTask, getDramaLabFinalVideoTask, publicFinalVideoTask, retryDramaLabFinalVideoTask } from "@/lib/server/drama-lab-final-video-service";
// 注意：getDramaLabFinalVideoTask / cancel / retry 内部已经返回 publicFinalVideoTask 的结果，
// 只有 createDramaLabFinalVideoTask 返回原始任务，需要在这里包装。
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type Context = { params: Promise<{ id: string; episodeId: string }> };

async function assertOneClickProject(userId: string, projectId: string) {
    const project = await getDramaProjectForUser(userId, projectId);
    if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new DramaLabFinalVideoError("一键成片项目不存在", 404);
    return project;
}

function failure(error: unknown, fallback: string) {
    const status = error instanceof DramaLabFinalVideoError ? error.status : 500;
    return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : fallback }, { status });
}

/**
 * 创建本集成片任务，对应 L `POST /episodes/:episode_id/finalize`。
 * 复用 V 的成片服务（executor 的 compose 步也走同一处），只多一层项目归属校验。
 */
export async function POST(request: Request, { params }: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBodyResult<{ clientRequestId?: string; action?: string; taskId?: string }>(request);
        if (!body.ok) return NextResponse.json({ code: body.status, data: null, msg: body.message }, { status: body.status });
        const { id, episodeId } = await params;
        await assertOneClickProject(user.id, id);

        // 取消/重试沿用同一入口，避免为两个动作各开一条路由。
        const action = body.data.action;
        if (action === "cancel" || action === "retry") {
            const taskId = body.data.taskId?.trim() || "";
            if (!taskId) throw new DramaLabFinalVideoError("任务 ID 不能为空", 400);
            const task = action === "cancel" ? await cancelDramaLabFinalVideoTask({ userId: user.id, projectId: id, taskId, episodeId }) : await retryDramaLabFinalVideoTask({ userId: user.id, projectId: id, taskId, episodeId });
            return NextResponse.json({ code: 0, data: task, msg: action === "cancel" ? "成片任务已取消" : "成片任务已重试" });
        }

        const task = await createDramaLabFinalVideoTask({ userId: user.id, projectId: id, episodeId, clientRequestId: body.data.clientRequestId });
        return NextResponse.json({ code: 0, data: publicFinalVideoTask(task), msg: "成片任务已创建" });
    } catch (error) {
        return failure(error, "成片任务创建失败");
    }
}

/** 查询本集成片任务状态，供前端轮询。 */
export async function GET(request: Request, { params }: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, episodeId } = await params;
        const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || "";
        if (!taskId) throw new DramaLabFinalVideoError("任务 ID 不能为空", 400);
        await assertOneClickProject(user.id, id);
        const task = await getDramaLabFinalVideoTask({ userId: user.id, projectId: id, taskId, episodeId });
        return NextResponse.json({ code: 0, data: task, msg: "OK" });
    } catch (error) {
        return failure(error, "成片任务查询失败");
    }
}
