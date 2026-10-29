import { redirect } from "next/navigation";

import { getInstallStatus } from "@/lib/server/install-status";
import { getPublicSiteSettings } from "@/lib/server/site-metadata";
import { InstallScrollUnlock } from "./install-scroll-unlock";
import { InstallWizard } from "./install-wizard";

export const dynamic = "force-dynamic";

export default async function InstallPage() {
    const [install, site] = await Promise.all([getInstallStatus(), getPublicSiteSettings()]);
    if (install.ready) redirect("/");

    return (
        <main className="app-scroll-page bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.12),transparent_34%),linear-gradient(180deg,#f7faff_0%,#eff2f7_100%)] px-3 py-4 text-slate-950 sm:px-6 sm:py-6 lg:px-8">
            <InstallScrollUnlock />
            <InstallWizard install={install} initialSite={site} />
        </main>
    );
}
