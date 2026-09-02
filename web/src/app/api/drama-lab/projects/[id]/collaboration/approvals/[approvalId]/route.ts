import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabApproval, reviewDramaLabApproval, DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; approvalId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try {
        const { id, approvalId } = await params;
        const approval = await getDramaLabApproval(user.id, id, approvalId);
        if (!approval) return fail(404, "审批记录不存在");
        return NextResponse.json({ code: 0, data: { approval }, msg: "OK" });
    } catch (error) { return handle(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; approvalId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<{ decision?: unknown; action?: unknown; comment?: unknown; note?: unknown }>(request, 32 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id, approvalId } = await params;
        const body = parsed.data;
        const value = body.decision ?? body.action;
        const decision = value === "approve" || value === "approved" ? "approve" : value === "reject" || value === "rejected" ? "reject" : "";
        if (!decision) return fail(400, "处理动作无效");
        const comment = typeof body.comment === "string" ? body.comment : typeof body.note === "string" ? body.note : "";
        const approval = await reviewDramaLabApproval(user.id, id, approvalId, decision, comment);
        return NextResponse.json({ code: 0, data: { approval }, msg: decision === "approve" ? "审批已通过" : "审批已驳回" });
    } catch (error) { return handle(error); }
}

function fail(status: number, msg: string) { return NextResponse.json({ code: status, data: null, msg }, { status }); }
function handle(error: unknown) { return error instanceof DramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "审批处理失败"); }
