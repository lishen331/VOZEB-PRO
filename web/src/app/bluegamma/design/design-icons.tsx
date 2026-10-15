"use client";

import { useState } from "react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GAMMA_NAV_ICON_NAMES, GammaNavIcon, type GammaNavIconName } from "@/components/gamma-ui/gamma-nav-icon";
import { GAMMA_RAIL_ITEMS } from "@/app/bluegamma/gamma-nav";
import { cn } from "@/lib/utils";

/** 图标 → 导航文案；同一图标被多个入口复用时（如首页 / 新首页）取第一个 */
const LABELS = GAMMA_RAIL_ITEMS.reduce<Partial<Record<GammaNavIconName, string>>>((acc, item) => (acc[item.icon] ? acc : { ...acc, [item.icon]: item.label }), {});

/** 导航图标：点击任意一个看选中动效（镂空放大 + 笔画生长 + 描边加粗） */
export function DesignNavIcons() {
    const [active, setActive] = useState<GammaNavIconName>("home");
    const [allActive, setAllActive] = useState(false);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <GammaButton size="sm" variant={allActive ? "soft" : "outline"} onClick={() => setAllActive((value) => !value)}>
                    {allActive ? "全部恢复未选中" : "全部切到选中态"}
                </GammaButton>
                <span className="text-xs text-[var(--gm-text-3)]">共 {GAMMA_NAV_ICON_NAMES.length} 个，24×24 网格 · 三层结构（轮廓 / 镂空 / 点亮笔画）</span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 xl:grid-cols-9">
                {GAMMA_NAV_ICON_NAMES.map((name) => {
                    const on = allActive || name === active;
                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => setActive(name)}
                            aria-pressed={on}
                            className={cn(
                                "group flex flex-col items-center gap-2 rounded-[var(--gm-radius-lg)] py-4 ring-1 transition-[box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                                on ? "bg-[var(--gm-accent-soft)] ring-[var(--gm-accent-ring)]" : "bg-[var(--gm-surface)] ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)]",
                            )}
                        >
                            <GammaNavIcon name={name} active={on} size={28} className={cn("transition-colors", on ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-2)]")} />
                            <span className={cn("text-[11px] transition-colors", on ? "font-medium text-[var(--gm-accent)]" : "text-[var(--gm-text-3)]")}>{LABELS[name] ?? name}</span>
                        </button>
                    );
                })}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                    <p className="text-[13px] font-medium">放大看单个图标</p>
                    <div className="mt-4 flex items-center justify-center gap-10">
                        <div className="flex flex-col items-center gap-2">
                            <GammaNavIcon name={active} active={false} size={72} className="text-[var(--gm-text-2)]" />
                            <span className="text-[11px] text-[var(--gm-text-3)]">未选中</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <GammaNavIcon name={active} active size={72} className="text-[var(--gm-accent)]" />
                            <span className="text-[11px] text-[var(--gm-accent)]">选中</span>
                        </div>
                    </div>
                </div>
                <div className="rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-5 text-[13px] leading-relaxed text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)]">
                    <p className="font-medium text-[var(--gm-text)]">画法规则</p>
                    <ul className="mt-2 space-y-1.5">
                        <li>· 统一 24×24 网格，描边 1.7px（选中时 2px），圆头圆角</li>
                        <li>· 轮廓常驻；选中时镂空块从中心放大到 22% 不透明度</li>
                        <li>· 点亮笔画按 0.45s 生长，像 Logo 的 γ 一笔写成</li>
                        <li>· 左侧栏另有渐变光条 + 整块底色滑动跟随</li>
                        <li>· 系统开启「减少动态效果」时，全部改为瞬时切换</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
