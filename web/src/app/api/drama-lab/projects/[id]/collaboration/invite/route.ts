import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { createDramaLabInvite, DramaLabCollaborationError, listDramaLabInvites, revokeDramaLabInvite, rotateDramaLabInvite } from "@/lib/server/drama-lab-collaboration-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    try {
        const { id } = await params;
        return NextResponse.json({ code: 0, data: { invites: await listDramaLabInvites(user.id, id) }, msg: "OK" });
    } catch (error) {
        return handle(error);
    }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<{ expiresAt?: unknown; rotate?: unknown }>(request, 32 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id } = await params;
        const invite =
            parsed.data.rotate === true
                ? await rotateDramaLabInvite(user.id, id, { expiresAt: typeof parsed.data.expiresAt === "string" ? parsed.data.expiresAt : undefined })
                : await createDramaLabInvite(user.id, id, { expiresAt: typeof parsed.data.expiresAt === "string" ? parsed.data.expiresAt : undefined });
        const token = invite.token || "";
        const inviteUrl = `${new URL(request.url).origin}/drama-lab/invite/${encodeURIComponent(token)}`;
        return NextResponse.json({ code: 0, data: { invite: { ...invite, inviteUrl } }, msg: "邀请链接已生成" });
    } catch (error) {
        return handle(error);
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "请先登录");
    const parsed = await readJsonBodyResult<{ inviteId?: unknown }>(request, 16 * 1024);
    if (!parsed.ok) return fail(parsed.status, parsed.message);
    try {
        const { id } = await params;
        const inviteId = typeof parsed.data.inviteId === "string" ? parsed.data.inviteId : "";
        if (!inviteId) return fail(400, "邀请编号不能为空");
        return NextResponse.json({ code: 0, data: await revokeDramaLabInvite(user.id, id, inviteId), msg: "邀请已撤销" });
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
