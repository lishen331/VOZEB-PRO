"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { GammaNavIcon, type GammaNavIconName } from "@/components/gamma-ui/gamma-nav-icon";
import { cn } from "@/lib/utils";

export interface GammaRailItem {
    key: string;
    label: string;
    icon: GammaNavIconName;
    href?: string;
    group: string;
}

const RAIL_WIDTH = { collapsed: 76, expanded: 208 } as const;
const RAIL_STATE_KEY = "bluegamma:rail-expanded";

/**
 * 左侧导航（对标可灵 / 布鲁伽马 demo）：默认窄图标栏，图标在上文字在下；
 * 点底部箭头展开成图标 + 文字横排，状态记在本机。
 * 带 href 的项渲染为真实链接，其余走 onSelect。
 */
export function GammaRail({ items, activeKey, onSelect, footer }: { items: readonly GammaRailItem[]; activeKey: string; onSelect?: (key: string) => void; footer?: ReactNode }) {
    const reduce = useReducedMotion();
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        try {
            if (window.localStorage.getItem(RAIL_STATE_KEY) === "1") setExpanded(true);
        } catch {
            /* 隐私模式读不到，保持默认收起 */
        }
    }, []);

    const toggle = () =>
        setExpanded((value) => {
            try {
                window.localStorage.setItem(RAIL_STATE_KEY, value ? "0" : "1");
            } catch {
                /* 写入失败不影响当前页面 */
            }
            return !value;
        });

    const itemClass = cn(
        "group relative transition-colors hover:bg-[var(--gm-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
        expanded ? "flex h-9 w-full items-center gap-3 rounded-[10px] px-3" : "flex h-[58px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl",
    );

    return (
        <motion.nav
            aria-label="主导航"
            initial={false}
            animate={{ width: expanded ? RAIL_WIDTH.expanded : RAIL_WIDTH.collapsed }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
            className="gm-scroll relative z-30 flex h-full shrink-0 flex-col overflow-y-auto border-r border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-[linear-gradient(180deg,transparent,var(--gm-glass-edge),transparent)] after:opacity-40"
        >
            <div className={cn("flex h-14 shrink-0 items-center", expanded ? "px-4" : "justify-center")}>
                <Link href="/bluegamma" aria-label="布鲁伽马首页" className="rounded-full transition-transform duration-300 hover:rotate-[-8deg] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]">
                    <GammaLogo size={expanded ? 30 : 36} showText={expanded} />
                </Link>
            </div>

            <div className={cn("flex min-h-0 flex-1 flex-col gap-1", expanded ? "px-2.5 py-1" : "items-center py-1")}>
                {items.map((item, index) => {
                    const active = item.key === activeKey;
                    const showDivider = index > 0 && items[index - 1].group !== item.group;
                    const body = (
                        <>
                            {active ? (
                                <motion.span
                                    layoutId="gm-rail-indicator"
                                    transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                    className={cn("absolute inset-0 bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]", expanded ? "rounded-[10px]" : "rounded-xl")}
                                >
                                    <span aria-hidden className={cn("absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[image:var(--gm-gradient)] shadow-[var(--gm-glow-cyan)]", expanded ? "-left-2.5" : "left-0 -translate-x-[9px]")} />
                                </motion.span>
                            ) : null}
                            <motion.span className="relative shrink-0" whileTap={reduce ? undefined : { scale: 0.86 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}>
                                <GammaNavIcon name={item.icon} active={active} className={cn("transition-[color,transform] duration-200", active ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-2)] group-hover:text-[var(--gm-text)]")} />
                            </motion.span>
                            <span
                                className={cn(
                                    "relative transition-colors",
                                    expanded ? "min-w-0 flex-1 truncate text-left text-[13px]" : "text-[11px] leading-none",
                                    active ? "font-medium text-[var(--gm-accent)]" : "text-[var(--gm-text-3)] group-hover:text-[var(--gm-text-2)]",
                                )}
                            >
                                {item.label}
                            </span>
                        </>
                    );
                    return (
                        <div key={item.key} className={expanded ? "contents" : "contents"}>
                            {showDivider ? <span aria-hidden className={cn("shrink-0 bg-[var(--gm-border-strong)]", expanded ? "mx-3 my-1 block h-px" : "my-1.5 h-px w-8")} /> : null}
                            {item.href ? (
                                <Link href={item.href} aria-current={active ? "page" : undefined} className={itemClass}>
                                    {body}
                                </Link>
                            ) : (
                                <button type="button" aria-current={active ? "page" : undefined} onClick={() => onSelect?.(item.key)} className={itemClass}>
                                    {body}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className={cn("flex shrink-0 flex-col pb-3", expanded ? "px-2.5" : "items-center")}>
                {footer ? <div className={cn("flex flex-col gap-1 pt-1", expanded ? "" : "items-center")}>{footer}</div> : null}
                <button
                    type="button"
                    aria-label={expanded ? "收起侧边栏" : "展开侧边栏"}
                    aria-expanded={expanded}
                    title={expanded ? "收起侧边栏" : "展开侧边栏"}
                    onClick={toggle}
                    className={cn(
                        "mt-2 grid place-items-center rounded-lg text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                        expanded ? "size-8 self-end" : "size-8",
                    )}
                >
                    {expanded ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
            </div>
        </motion.nav>
    );
}

/** 顶部公告条：品牌渐变底，可关闭 */
export function GammaAnnouncement({ children, action, onClose }: { children: ReactNode; action?: ReactNode; onClose: () => void }) {
    return (
        <div className="relative flex h-10 shrink-0 items-center justify-center gap-4 overflow-hidden bg-[image:var(--gm-gradient)] px-12 text-[13px] font-medium text-white">
            <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.25),transparent_40%)]" />
            <span className="relative truncate">{children}</span>
            {action}
            <button type="button" aria-label="关闭公告" onClick={onClose} className="absolute right-3 grid size-7 place-items-center rounded-full text-white/80 transition-transform hover:rotate-90 hover:bg-white/15 hover:text-white">
                <X className="size-4" />
            </button>
        </div>
    );
}

/** 页面区块：标题 + 说明 + 右侧操作 */
export function GammaSection({ id, title, description, action, children, className }: { id?: string; title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
    const titleId = id ? `${id}-title` : undefined;
    return (
        <section id={id} aria-labelledby={titleId} className={cn("scroll-mt-6", className)}>
            <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                    <h2 id={titleId} className="text-lg font-semibold">
                        {title}
                    </h2>
                    {description ? <p className="mt-1 text-[13px] text-[var(--gm-text-3)]">{description}</p> : null}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}
