import { DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS, normalizeUserNavigationMenuPermissions, USER_NAVIGATION_ROLE_KEYS, type UserNavigationMenuPermission } from "@/lib/feature-modules";
import { ensurePostgresSchema, isPostgresDatabaseEnabled, postgresQuery } from "@/lib/server/database";

type UserNavigationPermissionRow = {
    permissions: unknown;
};

export async function getUserNavigationMenuPermissions(userId: string, activeSchoolId?: string): Promise<UserNavigationMenuPermission[]> {
    if (!isPostgresDatabaseEnabled()) return [...DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS];
    await ensurePostgresSchema();
    const result = await postgresQuery<UserNavigationPermissionRow>(
        `SELECT COALESCE(
             (
                 SELECT role.permissions
                 FROM rbac_user_role_bindings binding
                 JOIN rbac_roles role ON role.role_key = binding.role_key
                 WHERE binding.user_id = user_record.id
                   AND role.status = 'active'
                   AND (
                       (binding.school_id IS NULL AND role.role_key = 'normal-user')
                       OR ($2::text IS NOT NULL AND binding.school_id = $2 AND role.role_key = ANY($3::text[]))
                   )
                 ORDER BY CASE WHEN binding.school_id IS NULL THEN 1 ELSE 0 END, role.role_key
                 LIMIT 1
             ),
             CASE WHEN user_record.role = 'admin' THEN $4::jsonb ELSE NULL END
         ) AS permissions
         FROM users user_record
         WHERE user_record.id = $1`,
        [userId, activeSchoolId || null, [...USER_NAVIGATION_ROLE_KEYS.filter((key) => key !== "normal-user")], JSON.stringify(DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS)],
    );
    const row = result.rows[0];
    if (!row) return [];
    return normalizeUserNavigationMenuPermissions(row.permissions);
}
