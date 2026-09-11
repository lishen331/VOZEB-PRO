import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { createDramaLabFinalVideoTask, DramaLabFinalVideoError } from "@/lib/server/drama-lab-final-video-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; episodeId: string }> };
export async function POST(request: Request, { params }: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBodyResult<{ clientRequestId?: string }>(request);
        if (!body.ok) return NextResponse.json({ code: body.status, data: null, msg: body.message }, { status: body.status });
        const { id, episodeId } = await params;
        const task = await createDramaLabFinalVideoTask({ userId: user.id, projectId: id, episodeId, clientRequestId: body.data.clientRequestId });
        return NextResponse.json({ code: 0, data: task, msg: "成片任务已创建" });
    } catch (error) {
        if (error instanceof DramaLabFinalVideoError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("[drama-lab] final video task creation failed:", error);
        return NextResponse.json({ code: 500, data: null, msg: "成片任务创建失败" }, { status: 500 });
    }
}
