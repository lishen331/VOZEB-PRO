import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listDramaLabMembers, leaveDramaLabProject, DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try {
        const { id } = await params;
        const keyword = new URL(request.url).searchParams.get("keyword") || "";
        return NextResponse.json({ code: 0, data: { members: await listDramaLabMembers(user.id, id, keyword) }, msg: "OK" });
    } catch (error) { return handle(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try { const { id } = await params; return NextResponse.json({ code: 0, data: await leaveDramaLabProject(user.id, id), msg: "已退出项目" }); } catch (error) { return handle(error); }
}

function fail(status: number, msg: string) { return NextResponse.json({ code: status, data: null, msg }, { status }); }
function handle(error: unknown) { return error instanceof DramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "成员请求失败"); }
