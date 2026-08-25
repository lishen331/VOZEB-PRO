import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listDramaLabCanvasProjectsForUser } from "@/lib/server/canvas-project-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const params = new URL(request.url).searchParams;
    return NextResponse.json({
        code: 0,
        data: await listDramaLabCanvasProjectsForUser(user.id, { page: params.get("page"), pageSize: params.get("pageSize") }),
        msg: "OK",
    });
}

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    return NextResponse.json({ code: 400, data: null, msg: "剧集画布由剧集绑定创建" }, { status: 400 });
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    return NextResponse.json({ code: 400, data: null, msg: "剧集画布由剧集绑定管理" }, { status: 400 });
}
