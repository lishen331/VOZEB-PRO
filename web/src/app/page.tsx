import { redirect } from "next/navigation";

import { getFreshAuthSettings } from "@/lib/auth/store";
import { getInstallStatus } from "@/lib/server/install-status";
import { getAuthenticatedPageAccess } from "@/lib/server/page-access";
import { getSchoolContextForUser } from "@/lib/server/school-access-service";
import { getUserNavigationMenuPermissions } from "@/lib/server/user-navigation-permissions";
import { getPublicSiteSettings } from "@/lib/server/site-metadata";
import { GammaHomeView } from "./home/gamma-home-view";
import { HomeActionsProvider } from "./home/home-actions";

export const dynamic = "force-dynamic";

/** 布鲁伽马新首页；旧版官网首页保留在 /classic 供回退对照 */
export default async function HomePage() {
    const [install, site] = await Promise.all([getInstallStatus(), getPublicSiteSettings()]);
    if (!install.ready) redirect("/install");
    const navigation = await loadHomeNavigation();

    return (
        <HomeActionsProvider initialSite={site}>
            <GammaHomeView {...navigation} />
        </HomeActionsProvider>
    );
}

/** 侧栏与工作空间一致：按功能模块开关、角色菜单权限和学校身份过滤；未登录时只按模块开关过滤 */
async function loadHomeNavigation() {
    const [access, settings] = await Promise.all([getAuthenticatedPageAccess(), getFreshAuthSettings()]);
    const user = access.user;
    if (!user) return { featureModules: settings.featureModules };
    const schoolContext = await getSchoolContextForUser(user.id);
    const activeSchoolId = schoolContext?.school.status === "active" && schoolContext.membership.status === "active" ? schoolContext.school.id : undefined;
    const menuPermissions = await getUserNavigationMenuPermissions(user.id, activeSchoolId);
    return { featureModules: settings.featureModules, menuPermissions, schoolContext };
}
