import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { AuthUserHydrator } from "@/components/auth/auth-user-hydrator";
import { resolveLandingSlug } from "@/constant/navigation-tools";
import { AppWorkspaceShell } from "@/components/layout/app-workspace-shell";
import { SchoolContextHydrator } from "@/components/school/school-context-hydrator";
import { getSchoolContextForUser } from "@/lib/server/school-access-service";
import { getUserNavigationMenuPermissions } from "@/lib/server/user-navigation-permissions";
import { getAuthenticatedPageAccess } from "@/lib/server/page-access";
import { isUserNavigationPathAllowed } from "@/lib/feature-modules";
import { getFreshAuthSettings } from "@/lib/auth/store";
import { loginHref } from "@/lib/login-navigation";

export const metadata: Metadata = {
    robots: { index: false, follow: false, noarchive: true, noimageindex: true, nosnippet: true },
};

export default async function UserLayout({ children }: { children: ReactNode }) {
    const access = await getAuthenticatedPageAccess();
    if (!access.user) {
        if (!access.install.database.healthy || access.install.firstAdminRequired) redirect("/install");
        const nextPath = (await headers()).get("x-vozeb-login-next");
        redirect(loginHref(nextPath));
    }
    const user = access.user;
    const schoolContext = await getSchoolContextForUser(user.id);
    const activeSchoolId = schoolContext?.school.status === "active" && schoolContext.membership.status === "active" ? schoolContext.school.id : undefined;
    const [featureModules, menuPermissions] = await Promise.all([getFreshAuthSettings().then((settings) => settings.featureModules), getUserNavigationMenuPermissions(user.id, activeSchoolId)]);
    const requestedPath = (await headers()).get("x-vozeb-login-next")?.split("?")[0] || "";
    if (requestedPath && !isUserNavigationPathAllowed(requestedPath, menuPermissions, featureModules, schoolContext)) {
        const landingSlug = resolveLandingSlug(schoolContext, { featureModules, menuPermissions });
        redirect(landingSlug ? `/${landingSlug}` : "/");
    }

    return (
        <AuthUserHydrator
            user={{
                id: user.id,
                accountId: user.accountId,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                bio: user.bio,
                avatarUrl: user.avatarUrl,
                role: user.role,
                adminPermissions: user.adminPermissions,
                status: user.status,
                planId: user.planId,
                planName: user.planName,
                hasActivePlan: user.hasActivePlan,
                pointsBalance: user.pointsBalance,
                permanentPointsBalance: user.permanentPointsBalance,
                dailyPointsBalance: user.dailyPointsBalance,
                dailyPointsExpiresAt: user.dailyPointsExpiresAt,
                mfaEnabled: user.mfaEnabled,
            }}
        >
            <SchoolContextHydrator context={schoolContext}>
                <AppWorkspaceShell featureModules={featureModules} menuPermissions={menuPermissions}>
                    {children}
                </AppWorkspaceShell>
            </SchoolContextHydrator>
        </AuthUserHydrator>
    );
}
