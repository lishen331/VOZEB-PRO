import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabInviteByToken, requestDramaLabJoin, DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<{ token?: unknown; inviteToken?: unknown }>(request, 16 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id } = await params;
        const token = typeof parsed.data.token === "string" ? parsed.data.token : typeof parsed.data.inviteToken === "string" ? parsed.data.inviteToken : "";
        const preview = await getDramaLabInviteByToken(token);
        if (preview.projectId !== id) return fail(404, "邀请凭证与项目不匹配");
        const result = await requestDramaLabJoin(user.id, token);
        return NextResponse.json({ code: 0, data: result, msg: "加入申请已提交，等待项目管理员确认" });
    } catch (error) {
        return error instanceof DramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "加入申请失败");
    }
}

function fail(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}
