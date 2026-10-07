import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createPlatformRbacRole, listPlatformRbacRoles } from "@/lib/server/platform-rbac-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    try {
        return NextResponse.json({ items: await listPlatformRbacRoles() });
    } catch (error) {
        return failure(error, "读取角色列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    try {
        const role = await createPlatformRbacRole(await readJsonBody<{ name?: unknown; permissions?: unknown }>(request));
        await safeRecordAuditLog({ action: "admin.rbac.role.create", actor: auditActorFromRequest(request, user), target: { type: "role", id: role.key, label: role.name } });
        return NextResponse.json({ role }, { status: 201 });
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.rbac.role.create", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "role" }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return failure(error, "创建角色失败");
    }
}

function failure(error: unknown, fallback: string) {
    if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}
