import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProject } from "@/lib/server/drama-project-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { DramaLabVideoRecoveryError, recoverDramaLabVideoTasks } from "@/lib/server/drama-lab-video-recovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type RouteContext = { params: Promise<{ id: string; episodeId: string }> };

export async function GET(request: Request, context: RouteContext) {
    return handleRecovery(request, context);
}

export async function POST(request: Request, context: RouteContext) {
    return handleRecovery(request, context);
}

async function handleRecovery(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, episodeId } = await params;
        const projectId = normalizeId(id);
        const currentEpisodeId = normalizeId(episodeId);
        if (!projectId || !currentEpisodeId) throw new DramaLabVideoRecoveryError("短剧项目和剧集不能为空", 400);

        const project = await getDramaProject(projectId, user.id);
        if (!project) throw new DramaLabVideoRecoveryError("短剧项目不存在", 404);
        if (project.id !== projectId) throw new DramaLabVideoRecoveryError("短剧项目不存在", 404);
        if (!project.episodes?.some((episode) => episode.id === currentEpisodeId)) throw new DramaLabVideoRecoveryError("当前剧集不存在", 404);

        const publicOrigin = resolvePublicRequestOrigin(request);
        const origin = resolveInternalOrigin(publicOrigin);
        const data = await recoverDramaLabVideoTasks({
            userId: user.id,
            project,
            episodeId: currentEpisodeId,
            origin,
            publicOrigin,
            cookie: request.headers.get("cookie") || "",
        });
        return NextResponse.json({ code: 0, data, msg: "分镜视频任务已恢复" });
    } catch (error) {
        const status = error instanceof DramaLabVideoRecoveryError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜视频任务恢复失败" }, { status });
    }
}

function normalizeId(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 160) : "";
}
