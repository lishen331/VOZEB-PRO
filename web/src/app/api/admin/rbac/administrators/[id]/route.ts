import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deletePlatformAdministrator, updatePlatformAdministrator } from "@/lib/server/platform-rbac-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    const { id } = await context.params;
    try {
        const administrator = await updatePlatformAdministrator(user.id, id, await readJsonBody<{ displayName?: unknown; email?: unknown; password?: unknown; roleKey?: unknown; status?: unknown }>(request));
        await safeRecordAuditLog({ action: "admin.rbac.administrator.update", actor: auditActorFromRequest(request, user), target: { type: "user", id, label: administrator.username } });
        return NextResponse.json({ administrator });
    } catch (error) { return failure(error, "更新管理员失败"); }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    const { id } = await context.params;
    try {
        await deletePlatformAdministrator(user.id, id);
        await safeRecordAuditLog({ action: "admin.rbac.administrator.delete", actor: auditActorFromRequest(request, user), target: { type: "user", id } });
        return NextResponse.json({ ok: true });
    } catch (error) { return failure(error, "删除管理员失败"); }
}

function failure(error: unknown, fallback: string) {
    if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}
