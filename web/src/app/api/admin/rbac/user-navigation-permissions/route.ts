import { NextResponse } from "next/server";

import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { USER_NAVIGATION_ROLE_KEYS, type UserNavigationRoleKey } from "@/lib/feature-modules";
import { listPlatformRbacRoles, updatePlatformRbacRole } from "@/lib/server/platform-rbac-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENU_PERMISSION_ADMIN_PERMISSIONS = ["upstream.manage", "administrators.manage"] as const;

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(user, MENU_PERMISSION_ADMIN_PERMISSIONS)) return NextResponse.json({ error: "当前管理员没有配置前台菜单的权限" }, { status: 403 });
    try {
        const roles = await listPlatformRbacRoles();
        return NextResponse.json({ items: roles.filter((role) => isUserNavigationRoleKey(role.key)).map(({ key, name, permissions }) => ({ key, name, permissions })) });
    } catch (error) {
        return failure(error, "读取前台菜单权限失败");
    }
}

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(user, MENU_PERMISSION_ADMIN_PERMISSIONS)) return NextResponse.json({ error: "当前管理员没有配置前台菜单的权限" }, { status: 403 });
    try {
        const body = await readJsonBody<{ roleKey?: unknown; permissions?: unknown }>(request);
        if (!isUserNavigationRoleKey(body.roleKey)) return NextResponse.json({ error: "前台用户角色无效" }, { status: 400 });
        const role = await updatePlatformRbacRole(body.roleKey, { permissions: body.permissions });
        return NextResponse.json({ role: { key: role.key, name: role.name, permissions: role.permissions } });
    } catch (error) {
        return failure(error, "保存前台菜单权限失败");
    }
}

function isUserNavigationRoleKey(value: unknown): value is UserNavigationRoleKey {
    return typeof value === "string" && USER_NAVIGATION_ROLE_KEYS.includes(value as UserNavigationRoleKey);
}

function failure(error: unknown, fallback: string) {
    if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(fallback, error);
    return NextResponse.json({ error: fallback }, { status: 500 });
}
