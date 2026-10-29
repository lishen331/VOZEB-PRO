import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loginHref } from "@/lib/login-navigation";
import { getAuthenticatedPageAccess } from "@/lib/server/page-access";
import { getInstallStatus } from "@/lib/server/install-status";
import { getPublicSiteSettings } from "@/lib/server/site-metadata";
import { HomeActionsProvider } from "../home/home-actions";
import { HomeAgentHero } from "../home/home-agent-hero";
import { HomeCta, HomeFooter } from "../home/home-footer";
import { HomeGallery } from "../home/home-gallery";
import { HomeHeader } from "../home/home-header";
import { HomeAdvantagesSection, HomeStepsSection } from "../home/home-static-sections";
import styles from "../home/home.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** 旧版官网首页（布鲁伽马新首页上线后保留，供回退对照）；未登录统一跳登录页 */
export default async function ClassicHomePage() {
    const [install, site] = await Promise.all([getInstallStatus(), getPublicSiteSettings()]);
    if (!install.ready) redirect("/install");
    const access = await getAuthenticatedPageAccess();
    if (!access.user) redirect(loginHref("/classic"));

    return (
        <HomeActionsProvider initialSite={site}>
            <main className={`app-scroll-page ${styles.root}`}>
                <HomeHeader />
                <HomeAgentHero />
                <div className={styles.contentBand}>
                    <HomeStepsSection />
                    <HomeGallery />
                    <HomeAdvantagesSection />
                    <HomeCta />
                    <HomeFooter />
                </div>
            </main>
        </HomeActionsProvider>
    );
}
