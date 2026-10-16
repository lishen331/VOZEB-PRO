"use client";

import { ChevronRight, CircleHelp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { SiteLogo } from "@/components/layout/site-logo";
import { navigationGroups, navigationToolsForContext, type NavigationToolSlug } from "@/constant/navigation-tools";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import { cn } from "@/lib/utils";
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

const INDICATOR_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
const ITEM_CLASS = "group relative flex h-[42px] items-center rounded-[var(--gm-radius)] px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]";

/** 选中底块：在导航项之间弹簧滑动（布鲁伽马导航选中态） */
function ActiveIndicator({ reduce }: { reduce: boolean | null }) {
    return (
        <motion.span layoutId="app-sidebar-indicator" transition={reduce ? { duration: 0 } : INDICATOR_SPRING} className="absolute inset-0 rounded-[var(--gm-radius)] bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]">
            <span aria-hidden className="absolute top-1/2 left-0 h-5 w-[3px] -translate-x-[7px] -translate-y-1/2 rounded-full bg-[image:var(--gm-gradient)] shadow-[var(--gm-glow-cyan)]" />
        </motion.span>
    );
}

export function AppSidebar({ activeToolSlug, expanded, featureModules, menuPermissions }: { activeToolSlug?: NavigationToolSlug; expanded: boolean; featureModules: FeatureModuleSettings; menuPermissions: readonly UserNavigationMenuPermission[] }) {
    const pathname = usePathname();
    const router = useRouter();
    const reduce = useReducedMotion();
    const site = usePublicSessionStore((state) => state.payload?.settings?.site) || { title: DEFAULT_SITE_TITLE, logoUrl: "/logo.svg" };
    const siteTitle = resolveSiteTitle(site.title);
    const helpActive = pathname.startsWith("/help");
    const context = useSchoolContextStore((state) => state.context);
    const tools = navigationToolsForContext(context, { featureModules, menuPermissions });
    const schoolTools = tools.filter((tool) => tool.group === "school");
    const groups = (schoolTools.length ? [...navigationGroups, { id: "school" as const, label: "学校" }] : navigationGroups).filter((group) => tools.some((tool) => tool.group === group.id));

    return (
        <aside
            className={cn(
                "relative hidden h-full shrink-0 flex-col border-r border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] text-[var(--gm-text)] transition-[width] duration-200 lg:flex",
                "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-[linear-gradient(180deg,transparent,var(--gm-glass-edge),transparent)] after:opacity-40",
                expanded ? "w-44" : "w-[72px]",
            )}
        >
            {/* Brand mark only — deliberately not a link. It used to navigate to
                the home path, which resolves to /practice when the creative-agent
                module is off, so clicking the logo dropped users into 无限练习. */}
            <div className={cn("flex h-16 shrink-0 items-center border-b border-[var(--gm-border)] px-3", expanded ? "justify-start px-5" : "justify-center")}>
                <span className="grid shrink-0 place-items-center rounded-full shadow-[0_0_0_1px_rgba(40,235,250,0.25),0_6px_20px_rgba(0,80,245,0.4)]">
                    <SiteLogo logoUrl={site.logoUrl} className="size-8 rounded-full" />
                </span>
                {expanded ? <span className="ml-3 min-w-0 truncate text-[15px] font-semibold tracking-[0.04em]">{siteTitle}</span> : null}
            </div>

            <nav className={cn("hide-scrollbar min-h-0 flex-1 overflow-y-auto py-5", expanded ? "px-3" : "px-2")} aria-label="工作空间导航">
                {groups.map((group, groupIndex) => {
                    const groupTools = tools.filter((tool) => tool.group === group.id);
                    return (
                        <div key={group.id} className={cn(groupIndex > 0 && "mt-[22px]")}>
                            {expanded ? (
                                <div className="mb-1.5 px-2 font-mono text-[10px] tracking-[0.18em] text-[var(--gm-text-3)] uppercase">{group.label}</div>
                            ) : groupIndex > 0 ? (
                                <span aria-hidden className="mx-auto mb-2 block h-px w-8 bg-[var(--gm-border-strong)]" />
                            ) : null}
                            <div className="space-y-1">
                                {groupTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={`/${tool.slug}`}
                                            prefetch
                                            title={tool.label}
                                            onMouseEnter={() => router.prefetch(`/${tool.slug}`)}
                                            onFocus={() => router.prefetch(`/${tool.slug}`)}
                                            className={cn(ITEM_CLASS, expanded ? "justify-start gap-3 px-3" : "justify-center", active ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]")}
                                            aria-current={active ? "page" : undefined}
                                        >
                                            {active ? <ActiveIndicator reduce={reduce} /> : null}
                                            <Icon className="relative size-[18px] shrink-0 transition-transform duration-200 group-hover:-translate-y-px" />
                                            {expanded ? <span className="relative min-w-0 truncate">{tool.label}</span> : null}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {featureModules["help-center"] !== false && menuPermissions.includes("help-center") ? (
                <div className={cn("shrink-0 border-t border-[var(--gm-border)]", expanded ? "px-3 pb-3 pt-3.5" : "p-2")}>
                    <Link
                        href="/help"
                        prefetch
                        title="帮助"
                        onMouseEnter={() => router.prefetch("/help")}
                        onFocus={() => router.prefetch("/help")}
                        className={cn(ITEM_CLASS, "min-h-[46px]", expanded ? "justify-start gap-3 px-2" : "justify-center", helpActive ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]")}
                        aria-current={helpActive ? "page" : undefined}
                    >
                        {helpActive ? <ActiveIndicator reduce={reduce} /> : null}
                        <CircleHelp className="size-[18px] shrink-0" />
                        {expanded ? (
                            <>
                                <span className="relative min-w-0 flex-1">
                                    <span className="block truncate">帮助</span>
                                </span>
                                <ChevronRight className="relative size-4 shrink-0 text-[var(--gm-text-3)] transition-transform group-hover:translate-x-0.5" />
                            </>
                        ) : null}
                    </Link>
                </div>
            ) : null}
        </aside>
    );
}
