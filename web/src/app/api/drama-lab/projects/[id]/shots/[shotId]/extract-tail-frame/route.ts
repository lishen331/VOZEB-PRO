import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProject } from "@/lib/server/drama-project-store";
import { extractDramaLabTailFrame } from "@/lib/server/drama-lab-tail-frame-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const search = new URL(request.url).searchParams;
        const episodeId = search.get("episodeId")?.trim() || "";
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });
        const project = await getDramaProject(id, user.id);
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });
        const data = await extractDramaLabTailFrame({ userId: user.id, origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "", project, episodeId, shotId });
        return NextResponse.json({ code: 0, data, msg: "视频尾帧已提取" });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "视频尾帧提取失败" }, { status });
    }
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
