"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { GammaNavIcon } from "@/components/gamma-ui/gamma-nav-icon";
import type { GammaRailItem } from "@/components/gamma-ui/gamma-shell";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "bluegamma:sidebar-collapsed";
const WIDTH_EXPANDED = 208;
const WIDTH_COLLAPSED = 68;
const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;

/** 平板断点：窗口不足这个宽度时，侧栏默认收起（用户手动展开过则尊重用户） */
const TABLET_MAX = 1180;

/** 侧栏展开/收起状态，记在 localStorage；没记录时按屏宽决定默认值 */
export function useGammaSidebarState() {
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        let stored: string | null = null;
        try {
            stored = window.localStorage.getItem(COLLAPSED_KEY);
        } catch {
            // 隐私模式读不到，按屏宽走默认
        }
        if (stored === "1" || (stored === null && window.innerWidth < TABLET_MAX)) setCollapsed(true);
    }, []);
    const toggle = () =>
        setCollapsed((value) => {
            try {
                window.localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
            } catch {
                // 写入失败不影响当前页面
            }
            return !value;
        });
    return { collapsed, toggle };
}

interface GammaSidebarRowProps {
    collapsed: boolean;
    icon: ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
    href?: string;
    trailing?: ReactNode;
    layoutId?: string;
}

/** 侧栏里的一行：展开时图标 + 文字横排，收起时只剩图标，hover 出浮动提示 */
export function GammaSidebarRow({ collapsed, icon, label, active = false, onClick, href, trailing, layoutId }: GammaSidebarRowProps) {
    const reduce = useReducedMotion();
    const className = cn(
        "group relative flex w-full rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
        collapsed ? "h-[54px] flex-col items-center justify-center gap-1 text-[10px] leading-none" : "h-9 items-center gap-3 px-3 text-[13px]",
        active ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
    );
    const body = (
        <>
            {active && layoutId ? (
                <motion.span layoutId={layoutId} transition={reduce ? { duration: 0 } : SPRING} className="absolute inset-0 rounded-[inherit] bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]">
                    <span aria-hidden className="absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[image:var(--gm-gradient)]" />
                </motion.span>
            ) : null}
            <span className="relative grid size-5 shrink-0 place-items-center">{icon}</span>
            <span className={cn("relative truncate", collapsed ? "sr-only" : "min-w-0 flex-1 text-left")}>{label}</span>
            {collapsed || !trailing ? null : <span className="relative shrink-0">{trailing}</span>}
        </>
    );
    if (href) {
        return (
            <Link href={href} aria-label={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={className}>
                {body}
            </Link>
        );
    }
    return (
        <button type="button" aria-label={collapsed ? label : undefined} aria-current={active ? "page" : undefined} onClick={onClick} className={className}>
            {body}
        </button>
    );
}

/**
 * 侧栏右边缘正中的按钮：鼠标进入侧栏才浮现，点一下展开 / 收起。
 * 骑在边线上，平时完全透明，不会像常驻按钮那样伸在外面。
 */
function SidebarEdgeHandle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const label = collapsed ? "展开侧栏" : "收起侧栏";
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onToggle}
            className="group/handle absolute top-1/2 right-0 z-20 flex h-16 w-4 translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
        >
            <span className="gm-glass grid h-10 w-[18px] place-items-center rounded-full text-[var(--gm-text-2)] shadow-[var(--gm-shadow)] transition-[height,color,transform] duration-200 group-hover/handle:h-12 group-hover/handle:text-[var(--gm-text)] group-focus-visible/handle:ring-2 group-focus-visible/handle:ring-[var(--gm-accent)] group-active/handle:scale-95">
                {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
            </span>
        </button>
    );
}

interface GammaSidebarProps {
    items: readonly GammaRailItem[];
    activeKey: string;
    collapsed: boolean;
    onToggle: () => void;
    onSelect?: (key: string) => void;
    /** 原顶栏右上角的操作，放在导航下方 */
    actions?: ReactNode;
    /** 点 Logo 回到的首页地址 */
    homeHref?: string;
}

/**
 * 可收缩侧边栏：展开 208px（图标 + 文字），收起 68px（只剩图标，hover 出提示）。
 * 宽度用弹簧过渡；分组之间用细线隔开；底部放操作区与收起按钮。
 */
export function GammaSidebar({ items, activeKey, collapsed, onToggle, onSelect, actions, homeHref = "/bluegamma" }: GammaSidebarProps) {
    const reduce = useReducedMotion();
    return (
        <motion.nav
            aria-label="主导航"
            initial={false}
            animate={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
            transition={reduce ? { duration: 0 } : SPRING}
            className="group/sidebar relative z-30 flex h-full shrink-0 flex-col border-r border-[var(--gm-border)] bg-[var(--gm-bg-elevated)]"
        >
            <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "px-4")}>
                <Link href={homeHref} aria-label="蓝色伽马首页" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]">
                    <GammaLogo size={30} showText={!collapsed} />
                </Link>
            </div>

            <div className="gm-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-1">
                {items.map((item, index) => {
                    const active = item.key === activeKey;
                    const showDivider = index > 0 && items[index - 1].group !== item.group;
                    return (
                        <div key={item.key}>
                            {/* 分组间只留 8px 空隙 + 一条短细线，不再占一整行 */}
                            {showDivider ? <span aria-hidden className="mx-3 my-1 block h-px bg-[var(--gm-border)] opacity-70" /> : null}
                            <GammaSidebarRow
                                collapsed={collapsed}
                                active={active}
                                label={item.label}
                                href={item.href}
                                onClick={item.href ? undefined : () => onSelect?.(item.key)}
                                icon={<GammaNavIcon name={item.icon} active={active} size={20} />}
                                layoutId="gm-sidebar-active"
                            />
                        </div>
                    );
                })}
            </div>

            {actions ? <div className="shrink-0 px-2.5 pt-1 pb-2.5">{actions}</div> : null}

            <SidebarEdgeHandle collapsed={collapsed} onToggle={onToggle} />
        </motion.nav>
    );
}

export const GAMMA_SIDEBAR_WIDTH = { expanded: WIDTH_EXPANDED, collapsed: WIDTH_COLLAPSED };
