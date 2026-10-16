"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
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

const RAIL_ITEM_CLASS = "group relative flex h-[58px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl transition-colors hover:bg-[var(--gm-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]";

/**
 * 窄图标栏（对标可灵左侧导航）：图标在上、文字在下，选中项品牌青 + 滑动底块。
 * 带 href 的项渲染为真实链接，其余走 onSelect。
 */
export function GammaRail({ items, activeKey, onSelect, footer }: { items: readonly GammaRailItem[]; activeKey: string; onSelect?: (key: string) => void; footer?: ReactNode }) {
    const reduce = useReducedMotion();
    return (
        <nav
            aria-label="主导航"
            className="gm-scroll relative flex h-full w-[76px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] py-4 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-[linear-gradient(180deg,transparent,var(--gm-glass-edge),transparent)] after:opacity-40"
        >
            <Link href="/bluegamma" aria-label="布鲁伽马首页" className="mb-4 rounded-full transition-transform duration-300 hover:rotate-[-8deg] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]">
                <GammaLogo size={36} showText={false} />
            </Link>
            {items.map((item, index) => {
                const active = item.key === activeKey;
                const showDivider = index > 0 && items[index - 1].group !== item.group;
                const body = (
                    <>
                        {active ? (
                            <motion.span
                                layoutId="gm-rail-indicator"
                                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                                className="absolute inset-0 rounded-xl bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]"
                            >
                                <span aria-hidden className="absolute top-1/2 left-0 h-5 w-[3px] -translate-x-[9px] -translate-y-1/2 rounded-full bg-[image:var(--gm-gradient)] shadow-[var(--gm-glow-cyan)]" />
                            </motion.span>
                        ) : null}
                        <motion.span className="relative" whileTap={reduce ? undefined : { scale: 0.82 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}>
                            <GammaNavIcon
                                name={item.icon}
                                active={active}
                                className={cn("transition-[color,transform] duration-200 group-hover:-translate-y-px", active ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-2)] group-hover:text-[var(--gm-text)]")}
                            />
                        </motion.span>
                        <span className={cn("relative text-[11px] leading-none transition-colors", active ? "font-medium text-[var(--gm-accent)]" : "text-[var(--gm-text-3)] group-hover:text-[var(--gm-text-2)]")}>{item.label}</span>
                    </>
                );
                return (
                    <div key={item.key} className="contents">
                        {showDivider ? <span aria-hidden className="my-1.5 h-px w-8 shrink-0 bg-[var(--gm-border-strong)]" /> : null}
                        {item.href ? (
                            <Link href={item.href} aria-current={active ? "page" : undefined} className={RAIL_ITEM_CLASS}>
                                {body}
                            </Link>
                        ) : (
                            <button type="button" aria-current={active ? "page" : undefined} onClick={() => onSelect?.(item.key)} className={RAIL_ITEM_CLASS}>
                                {body}
                            </button>
                        )}
                    </div>
                );
            })}
            {footer ? <div className="mt-auto flex flex-col items-center gap-1 pt-4">{footer}</div> : null}
        </nav>
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
