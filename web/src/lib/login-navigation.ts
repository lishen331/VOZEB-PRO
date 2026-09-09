export type LoginUserRole = "admin" | "user";

export function safeLoginNextPath(value: string | null | undefined) {
    const path = value?.trim();
    if (!path || !path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f\\]/.test(path)) return null;
    return path;
}

export function defaultLoginDestination(role: LoginUserRole, featureModules?: { "creative-agent"?: boolean }) {
    return role === "admin" ? "/admin" : featureModules?.["creative-agent"] === false ? "/practice" : "/create";
}

export function resolveLoginDestination(user: { role: LoginUserRole }, requestedPath: string | null | undefined, featureModules?: { "creative-agent"?: boolean }) {
    const nextPath = safeLoginNextPath(requestedPath);
    const fallback = defaultLoginDestination(user.role, featureModules);
    if (!nextPath) return fallback;
    if (nextPath === "/login" || nextPath.startsWith("/login?") || nextPath.startsWith("/login#")) return fallback;
    if (user.role !== "admin" && (nextPath === "/admin" || nextPath.startsWith("/admin/") || nextPath.startsWith("/admin?") || nextPath.startsWith("/admin#"))) return `${fallback}?auth=forbidden`;
    return nextPath;
}

export function loginHref(target?: string | null) {
    const nextPath = safeLoginNextPath(target);
    return nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
}
