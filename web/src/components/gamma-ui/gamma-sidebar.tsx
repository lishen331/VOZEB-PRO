"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { GammaNavIcon } from "@/components/gamma-ui/gamma-nav-icon";
import type { GammaRailItem } from "@/components/gamma-ui/gamma-shell";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "bluegamma:sidebar-collapsed";
const WIDTH_EXPANDED = 208;
const WIDTH_COLLAPSED = 68;
const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;

/** 侧栏展开/收起状态，记在 localStorage */
export function useGammaSidebarState() {
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        try {
            if (window.localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true);
        } catch {
            // 隐私模式读不到，保持默认展开
        }
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
        "group relative flex h-9 w-full items-center gap-3 rounded-[10px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
        collapsed ? "justify-center px-0" : "px-3",
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
            {collapsed ? null : <span className="relative min-w-0 flex-1 truncate text-left">{label}</span>}
            {collapsed || !trailing ? null : <span className="relative shrink-0">{trailing}</span>}
            {/* 收起时的浮动提示 */}
            {collapsed ? (
                <span
                    role="tooltip"
                    className="pointer-events-none absolute top-1/2 left-full z-[70] ml-3 -translate-x-1 -translate-y-1/2 rounded-md bg-[var(--gm-surface-light)] px-2 py-1 text-xs font-medium whitespace-nowrap text-[var(--gm-inverse-text)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                >
                    {label}
                </span>
            ) : null}
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
            {/* 顶部：展开时 Logo + 悬停浮现的收起按钮；收起时悬停 Logo 变成展开按钮，不往侧栏外伸 */}
            {collapsed ? (
                <div className="flex h-14 shrink-0 items-center justify-center">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-label="展开侧栏"
                        className="group/expand relative grid size-9 place-items-center rounded-[10px] transition-colors hover:bg-[var(--gm-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                    >
                        <span className="transition-[opacity,transform] duration-200 group-hover/expand:scale-75 group-hover/expand:opacity-0 group-focus-visible/expand:opacity-0">
                            <GammaLogo size={30} showText={false} />
                        </span>
                        <PanelLeftOpen className="absolute size-[18px] scale-75 text-[var(--gm-text)] opacity-0 transition-[opacity,transform] duration-200 group-hover/expand:scale-100 group-hover/expand:opacity-100 group-focus-visible/expand:opacity-100" />
                    </button>
                </div>
            ) : (
                <div className="flex h-14 shrink-0 items-center gap-1 pr-2.5 pl-4">
                    <Link href={homeHref} aria-label="布鲁伽马首页" className="min-w-0 flex-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]">
                        <GammaLogo size={30} showText />
                    </Link>
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-label="收起侧栏"
                        className="grid size-8 shrink-0 place-items-center rounded-[8px] text-[var(--gm-text-3)] opacity-0 transition-[opacity,background-color,color] duration-200 group-hover/sidebar:opacity-100 hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                    >
                        <PanelLeftClose className="size-[18px]" />
                    </button>
                </div>
            )}

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
        </motion.nav>
    );
}

export const GAMMA_SIDEBAR_WIDTH = { expanded: WIDTH_EXPANDED, collapsed: WIDTH_COLLAPSED };
