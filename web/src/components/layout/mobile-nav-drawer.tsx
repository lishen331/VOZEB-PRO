"use client";

import { Drawer } from "antd";
import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { SiteLogo } from "@/components/layout/site-logo";
import { navigationGroups, navigationToolsForContext, resolveLandingSlug, type NavigationToolSlug } from "@/constant/navigation-tools";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import { cn } from "@/lib/utils";
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    featureModules: FeatureModuleSettings;
    menuPermissions: readonly UserNavigationMenuPermission[];
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, featureModules, menuPermissions, onClose }: MobileNavDrawerProps) {
    const pathname = usePathname();
    const router = useRouter();
    const previousPathnameRef = useRef(pathname);
    const site = usePublicSessionStore((state) => state.payload?.settings?.site) || { title: DEFAULT_SITE_TITLE, logoUrl: "/logo.svg" };
    const siteTitle = resolveSiteTitle(site.title);
    const helpActive = pathname.startsWith("/help");
    const context = useSchoolContextStore((state) => state.context);
    const tools = navigationToolsForContext(context, { featureModules, menuPermissions });
    const landingSlug = resolveLandingSlug(context, { featureModules, menuPermissions });
    const homePath = landingSlug ? `/${landingSlug}` : "/help";
    const schoolTools = tools.filter((tool) => tool.group === "school");
    const groups = (schoolTools.length ? [...navigationGroups, { id: "school" as const, label: "学校" }] : navigationGroups).filter((group) => tools.some((tool) => tool.group === group.id));

    useEffect(() => {
        if (previousPathnameRef.current === pathname) return;
        previousPathnameRef.current = pathname;
        onClose();
    }, [onClose, pathname]);

    return (
        <Drawer
            title={
                <Link href={homePath} onClick={onClose} className="inline-flex min-w-0 items-center gap-2.5 text-base font-semibold leading-none tracking-[0.04em] text-[var(--gm-text)]">
                    <SiteLogo logoUrl={site.logoUrl} className="size-8 rounded-full" />
                    <span className="truncate">{siteTitle}</span>
                </Link>
            }
            placement="left"
            size={288}
            open={open}
            onClose={onClose}
            className="lg:hidden"
            styles={{ header: { borderBottomColor: "var(--gm-border)", minHeight: 60, padding: "12px 16px", background: "var(--gm-bg-elevated)" }, body: { padding: "12px 14px 18px", background: "var(--gm-bg-elevated)" } }}
        >
            {groups.map((group, groupIndex) => (
                <div key={group.id} className={cn(groupIndex > 0 && "mt-5")}>
                    <div className="mb-1 px-3 font-mono text-[10px] tracking-[0.18em] text-[var(--gm-text-3)] uppercase">{group.label}</div>
                    <div className="space-y-1">
                        {tools
                            .filter((tool) => tool.group === group.id)
                            .map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link
                                        key={tool.slug}
                                        href={`/${tool.slug}`}
                                        prefetch
                                        onMouseEnter={() => router.prefetch(`/${tool.slug}`)}
                                        onFocus={() => router.prefetch(`/${tool.slug}`)}
                                        onClick={onClose}
                                        className={cn(
                                            "flex min-h-11 items-center gap-3 rounded-[var(--gm-radius)] px-3 py-2.5 text-sm transition",
                                            active
                                                ? "bg-[var(--gm-accent-soft)] font-medium text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]"
                                                : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
                                        )}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        <Icon className="size-[18px] shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                                        <span className={cn("size-1.5 rounded-full", active ? "bg-current" : "bg-transparent")} />
                                    </Link>
                                );
                            })}
                    </div>
                </div>
            ))}
            {featureModules["help-center"] !== false && menuPermissions.includes("help-center") ? (
                <div className="mt-5 border-t border-[var(--gm-border)] pt-4">
                    <Link
                        href="/help"
                        prefetch
                        onMouseEnter={() => router.prefetch("/help")}
                        onFocus={() => router.prefetch("/help")}
                        onClick={onClose}
                        className={cn(
                            "flex min-h-11 items-center gap-3 rounded-[var(--gm-radius)] px-3 py-2.5 text-sm transition",
                            helpActive ? "bg-[var(--gm-accent-soft)] font-medium text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
                        )}
                        aria-current={helpActive ? "page" : undefined}
                    >
                        <CircleHelp className="size-[18px] shrink-0" />
                        <span className="min-w-0 flex-1 truncate">帮助</span>
                        <span className={cn("size-1.5 rounded-full", helpActive ? "bg-current" : "bg-transparent")} />
                    </Link>
                </div>
            ) : null}
        </Drawer>
    );
}
