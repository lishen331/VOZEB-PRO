import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getFreshAuthSettings } from "@/lib/auth/store";
import { getUserNavigationMenuPermissions } from "@/lib/server/user-navigation-permissions";
import { getSchoolContextForUser } from "@/lib/server/school-access-service";
import { getAuthenticatedPageAccess } from "@/lib/server/page-access";
import { PromptHub } from "./prompt-hub";

export default async function PromptsPage() {
    const access = await getAuthenticatedPageAccess();
    if (!access.user) redirect("/login?next=/prompts");
    const school = await getSchoolContextForUser(access.user.id);
    const activeSchoolId = school?.school.status === "active" && school.membership.status === "active" ? school.school.id : undefined;
    const [settings, permissions] = await Promise.all([getFreshAuthSettings(), getUserNavigationMenuPermissions(access.user.id, activeSchoolId)]);
    const canViewMine = settings.featureModules["my-prompts"] !== false && permissions.includes("my-prompts");
    const canViewPublic = settings.featureModules["prompt-library"] !== false && permissions.includes("prompt-library");
    if (!canViewMine && !canViewPublic) redirect("/create");
    return (
        <Suspense>
            <PromptHub canViewMine={canViewMine} canViewPublic={canViewPublic} />
        </Suspense>
    );
}
