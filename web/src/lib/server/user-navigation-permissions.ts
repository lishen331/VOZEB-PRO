import { DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS, normalizeUserNavigationMenuPermissions, USER_NAVIGATION_ROLE_KEYS, type UserNavigationMenuPermission } from "@/lib/feature-modules";
import { ensurePostgresSchema, isPostgresDatabaseEnabled, postgresQuery } from "@/lib/server/database";
import { getSchoolContextForUser } from "@/lib/server/school-access-service";

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

/**
 * 练习画布的"练习模型测试"权限。平台管理员没有前台角色绑定，直接放行；
 * 其余用户只看角色里实际勾选的菜单权限，默认集不含该权限，所以缺省为没有。
 */
export async function userHasPracticeModelTestAccess(user: { id: string; role: string }, activeSchoolId?: string) {
    if (user.role === "admin") return true;
    const permissions = await getUserNavigationMenuPermissions(user.id, activeSchoolId);
    return permissions.includes("practice-model-test");
}

/**
 * 只在练习画布上查权限。短剧等其他练习表面不查，继续走原来的工作流路由；
 * 正式请求直接返回 false，避免增加一次数据库查询。
 * 学校范围与前台菜单权限用同一个活动学校，保证角色勾选和任务判定一致。
 * 查询失败按"没有测试权限"处理：普通练习生成不能因为这次附加查询而失败。
 */
export async function resolvePracticeModelTestAccess(user: { id: string; role: string }, context: { executionProfile?: string; surface?: string }) {
    if (context.executionProfile !== "open-source-practice" || context.surface !== "canvas") return false;
    if (user.role === "admin") return true;
    try {
        const school = await getSchoolContextForUser(user.id);
        const activeSchoolId = school?.school.status === "active" && school.membership.status === "active" ? school.school.id : undefined;
        return await userHasPracticeModelTestAccess(user, activeSchoolId);
    } catch (error) {
        console.warn("Practice model test access check failed", { userId: user.id, error });
        return false;
    }
}
