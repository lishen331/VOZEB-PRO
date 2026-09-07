import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { reviewDramaLabJoinRequest } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<{ decision?: unknown; action?: unknown; note?: unknown }>(request, 32 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id, requestId } = await params;
        const decision = parsed.data.decision === "approve" || parsed.data.action === "approve" ? "approve" : parsed.data.decision === "reject" || parsed.data.action === "reject" ? "reject" : "";
        if (!decision) return fail(400, "处理动作无效");
        return NextResponse.json({ code: 0, data: { request: await reviewDramaLabJoinRequest(user.id, id, requestId, decision, typeof parsed.data.note === "string" ? parsed.data.note : "") }, msg: decision === "approve" ? "申请已通过" : "申请已拒绝" });
    } catch (error) {
        return handle(error);
    }
}

function fail(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}
function handle(error: unknown) {
    return error isDramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "申请处理失败");
}
