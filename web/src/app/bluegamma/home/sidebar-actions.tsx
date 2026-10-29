"use client";

import type { ReactNode } from "react";
import { Bell, Check, Crown, LogOut, Moon, Settings, Sun, Type, UserRound, Zap } from "lucide-react";

import { GammaMenu } from "@/components/gamma-ui/gamma-overlays";
import { GammaCountUp } from "@/components/gamma-ui/gamma-motion";
import { GAMMA_FONT_OPTIONS } from "@/components/gamma-ui/gamma-fonts";
import { useGammaTheme } from "@/components/gamma-ui/gamma-theme";
import { cn } from "@/lib/utils";

/** 小图标按钮：展开时三个并排一行，收起时竖排 */
const ICON_BTN =
    "group relative grid size-9 shrink-0 place-items-center rounded-[10px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] [&_svg]:size-[18px]";

/** 收起状态的浮动提示 */
function Tip({ children }: { children: ReactNode }) {
    return (
        <span
            role="tooltip"
            className="pointer-events-none absolute top-1/2 left-full z-[70] ml-3 -translate-x-1 -translate-y-1/2 rounded-md bg-[var(--gm-surface-light)] px-2 py-1 text-xs font-medium whitespace-nowrap text-[var(--gm-inverse-text)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        >
            {children}
        </span>
    );
}

/**
 * 积分卡：积分 + 签到合成一张卡（不再各占一格），收起时只剩闪电图标，点开升级。
 */
function PointsCard({ collapsed, points, checkedIn, onCheckIn, onUpgrade }: { collapsed: boolean; points: number; checkedIn: boolean; onCheckIn: () => void; onUpgrade: () => void }) {
    if (collapsed) {
        return (
            <button type="button" onClick={onUpgrade} aria-label={`积分 ${points}，点击升级`} className={cn(ICON_BTN, "mx-auto text-[var(--gm-accent)]")}>
                <Zap className="fill-current" />
                <Tip>积分 {points.toLocaleString()}</Tip>
            </button>
        );
    }
    return (
        <div className="rounded-[12px] bg-[var(--gm-wash)] p-2.5 ring-1 ring-[var(--gm-border)]">
            <div className="flex items-center gap-1.5">
                <Zap className="size-3.5 fill-[var(--gm-cyan)] text-[var(--gm-accent)]" />
                <span className="text-[15px] font-semibold tabular-nums">
                    <GammaCountUp value={points} />
                </span>
                <span className="text-[11px] text-[var(--gm-text-3)]">积分</span>
                <button type="button" onClick={onUpgrade} className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--gm-accent)] hover:underline">
                    <Crown className="size-3" />
                    升级
                </button>
            </div>
            <button
                type="button"
                onClick={onCheckIn}
                disabled={checkedIn}
                className={cn("mt-2 flex h-7 w-full items-center justify-center gap-1 rounded-[8px] text-xs font-medium transition-colors", checkedIn ? "text-[var(--gm-text-3)]" : "bg-[var(--gm-blue)] text-white hover:bg-[var(--gm-blue-hover)]")}
            >
                {checkedIn ? <Check className="size-3.5" /> : null}
                {checkedIn ? "今日已签到" : "签到领 50 积分"}
            </button>
        </div>
    );
}

/**
 * 侧栏底部操作区（替代原右上角）。
 *   积分 + 签到 合成一张卡；通知 / 字体 / 主题 三个小图标并排一行；账户一行。
 * 首页不需要搜索，已去掉。
 */
export function GammaSidebarActions({
    collapsed,
    points,
    checkedIn,
    hasUnread = true,
    onCheckIn,
    onNotify,
    onUpgrade,
    onNotice,
}: {
    collapsed: boolean;
    points: number;
    checkedIn: boolean;
    hasUnread?: boolean;
    onCheckIn: () => void;
    onNotify: () => void;
    onUpgrade: () => void;
    onNotice: (message: string) => void;
}) {
    const { mode, toggleMode, fontId, setFontId } = useGammaTheme();
    const dark = mode === "dark";

    return (
        <div className={cn("flex flex-col", collapsed ? "items-center gap-1" : "gap-2")}>
            <PointsCard collapsed={collapsed} points={points} checkedIn={checkedIn} onCheckIn={onCheckIn} onUpgrade={onUpgrade} />

            <div className={cn("flex", collapsed ? "flex-col items-center gap-1" : "items-center justify-between px-0.5")}>
                <button type="button" onClick={onNotify} aria-label="通知" className={ICON_BTN}>
                    <Bell />
                    {hasUnread ? <span aria-hidden className="absolute top-2 right-2 size-1.5 rounded-full bg-[var(--gm-danger)] ring-2 ring-[var(--gm-bg-elevated)]" /> : null}
                    <Tip>通知</Tip>
                </button>
                <GammaMenu
                    label="切换字体"
                    placement="right-end"
                    triggerClassName="rounded-[10px]"
                    trigger={(open) => (
                        <span className={cn(ICON_BTN, open && "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]")}>
                            <Type />
                            <Tip>字体</Tip>
                        </span>
                    )}
                    items={GAMMA_FONT_OPTIONS.map((option) => ({
                        key: option.id,
                        label: option.name,
                        icon: option.id === fontId ? <Check /> : <span className="size-4" />,
                        onSelect: () => setFontId(option.id),
                    }))}
                />
                <button type="button" onClick={toggleMode} aria-label={dark ? "切换到白色主题" : "切换到黑夜主题"} className={ICON_BTN}>
                    <span className="relative grid size-[18px] place-items-center">
                        <Sun className={cn("absolute transition-all duration-300", dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100")} />
                        <Moon className={cn("absolute transition-all duration-300", dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0")} />
                    </span>
                    <Tip>{dark ? "白色主题" : "黑夜主题"}</Tip>
                </button>
            </div>

            <AccountRow collapsed={collapsed} onNotice={onNotice} />
        </div>
    );
}

const ACCOUNT_ITEMS = (onNotice: (message: string) => void) => [
    { key: "profile", label: "个人主页", icon: <UserRound />, onSelect: () => onNotice("个人主页设计中") },
    { key: "settings", label: "账户设置", icon: <Settings />, onSelect: () => onNotice("设置页设计中") },
    { key: "logout", label: "退出登录", icon: <LogOut />, danger: true, onSelect: () => onNotice("演示页不会真的退出") },
];

/** 账户行：展开时头像 + 名字；收起时只剩头像（收起/展开在侧栏顶部 Logo 处） */
function AccountRow({ collapsed, onNotice }: { collapsed: boolean; onNotice: (message: string) => void }) {
    const avatar = <span className="block size-8 shrink-0 rounded-full bg-[image:var(--gm-gradient)] ring-2 ring-[var(--gm-bg-elevated)]" />;
    if (collapsed) {
        return <GammaMenu label="账户菜单" placement="right-end" trigger={() => avatar} items={ACCOUNT_ITEMS(onNotice)} />;
    }
    return (
        <div className="border-t border-[var(--gm-border)] pt-2">
            <div className="min-w-0">
                <GammaMenu
                    label="账户菜单"
                    placement="right-end"
                    triggerClassName="w-full rounded-[10px]"
                    trigger={() => (
                        <span className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[var(--gm-wash)]">
                            {avatar}
                            <span className="flex min-w-0 flex-col text-left leading-tight">
                                <span className="truncate text-[13px] text-[var(--gm-text)]">林汐</span>
                                <span className="truncate text-[11px] text-[var(--gm-text-3)]">服装与服饰设计</span>
                            </span>
                        </span>
                    )}
                    items={ACCOUNT_ITEMS(onNotice)}
                />
            </div>
        </div>
    );
}
