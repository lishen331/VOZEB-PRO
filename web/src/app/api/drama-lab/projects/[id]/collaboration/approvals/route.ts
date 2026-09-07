import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { listDramaLabApprovals, submitDramaLabApproval, type DramaLabApprovalStatus } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try {
        const { id } = await params;
        const query = new URL(request.url).searchParams;
        const status = ["pending", "approved", "rejected", "cancelled"].includes(query.get("status") || "") ? (query.get("status") as DramaLabApprovalStatus) : undefined;
        const result = await listDramaLabApprovals(user.id, id, { status, page: Number(query.get("page")) || 1, pageSize: Number(query.get("pageSize")) || 20 });
        return NextResponse.json({ code: 0, data: result, msg: "OK" });
    } catch (error) {
        return handle(error);
    }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 768 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id } = await params;
        const body = parsed.data;
        const stage = typeof body.stage === "string" ? body.stage : "";
        const resourceType = typeof body.resourceType === "string" ? body.resourceType : typeof body.targetType === "string" ? body.targetType : "";
        const resourceId = typeof body.resourceId === "string" ? body.resourceId : typeof body.targetId === "string" ? body.targetId : "";
        if (!stage || !resourceType || !resourceId) return fail(400, "审批阶段和资源定位不能为空");
        const record = await submitDramaLabApproval(user.id, id, {
            episodeId: typeof body.episodeId === "string" ? body.episodeId : undefined,
            stage,
            resourceType,
            resourceId,
            versionId: typeof body.versionId === "string" ? body.versionId : undefined,
            versionNumber: typeof body.versionNumber === "number" ? body.versionNumber : undefined,
            snapshot: body.snapshot,
        });
        return NextResponse.json({ code: 0, data: { approval: record }, msg: "已提交审批" });
    } catch (error) {
        return handle(error);
    }
}

function fail(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}
function handle(error: unknown) {
    return error isDramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "审批请求失败");
}
