"use client";

import { Bell, Check, Crown, LogOut, Moon, Search, Settings, Sun, Type, UserRound, Zap } from "lucide-react";

import { GammaSidebarRow } from "@/components/gamma-ui/gamma-sidebar";
import { GammaMenu } from "@/components/gamma-ui/gamma-overlays";
import { GammaCountUp } from "@/components/gamma-ui/gamma-motion";
import { GAMMA_FONT_OPTIONS } from "@/components/gamma-ui/gamma-fonts";
import { useGammaTheme } from "@/components/gamma-ui/gamma-theme";
import { cn } from "@/lib/utils";

/** 侧栏菜单触发器：与普通行同尺寸，菜单向右弹出 */
const MENU_ROW = "flex h-10 w-full items-center gap-3 rounded-[10px] text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]";

/**
 * 原右上角的全部操作，搬进侧栏底部：搜索、积分、签到、通知、字体、主题、账户。
 * 展开时图标 + 文字（积分显示数值），收起时只剩图标，hover 出提示。
 */
export function GammaSidebarActions({
    collapsed,
    points,
    checkedIn,
    onSearch,
    onCheckIn,
    onNotify,
    onUpgrade,
    onNotice,
}: {
    collapsed: boolean;
    points: number;
    checkedIn: boolean;
    onSearch: () => void;
    onCheckIn: () => void;
    onNotify: () => void;
    onUpgrade: () => void;
    onNotice: (message: string) => void;
}) {
    const { mode, toggleMode, fontId, setFontId } = useGammaTheme();
    const dark = mode === "dark";
    const menuTrigger = cn(MENU_ROW, collapsed ? "justify-center" : "px-3");

    return (
        <>
            <GammaSidebarRow
                collapsed={collapsed}
                label="搜索"
                icon={<Search className="size-[18px]" />}
                onClick={onSearch}
                trailing={<kbd className="rounded bg-[var(--gm-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--gm-text-3)]">Ctrl K</kbd>}
            />
            <GammaSidebarRow
                collapsed={collapsed}
                label={collapsed ? `积分 ${points.toLocaleString()}` : "积分"}
                icon={<Zap className="size-[18px] fill-[var(--gm-cyan)] text-[var(--gm-accent)]" />}
                onClick={onUpgrade}
                trailing={<GammaCountUp value={points} className="text-xs font-medium text-[var(--gm-text)]" />}
            />
            <GammaSidebarRow
                collapsed={collapsed}
                label={checkedIn ? "今日已签到" : "签到 +50"}
                icon={checkedIn ? <Check className="size-[18px] text-[var(--gm-success)]" /> : <Crown className="size-[18px] text-[var(--gm-warning)]" />}
                onClick={onCheckIn}
            />
            <GammaSidebarRow
                collapsed={collapsed}
                label="通知"
                icon={
                    <span className="relative">
                        <Bell className="size-[18px]" />
                        <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[var(--gm-danger)] ring-2 ring-[var(--gm-bg-elevated)]" />
                    </span>
                }
                onClick={onNotify}
            />
            <GammaMenu
                label="切换字体"
                placement="right-end"
                triggerClassName={menuTrigger}
                trigger={() => (
                    <>
                        <Type className="size-[18px] shrink-0" />
                        {collapsed ? null : <span>字体</span>}
                    </>
                )}
                items={GAMMA_FONT_OPTIONS.map((option) => ({ key: option.id, label: `${option.name}${option.id === fontId ? "  ✓" : ""}`, onSelect: () => setFontId(option.id) }))}
            />
            <GammaSidebarRow
                collapsed={collapsed}
                label={dark ? "白色主题" : "黑夜主题"}
                icon={
                    <span className="relative grid size-[18px] place-items-center">
                        <Sun className={cn("absolute size-[18px] transition-all duration-300", dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100")} />
                        <Moon className={cn("absolute size-[18px] transition-all duration-300", dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0")} />
                    </span>
                }
                onClick={toggleMode}
            />
            <GammaMenu
                label="账户菜单"
                placement="right-end"
                triggerClassName={cn(MENU_ROW, collapsed ? "justify-center" : "px-2")}
                trigger={() => (
                    <>
                        <span className="size-7 shrink-0 rounded-full bg-[image:var(--gm-gradient)] ring-2 ring-[var(--gm-accent-ring)]" />
                        {collapsed ? null : (
                            <span className="flex min-w-0 flex-col text-left leading-tight">
                                <span className="truncate text-[13px] text-[var(--gm-text)]">林汐</span>
                                <span className="truncate text-[11px] text-[var(--gm-text-3)]">服装与服饰设计</span>
                            </span>
                        )}
                    </>
                )}
                items={[
                    { key: "profile", label: "个人主页", icon: <UserRound />, onSelect: () => onNotice("个人主页设计中") },
                    { key: "settings", label: "账户设置", icon: <Settings />, onSelect: () => onNotice("设置页设计中") },
                    { key: "logout", label: "退出登录", icon: <LogOut />, danger: true, onSelect: () => onNotice("演示页不会真的退出") },
                ]}
            />
        </>
    );
}
