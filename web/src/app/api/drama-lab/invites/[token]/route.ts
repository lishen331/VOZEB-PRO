import { DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabInviteByToken, requestDramaLabJoin } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        return NextResponse.json({ code: 0, data: await getDramaLabInviteByToken(token), msg: "OK" });
    } catch (error) {
        return handle(error);
    }
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try {
        const { token } = await params;
        return NextResponse.json({ code: 0, data: await requestDramaLabJoin(user.id, token), msg: "加入申请已提交，等待项目管理员确认" });
    } catch (error) {
        return handle(error);
    }
}

function fail(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}
function handle(error: unknown) {
    return error instanceof DramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "邀请请求失败");
}
