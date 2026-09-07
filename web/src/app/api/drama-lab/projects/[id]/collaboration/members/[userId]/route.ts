import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { removeDramaLabMember, setDramaLabMemberRole, transferDramaLabOwnership } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try {
        const { id, userId } = await params;
        return NextResponse.json({ code: 0, data: await removeDramaLabMember(user.id, id, userId), msg: "成员已移除" });
    } catch (error) {
        return handle(error);
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<{ role?: unknown; transferOwnership?: unknown }>(request, 16 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id, userId } = await params;
        if (parsed.data.transferOwnership === true) return NextResponse.json({ code: 0, data: { group: await transferDramaLabOwnership(user.id, id, userId) }, msg: "项目管理权限已转交" });
        const role = parsed.data.role === "admin" ? "admin" : parsed.data.role === "member" ? "member" : "";
        if (!role) return fail(400, "成员角色无效");
        return NextResponse.json({ code: 0, data: await setDramaLabMemberRole(user.id, id, userId, role), msg: "成员权限已更新" });
    } catch (error) {
        return handle(error);
    }
}

function fail(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}
function handle(error: unknown) {
    return error isDramaLabCollaborationError ? fail(error.status, error.message) : fail(500, error instanceof Error ? error.message : "成员请求失败");
}
