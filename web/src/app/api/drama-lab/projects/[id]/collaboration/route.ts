import { DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabCollaborationForUser, saveDramaLabApprovalConfigs, type DramaLabCollaborationOverview } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "请先登录");
    try {
        const { id } = await params;
        return NextResponse.json({ code: 0, data: await getDramaLabCollaborationForUser(user.id, id), msg: "OK" });
    } catch (error) {
        return collaborationError(error);
    }
}

/** Small compatibility endpoint for clients that submit approval configuration as one action. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "请先登录");
    const parsed = await readJsonBodyResult<unknown>(request, 128 * 1024);
    if (!parsed.ok) return jsonError(parsed.status, parsed.message);
    try {
        const { id } = await params;
        const configs = await saveDramaLabApprovalConfigs(user.id, id, parsed.data);
        return NextResponse.json({ code: 0, data: { configs }, msg: "审批配置已保存" });
    } catch (error) {
        return collaborationError(error);
    }
}

function jsonError(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}

function collaborationError(error: unknown) {
    if (error instanceof DramaLabCollaborationError) return jsonError(error.status, error.message);
    console.error("[drama-lab/collaboration]", error);
    return jsonError(500, error instanceof Error ? error.message : "团队协作请求失败");
}

export type { DramaLabCollaborationOverview };
