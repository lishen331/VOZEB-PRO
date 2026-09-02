import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listDramaLabMyJoinRequests, DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try { const { id } = await params; return NextResponse.json({ code: 0, data: { requests: await listDramaLabMyJoinRequests(user.id, id) }, msg: "OK" }); } catch (error) { return error instanceof DramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "申请列表加载失败"); }
}

function fail(status: number, msg: string) { return NextResponse.json({ code: status, data: null, msg }, { status }); }
