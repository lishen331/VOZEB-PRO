"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useNetworkReconnect } from "@/hooks/use-network-reconnect";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { FeatureModuleGate } from "@/components/layout/feature-module-gate";
import { isFullscreenWorkspacePath } from "@/components/layout/app-workspace-path";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { SiteLogo } from "@/components/layout/site-logo";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationToolForPathname, resolveLandingSlug } from "@/constant/navigation-tools";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

const PAGE_TITLES: Record<string, string> = {
    billing: "充值中心",
    help: "帮助中心",
    profile: "个人中心",
};

export function AppWorkspaceShell({ children, featureModules, menuPermissions }: { children: ReactNode; featureModules: FeatureModuleSettings; menuPermissions: readonly UserNavigationMenuPermission[] }) {
    useNetworkReconnect(); // BUG-10: show toast on offline/reconnect
    const pathname = usePathname();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sidebarExpanded, setSidebarExpanded] = useState(true);
    const publicSettings = usePublicSessionStore((state) => state.payload?.settings);
    const site = publicSettings?.site || { title: DEFAULT_SITE_TITLE, logoUrl: "/logo.svg" };
    const effectiveFeatureModules = publicSettings?.featureModules || featureModules;
    const schoolContext = useSchoolContextStore((state) => state.context);
    // First visible sidebar entry — matches where a login redirect lands. Falls
    // back to /help only if every module (and the module-less 主页) is gone.
    const landingSlug = resolveLandingSlug(schoolContext, { featureModules: effectiveFeatureModules, menuPermissions });
    const homePath = landingSlug ? `/${landingSlug}` : "/help";
    const siteTitle = resolveSiteTitle(site.title);
    const tool = navigationToolForPathname(pathname, schoolContext, { featureModules: effectiveFeatureModules, menuPermissions });
    const fullscreen = isFullscreenWorkspacePath(pathname);
    const rootSlug = pathname.split("/").filter(Boolean)[0] || "";
    const pageTitle = tool?.label || PAGE_TITLES[rootSlug] || "工作空间";

    if (fullscreen)
        return (
            <FeatureModuleGate initialFeatureModules={effectiveFeatureModules}>
                <div className="h-dvh min-h-0 overflow-hidden">{children}</div>
            </FeatureModuleGate>
        );

    return (
        <div className="workspace-shell flex h-dvh min-h-0 overflow-hidden bg-[var(--gm-bg)] text-foreground">
            <AppSidebar activeToolSlug={tool?.slug} expanded={sidebarExpanded} featureModules={effectiveFeatureModules} menuPermissions={menuPermissions} />
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <div aria-hidden className="gm-aurora pointer-events-none absolute -top-48 left-1/4 z-0 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                <header className="gm-glass gm-glass-sheen relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--gm-border)] px-3 sm:px-4 lg:px-7">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <button
                            type="button"
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-2)] transition hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] lg:hidden"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="打开导航菜单"
                            title="导航菜单"
                        >
                            <Menu className="size-5" />
                        </button>
                        <Link href={homePath} className="inline-flex shrink-0 items-center lg:hidden" aria-label={siteTitle}>
                            <SiteLogo logoUrl={site.logoUrl} className="size-6" />
                        </Link>
                        <button
                            type="button"
                            className="hidden size-8 shrink-0 items-center justify-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-2)] transition hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] lg:inline-flex"
                            onClick={() => setSidebarExpanded((value) => !value)}
                            aria-label={sidebarExpanded ? "收起侧边栏" : "展开侧边栏"}
                            title={sidebarExpanded ? "收起侧边栏" : "展开侧边栏"}
                            aria-pressed={sidebarExpanded}
                        >
                            {sidebarExpanded ? <PanelLeftClose className="size-[17px]" /> : <PanelLeftOpen className="size-[17px]" />}
                        </button>
                        <div className="flex min-w-0 items-center gap-2">
                            <span aria-hidden className="hidden h-4 w-[3px] shrink-0 rounded-full bg-[image:var(--gm-gradient)] sm:block" />
                            <div className="truncate text-sm font-semibold text-[var(--gm-text)]">{pageTitle}</div>
                        </div>
                    </div>
                    <div className="min-w-0 max-w-[calc(100vw-6.5rem)] shrink-0 overflow-visible sm:max-w-[calc(100vw-8rem)] lg:max-w-none">
                        <UserStatusActions />
                    </div>
                </header>
                <FeatureModuleGate initialFeatureModules={effectiveFeatureModules}>
                    <div className="relative z-10 min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
                </FeatureModuleGate>
            </div>
            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={tool?.slug} featureModules={effectiveFeatureModules} menuPermissions={menuPermissions} onClose={() => setMobileNavOpen(false)} />
        </div>
    );
}
