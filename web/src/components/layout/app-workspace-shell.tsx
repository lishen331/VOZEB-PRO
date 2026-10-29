"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { useNetworkReconnect } from "@/hooks/use-network-reconnect";

import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import { FeatureModuleGate } from "@/components/layout/feature-module-gate";
import { isFullscreenWorkspacePath } from "@/components/layout/app-workspace-path";
import { GammaAppSidebar } from "@/components/layout/gamma-app-sidebar";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

/*
 * 工作空间外壳：与新首页同一套布鲁伽马侧栏（导航 + 底部账户操作区），不再有旧版顶栏。
 * 侧栏收起状态与首页共用（localStorage），小屏改成左侧滑出的抽屉 + 一条细顶栏。
 */
export function AppWorkspaceShell({ children, featureModules, menuPermissions }: { children: ReactNode; featureModules: FeatureModuleSettings; menuPermissions: readonly UserNavigationMenuPermission[] }) {
    useNetworkReconnect(); // BUG-10: show toast on offline/reconnect
    const pathname = usePathname();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const sidebar = useGammaSidebarState();
    const sessionFeatureModules = usePublicSessionStore((state) => state.payload?.settings?.featureModules);
    const effectiveFeatureModules = sessionFeatureModules || featureModules;
    const schoolContext = useSchoolContextStore((state) => state.context);
    const fullscreen = isFullscreenWorkspacePath(pathname);
    const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

    if (fullscreen)
        return (
            <FeatureModuleGate initialFeatureModules={effectiveFeatureModules}>
                <div className="h-dvh min-h-0 overflow-hidden">{children}</div>
            </FeatureModuleGate>
        );

    return (
        <div className="workspace-shell flex h-dvh min-h-0 overflow-hidden bg-[var(--gm-bg)] text-[var(--gm-text)]">
            <div className="hidden h-full lg:flex">
                <GammaAppSidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} featureModules={effectiveFeatureModules} menuPermissions={menuPermissions} schoolContext={schoolContext} showTheme />
            </div>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <div aria-hidden className="gm-aurora pointer-events-none absolute -top-48 left-1/4 z-0 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                {/* 小屏细顶栏：只有导航按钮和 Logo，账户操作都在抽屉里的侧栏底部 */}
                <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] px-2 lg:hidden">
                    <button
                        type="button"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-2)] transition hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label="打开导航菜单"
                        title="导航菜单"
                    >
                        <Menu className="size-5" />
                    </button>
                    <Link href="/" aria-label="蓝色伽马首页" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]">
                        <GammaLogo size={26} showText />
                    </Link>
                </header>
                <FeatureModuleGate initialFeatureModules={effectiveFeatureModules}>
                    <div className="relative z-10 min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
                </FeatureModuleGate>
            </div>
            <MobileNavDrawer open={mobileNavOpen} featureModules={effectiveFeatureModules} menuPermissions={menuPermissions} onClose={closeMobileNav} />
        </div>
    );
}
