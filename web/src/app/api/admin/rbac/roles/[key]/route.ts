import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deletePlatformRbacRole, updatePlatformRbacRole } from "@/lib/server/platform-rbac-service";

export const runtime = "nodejs";

type Context = { params: Promise<{ key: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    const { key } = await context.params;
    try {
        const role = await updatePlatformRbacRole(key, await readJsonBody<{ name?: unknown; permissions?: unknown; status?: unknown }>(request));
        await safeRecordAuditLog({ action: "admin.rbac.role.update", actor: auditActorFromRequest(request, user), target: { type: "role", id: role.key, label: role.name } });
        return NextResponse.json({ role });
    } catch (error) {
        return failure(error, "更新角色失败");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    const { key } = await context.params;
    try {
        await deletePlatformRbacRole(key);
        await safeRecordAuditLog({ action: "admin.rbac.role.delete", actor: auditActorFromRequest(request, user), target: { type: "role", id: key } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error, "删除角色失败");
    }
}

function failure(error: unknown, fallback: string) {
    if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}
