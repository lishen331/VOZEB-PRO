import { resolveLandingSlug } from "@/constant/navigation-tools";
import type { FeatureModuleSettings } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";

export type LoginUserRole = "admin" | "user";

// resolveLandingSlug only tests `featureModules[id] !== false`, so a partial map
// (e.g. just `{ "creative-agent": false }` from older callers) is safe to pass.
type FeatureModuleFlags = Partial<FeatureModuleSettings>;

export function safeLoginNextPath(value: string | null | undefined) {
    const path = value?.trim();
    if (!path || !path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f\\]/.test(path)) return null;
    return path;
}

/** 登录后没有 next 目标时的落地页：布鲁伽马新首页（管理员从首页头像菜单进后台）。 */
export const HOME_LANDING_PATH = "/";

/** 登录后的默认落地：所有角色都进新首页 `/`。 */
export function defaultLoginDestination(role: LoginUserRole) {
    void role;
    return HOME_LANDING_PATH;
}

/**
 * 普通用户被挡在后台之外时的去处：侧栏第一个可见入口（不是写死的 /create 或 /practice——
 * 那个固定路径背后的模块本身可能被关）。全部模块关闭时回落 /help。
 * 让「无权访问」提示出现在工作区里，而不是营销首页上。
 */
export function workspaceLandingPath(featureModules?: FeatureModuleFlags, context: SchoolContext | null = null) {
    const slug = resolveLandingSlug(context, { featureModules: featureModules as FeatureModuleSettings | undefined });
    return slug ? `/${slug}` : "/help";
}

export function resolveLoginDestination(user: { role: LoginUserRole }, requestedPath: string | null | undefined, featureModules?: FeatureModuleFlags, context: SchoolContext | null = null) {
    const nextPath = safeLoginNextPath(requestedPath);
    const fallback = defaultLoginDestination(user.role);
    if (!nextPath) return fallback;
    if (nextPath === "/login" || nextPath.startsWith("/login?") || nextPath.startsWith("/login#")) return fallback;
    if (user.role !== "admin" && (nextPath === "/admin" || nextPath.startsWith("/admin/") || nextPath.startsWith("/admin?") || nextPath.startsWith("/admin#"))) return `${workspaceLandingPath(featureModules, context)}?auth=forbidden`;
    return nextPath;
}

export function loginHref(target?: string | null) {
    const nextPath = safeLoginNextPath(target);
    return nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
}
