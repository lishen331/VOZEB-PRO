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

/**
 * Non-admin users land on the sidebar's first visible entry — not a hardcoded
 * /create or /practice, which broke when the module behind that fixed path was
 * itself disabled (creative-agent off pointed at /practice, but practice could
 * also be off). Falls back to /help only when every module is disabled.
 */
export function defaultLoginDestination(role: LoginUserRole, featureModules?: FeatureModuleFlags, context: SchoolContext | null = null) {
    if (role === "admin") return "/admin";
    const slug = resolveLandingSlug(context, { featureModules: featureModules as FeatureModuleSettings | undefined });
    return slug ? `/${slug}` : "/help";
}

export function resolveLoginDestination(user: { role: LoginUserRole }, requestedPath: string | null | undefined, featureModules?: FeatureModuleFlags, context: SchoolContext | null = null) {
    const nextPath = safeLoginNextPath(requestedPath);
    const fallback = defaultLoginDestination(user.role, featureModules, context);
    if (!nextPath) return fallback;
    if (nextPath === "/login" || nextPath.startsWith("/login?") || nextPath.startsWith("/login#")) return fallback;
    if (user.role !== "admin" && (nextPath === "/admin" || nextPath.startsWith("/admin/") || nextPath.startsWith("/admin?") || nextPath.startsWith("/admin#"))) return `${fallback}?auth=forbidden`;
    return nextPath;
}

export function loginHref(target?: string | null) {
    const nextPath = safeLoginNextPath(target);
    return nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
}
