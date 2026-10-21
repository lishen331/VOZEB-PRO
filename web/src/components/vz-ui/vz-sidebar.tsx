"use client";

import type { LucideIcon } from "lucide-react";
import { Crown, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export interface VzNavItem {
    key: string;
    label: string;
    icon: LucideIcon;
    badge?: "new" | "hot";
}

export interface VzNavGroup {
    key: string;
    label: string;
    items: VzNavItem[];
}

/**
 * 侧边导航：参考可灵/Vidu 的窄栏 + 图标优先布局。
 * 选中态用品牌渐变图标底 + 左侧光条，替代原先的浅灰底。
 */
export function VzSidebar({ groups, activeKey, onSelect, points, planName, onUpgrade }: { groups: VzNavGroup[]; activeKey: string; onSelect: (key: string) => void; points: number; planName: string; onUpgrade?: () => void }) {
    return (
        <aside className="flex h-full w-[208px] shrink-0 flex-col border-r border-[var(--vz-border)] bg-[var(--vz-bg-elevated)]">
            <div className="flex h-16 items-center gap-2.5 px-5">
                <span className="grid size-8 place-items-center rounded-[10px] bg-[image:var(--vz-gradient)] text-sm font-bold text-white shadow-[var(--vz-glow)]">V</span>
                <span className="text-[15px] font-semibold tracking-wide">
                    VOZEB <span className="vz-gradient-text">PRO</span>
                </span>
            </div>

            <nav aria-label="工作空间导航" className="hide-scrollbar flex-1 overflow-y-auto px-3 py-3">
                {groups.map((group, index) => (
                    <div key={group.key} className={cn(index > 0 && "mt-5")}>
                        <div className="mb-1.5 px-3 text-[11px] font-medium tracking-[0.12em] text-[var(--vz-text-3)] uppercase">{group.label}</div>
                        <ul className="space-y-0.5">
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                const active = item.key === activeKey;
                                return (
                                    <li key={item.key}>
                                        <button
                                            type="button"
                                            onClick={() => onSelect(item.key)}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "group relative flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]",
                                                active ? "bg-white/[0.06] text-white" : "text-[var(--vz-text-2)] hover:bg-white/[0.04] hover:text-[var(--vz-text)]",
                                            )}
                                        >
                                            {active ? <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-[image:var(--vz-gradient)]" /> : null}
                                            <span className={cn("grid size-7 place-items-center rounded-lg transition-colors", active ? "bg-[image:var(--vz-gradient)] text-white" : "bg-white/[0.04] group-hover:bg-white/[0.08]")}>
                                                <Icon className="size-4" />
                                            </span>
                                            <span className="flex-1 truncate text-left">{item.label}</span>
                                            {item.badge ? (
                                                <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold leading-4 text-white", item.badge === "hot" ? "bg-[image:var(--vz-gradient-hot)]" : "bg-[#0ea5e9]")}>
                                                    {item.badge === "hot" ? "HOT" : "NEW"}
                                                </span>
                                            ) : null}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="p-3">
                <div className="relative overflow-hidden rounded-[var(--vz-radius)] bg-[linear-gradient(135deg,rgba(168,85,247,0.22),rgba(34,211,238,0.10))] p-3.5 ring-1 ring-[rgba(168,85,247,0.25)]">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--vz-gold)]">
                        <Crown className="size-3.5" />
                        {planName}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1">
                        <Zap className="size-4 self-center fill-[var(--vz-gold)] text-[var(--vz-gold)]" />
                        <span key={points} className="inline-block animate-in text-xl font-semibold tabular-nums fade-in slide-in-from-bottom-1" aria-live="polite">
                            {points.toLocaleString()}
                        </span>
                        <span className="text-xs text-[var(--vz-text-2)]">积分</span>
                    </div>
                    <button
                        type="button"
                        onClick={onUpgrade}
                        className="mt-3 h-8 w-full rounded-lg bg-white text-[13px] font-semibold text-[#14141f] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]"
                    >
                        升级会员
                    </button>
                </div>
            </div>
        </aside>
    );
}
