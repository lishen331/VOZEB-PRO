import { redirect } from "next/navigation";

import { getInstallStatus } from "@/lib/server/install-status";
import { getPublicSiteSettings } from "@/lib/server/site-metadata";
import { GammaHomeView } from "./home/gamma-home-view";
import { HomeActionsProvider } from "./home/home-actions";

export const dynamic = "force-dynamic";

/** 布鲁伽马新首页；旧版官网首页保留在 /classic 供回退对照 */
export default async function HomePage() {
    const [install, site] = await Promise.all([getInstallStatus(), getPublicSiteSettings()]);
    if (!install.ready) redirect("/install");

    return (
        <HomeActionsProvider initialSite={site}>
            <GammaHomeView />
        </HomeActionsProvider>
    );
}
