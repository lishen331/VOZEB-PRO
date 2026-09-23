import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createPlatformAdministrator, listPlatformAdministrators } from "@/lib/server/platform-rbac-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    try {
        return NextResponse.json({ items: await listPlatformAdministrators() });
    } catch (error) {
        return failure(error, "读取管理员列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "administrators.manage")) return NextResponse.json({ error: "当前管理员没有权限管理职责" }, { status: 403 });
    try {
        const administrator = await createPlatformAdministrator(user.id, await readJsonBody<{ username?: unknown; displayName?: unknown; email?: unknown; password?: unknown; roleKey?: unknown }>(request));
        await safeRecordAuditLog({ action: "admin.rbac.administrator.create", actor: auditActorFromRequest(request, user), target: { type: "user", id: administrator.id, label: administrator.username } });
        return NextResponse.json({ administrator }, { status: 201 });
    } catch (error) {
        return failure(error, "创建管理员失败");
    }
}

function failure(error: unknown, fallback: string) {
    if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}
