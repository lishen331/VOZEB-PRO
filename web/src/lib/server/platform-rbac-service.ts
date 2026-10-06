import { randomUUID } from "node:crypto";

import { adminDutiesFromMenuPermissions, normalizePlatformMenuPermissions } from "@/components/admin/admin-sections";
import { normalizeUserNavigationMenuPermissions, USER_NAVIGATION_ROLE_KEYS, type UserNavigationRoleKey } from "@/lib/feature-modules";
import { AuthInputError, createUserByAdmin, deleteUserByAdmin, updateUserByAdmin } from "@/lib/auth/store";
import { ensurePostgresSchema, isPostgresDatabaseEnabled, postgresQuery, withPostgresTransaction } from "@/lib/server/database";

type RbacScope = "platform" | "school" | "user";
type RbacStatus = "active" | "disabled";

const FIXED_DEFAULT_ROLE_KEYS = new Set(["platform-superadmin", "school-superadmin", "teacher", "student", "normal-user"]);

type RbacRoleRow = {
    role_key: string;
    name: string;
    scope: RbacScope;
    permissions: unknown;
    status: RbacStatus;
    is_builtin: boolean;
    created_at: Date | string;
    updated_at: Date | string;
    administrator_count: number | string;
};

export type PlatformRbacRole = {
    key: string;
    name: string;
    scope: RbacScope;
    permissions: string[];
    status: RbacStatus;
    builtin: boolean;
    administratorCount: number;
    createdAt: string;
    updatedAt: string;
};

export async function listPlatformRbacRoles(): Promise<PlatformRbacRole[]> {
    await requirePostgresRbac();
    const result = await postgresQuery<RbacRoleRow>(`SELECT role.role_key, role.name, role.scope, role.permissions, role.status, role.is_builtin, role.created_at, role.updated_at, count(binding.user_id)::int AS administrator_count
        FROM rbac_roles role
        LEFT JOIN rbac_user_role_bindings binding ON binding.role_key = role.role_key
        GROUP BY role.role_key
        ORDER BY CASE role.scope WHEN 'platform' THEN 0 WHEN 'school' THEN 1 ELSE 2 END, role.is_builtin DESC, role.created_at ASC, role.role_key ASC`);
    return result.rows.map(toRole);
}

export async function createPlatformRbacRole(input: { name?: unknown; permissions?: unknown }) {
    await requirePostgresRbac();
    const name = roleName(input.name);
    const permissions = platformMenuPermissions(input.permissions);
    const key = `platform-custom-${randomUUID()}`;
    const now = new Date().toISOString();
    try {
        const result = await postgresQuery<RbacRoleRow>(
            "INSERT INTO rbac_roles (role_key, name, scope, permissions, status, is_builtin, created_at, updated_at) VALUES ($1, $2, 'platform', $3::jsonb, 'active', false, $4, $4) RETURNING *, 0::int AS administrator_count",
            [key, name, JSON.stringify(permissions), now],
        );
        return toRole(result.rows[0]);
    } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new AuthInputError("角色名称已存在", 409);
        throw error;
    }
}

export async function updatePlatformRbacRole(roleKey: string, input: { name?: unknown; permissions?: unknown; status?: unknown }) {
    await requirePostgresRbac();
    return withPostgresTransaction(async (client) => {
        const current = await client.query<RbacRoleRow>("SELECT role_key, name, scope, permissions, status, is_builtin, created_at, updated_at, 0::int AS administrator_count FROM rbac_roles WHERE role_key = $1 FOR UPDATE", [roleKey]);
        const role = current.rows[0];
        if (!role) throw new AuthInputError("角色不存在", 404);
        if (input.status !== undefined && input.status !== "active" && input.status !== "disabled") throw new AuthInputError("角色状态无效");
        if (FIXED_DEFAULT_ROLE_KEYS.has(role.role_key) && input.name !== undefined && input.name !== role.name) throw new AuthInputError("默认角色名称不可修改", 409);
        const nextName = input.name === undefined ? role.name : roleName(input.name);
        const nextPermissions = rolePermissions(role.scope, role.role_key, input.permissions === undefined ? role.permissions : input.permissions);
        const nextAdminDuties = adminDutiesFromMenuPermissions(nextPermissions);
        const nextStatus = input.status === undefined ? role.status : input.status;
        const bindings = await client.query<{ total: string }>("SELECT count(*)::int AS total FROM rbac_user_role_bindings WHERE role_key = $1", [roleKey]);
        if (FIXED_DEFAULT_ROLE_KEYS.has(role.role_key) && nextStatus !== "active") throw new AuthInputError("默认角色不能停用", 409);
        if (!role.is_builtin && nextStatus !== "active" && Number(bindings.rows[0]?.total || 0) > 0) throw new AuthInputError("角色正在被管理员使用，不能停用", 409);
        const now = new Date().toISOString();
        const updated = await client.query<RbacRoleRow>("UPDATE rbac_roles SET name = $2, permissions = $3::jsonb, status = $4, updated_at = $5 WHERE role_key = $1 RETURNING *, 0::int AS administrator_count", [
            roleKey,
            nextName,
            JSON.stringify(nextPermissions),
            nextStatus,
            now,
        ]);
        if (role.scope === "platform")
            await client.query("UPDATE users user_record SET admin_permissions = $2::jsonb, updated_at = $3 WHERE user_record.id IN (SELECT user_id FROM rbac_user_role_bindings WHERE role_key = $1 AND school_id IS NULL)", [
                roleKey,
                JSON.stringify(nextAdminDuties),
                now,
            ]);
        return toRole(updated.rows[0]);
    });
}

export async function deletePlatformRbacRole(roleKey: string) {
    await requirePostgresRbac();
    return withPostgresTransaction(async (client) => {
        const result = await client.query<{ is_builtin: boolean; scope: RbacScope; total: string }>(
            "SELECT role.is_builtin, role.scope, count(binding.user_id)::int AS total FROM rbac_roles role LEFT JOIN rbac_user_role_bindings binding ON binding.role_key = role.role_key AND binding.school_id IS NULL WHERE role.role_key = $1 GROUP BY role.role_key",
            [roleKey],
        );
        const role = result.rows[0];
        if (!role) throw new AuthInputError("角色不存在", 404);
        if (FIXED_DEFAULT_ROLE_KEYS.has(roleKey)) throw new AuthInputError("默认角色不能删除", 409);
        if (Number(role.total || 0) > 0) throw new AuthInputError("角色正在被管理员使用，不能删除", 409);
        await client.query("DELETE FROM rbac_roles WHERE role_key = $1", [roleKey]);
        return { ok: true };
    });
}

export type PlatformAdministrator = {
    id: string;
    username: string;
    displayName: string;
    email?: string;
    roleKey: string;
    roleName: string;
    status: RbacStatus;
    protected: boolean;
    createdAt: string;
};

export async function listPlatformAdministrators(): Promise<PlatformAdministrator[]> {
    await requirePostgresRbac();
    const result = await postgresQuery<{
        id: string;
        username: string;
        display_name: string;
        email: string | null;
        role_key: string;
        role_name: string;
        status: RbacStatus;
        protected: boolean;
        created_at: Date | string;
    }>(`SELECT user_record.id, user_record.username, user_record.display_name, user_record.email, binding.role_key, role.name AS role_name, user_record.status, binding.protected, user_record.created_at
        FROM users user_record
        JOIN rbac_user_role_bindings binding ON binding.user_id = user_record.id AND binding.school_id IS NULL
        JOIN rbac_roles role ON role.role_key = binding.role_key AND role.scope = 'platform'
        WHERE user_record.role = 'admin'
        ORDER BY user_record.created_at DESC, user_record.id DESC`);
    return result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email || undefined,
        roleKey: row.role_key,
        roleName: row.role_name,
        status: row.status === "disabled" ? "disabled" : "active",
        protected: row.protected === true,
        createdAt: new Date(row.created_at).toISOString(),
    }));
}

export async function createPlatformAdministrator(actorId: string, input: { username?: unknown; displayName?: unknown; email?: unknown; password?: unknown; roleKey?: unknown }) {
    await requirePostgresRbac();
    const role = await activePlatformRole(roleKey(input.roleKey));
    const user = await createUserByAdmin({
        actorId,
        username: typeof input.username === "string" ? input.username : "",
        displayName: typeof input.displayName === "string" ? input.displayName : "",
        email: typeof input.email === "string" ? input.email : "",
        password: typeof input.password === "string" ? input.password : "",
        role: "admin",
        adminPermissions: adminDutiesFromMenuPermissions(role.permissions),
    });
    await replacePlatformBinding(user.id, role.key, false);
    return user;
}

export async function updatePlatformAdministrator(actorId: string, userId: string, input: { displayName?: unknown; email?: unknown; password?: unknown; roleKey?: unknown; status?: unknown }) {
    await requirePostgresRbac();
    const binding = await platformBinding(userId, true);
    if (!binding) throw new AuthInputError("管理员不存在", 404);
    const nextRoleKey = input.roleKey === undefined ? binding.roleKey : roleKey(input.roleKey);
    if (binding.protected && (nextRoleKey !== binding.roleKey || input.status === "disabled")) throw new AuthInputError("平台超管不能停用、删除或变更角色", 403);
    const role = await activePlatformRole(nextRoleKey);
    const user = await updateUserByAdmin(actorId, userId, {
        displayName: typeof input.displayName === "string" ? input.displayName : undefined,
        email: typeof input.email === "string" ? input.email : undefined,
        password: typeof input.password === "string" && input.password ? input.password : undefined,
        status: input.status === "disabled" ? "disabled" : input.status === "active" ? "active" : undefined,
        role: "admin",
        adminPermissions: adminDutiesFromMenuPermissions(role.permissions),
    });
    if (nextRoleKey !== binding.roleKey) await replacePlatformBinding(userId, nextRoleKey, false);
    return user;
}

export async function deletePlatformAdministrator(actorId: string, userId: string) {
    await requirePostgresRbac();
    const binding = await platformBinding(userId, true);
    if (!binding) throw new AuthInputError("管理员不存在", 404);
    if (binding.protected) throw new AuthInputError("平台超管不能停用、删除或变更角色", 403);
    return deleteUserByAdmin(actorId, userId);
}

async function activePlatformRole(key: string) {
    const result = await postgresQuery<RbacRoleRow>("SELECT role_key, name, scope, permissions, status, is_builtin, created_at, updated_at, 0::int AS administrator_count FROM rbac_roles WHERE role_key = $1 AND scope = 'platform'", [key]);
    const role = result.rows[0];
    if (!role || role.status !== "active") throw new AuthInputError("平台角色不存在或已停用", 400);
    return toRole(role);
}

async function platformBinding(userId: string, forUpdate = false) {
    const suffix = forUpdate ? " FOR UPDATE" : "";
    const result = await postgresQuery<{ role_key: string; protected: boolean }>(`SELECT role_key, protected FROM rbac_user_role_bindings WHERE user_id = $1 AND school_id IS NULL${suffix}`, [userId]);
    const row = result.rows[0];
    return row ? { roleKey: row.role_key, protected: row.protected === true } : null;
}

async function replacePlatformBinding(userId: string, nextRoleKey: string, isProtectedBinding: boolean) {
    return withPostgresTransaction(async (client) => {
        await client.query("DELETE FROM rbac_user_role_bindings WHERE user_id = $1 AND school_id IS NULL", [userId]);
        await client.query("INSERT INTO rbac_user_role_bindings (user_id, role_key, school_id, protected) VALUES ($1, $2, NULL, $3)", [userId, nextRoleKey, isProtectedBinding]);
    });
}

function roleKey(value: unknown) {
    const key = typeof value === "string" ? value.trim() : "";
    if (!key) throw new AuthInputError("请选择平台角色");
    return key;
}

function roleName(value: unknown) {
    const name = typeof value === "string" ? value.trim() : "";
    if (name.length < 2 || name.length > 50) throw new AuthInputError("角色名称需为 2 到 50 个字符");
    return name;
}

function rolePermissions(scope: RbacScope, roleKey: string, value: unknown): string[] {
    if (USER_NAVIGATION_ROLE_KEYS.includes(roleKey as UserNavigationRoleKey)) return normalizeUserNavigationMenuPermissions(jsonArray(value));
    if (scope === "platform") return platformMenuPermissions(value);
    if (scope === "school") return jsonArray(value).filter((item): item is string => item === "school.manage");
    return [];
}

function platformMenuPermissions(value: unknown): string[] {
    const permissions = normalizePlatformMenuPermissions(jsonArray(value));
    if (!permissions.length) throw new AuthInputError("平台角色至少需要一项菜单权限");
    return permissions;
}

function jsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function toRole(row: RbacRoleRow): PlatformRbacRole {
    const all = USER_NAVIGATION_ROLE_KEYS.includes(row.role_key as UserNavigationRoleKey)
        ? normalizeUserNavigationMenuPermissions(jsonArray(row.permissions))
        : row.scope === "platform"
          ? normalizePlatformMenuPermissions(jsonArray(row.permissions))
          : jsonArray(row.permissions);
    return {
        key: row.role_key,
        name: row.name,
        scope: row.scope,
        permissions: Array.isArray(all) ? all.filter((item): item is string => typeof item === "string") : [],
        status: row.status === "disabled" ? "disabled" : "active",
        builtin: row.is_builtin === true,
        administratorCount: Number(row.administrator_count || 0),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
    };
}

async function requirePostgresRbac() {
    if (!isPostgresDatabaseEnabled()) throw new AuthInputError("RBAC 仅支持 PostgreSQL 数据库", 503);
    await ensurePostgresSchema();
}
