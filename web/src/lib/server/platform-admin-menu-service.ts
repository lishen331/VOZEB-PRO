import { normalizePlatformMenuPermissions, type AdminMenuPermission } from "@/components/admin/admin-sections";
import { ensurePostgresSchema, isPostgresDatabaseEnabled, postgresQuery } from "@/lib/server/database";

export async function getPlatformAdminMenuPermissions(userId: string, fallback: unknown): Promise<AdminMenuPermission[]> {
    const fallbackPermissions = normalizePlatformMenuPermissions(fallback);
    if (!isPostgresDatabaseEnabled()) return fallbackPermissions;
    try {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ permissions: unknown }>(
            "SELECT role.permissions FROM rbac_user_role_bindings binding JOIN rbac_roles role ON role.role_key = binding.role_key AND role.scope = 'platform' WHERE binding.user_id = $1 AND binding.school_id IS NULL ORDER BY binding.protected DESC, binding.created_at ASC LIMIT 1",
            [userId],
        );
        return normalizePlatformMenuPermissions(result.rows[0]?.permissions ?? fallback);
    } catch {
        return fallbackPermissions;
    }
}
