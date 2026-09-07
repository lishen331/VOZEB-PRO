import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { DEFAULT_SITE_SETTINGS, getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser, serializePublicSettings } from "@/lib/auth/session";
import { resolveLoginDestination, safeLoginNextPath } from "@/lib/login-navigation";
import { getInstallStatus } from "@/lib/server/install-status";

type LoginPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const params = searchParams ? await searchParams : {};
    const nextPath = safeLoginNextPath(firstValue(params.next));
    const authError = [authErrorMessage(firstValue(params.error)), firstValue(params.auth) === "forbidden" ? "当前账号无权访问原目标，已进入默认工作区。" : ""].filter(Boolean).join(" ");
    const [install, user, settings] = await Promise.all([getInstallStatus(), getCurrentUser(), getAuthSettings().catch(() => null)]);
    if (!install.ready) redirect("/install");
    if (user) redirect(resolveLoginDestination(user, nextPath));

    return <AuthForm mode="login" presentation="education-login" nextPath={nextPath || undefined} initialSite={settings ? serializePublicSettings(settings).site : DEFAULT_SITE_SETTINGS} authError={authError} />;
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function authErrorMessage(value: string | undefined) {
    if (!value) return "";
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
