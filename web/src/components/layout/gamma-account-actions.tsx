"use client";

import { CircleHelp, Crown, Gift, History, LogIn, LogOut, Moon, Settings, Sun, UserRound, Zap } from "lucide-react";

import { GammaMenu } from "@/components/gamma-ui/gamma-overlays";
import { AnnouncementNotificationCenter } from "@/components/layout/announcement-notification-center";
import { cn } from "@/lib/utils";
import { userAvatarFallback } from "@/lib/user-avatar";
import type { LocalUser } from "@/stores/use-user-store";

/*
 * 布鲁伽马侧栏底部的账户操作区（首页与工作空间共用，替代旧版顶栏右上角）：
 *   已登录 → 积分卡（真实余额 + 升级）+ 通知 / 帮助 / 主题 + 账户菜单（个人中心 / 套餐 / 积分记录 / 管理后台 / 退出）
 *   未登录 → 一张「登录 / 注册」卡
 * 签到功能已下线（/api/check-in 返回 410），这里不再出现。
 */

const ICON_BTN =
    "group relative grid size-9 shrink-0 place-items-center rounded-[10px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] [&_svg]:size-[18px]";

const TIP =
    "pointer-events-none absolute top-1/2 left-full z-[70] ml-3 -translate-x-1 -translate-y-1/2 rounded-md bg-[var(--gm-surface-light)] px-2 py-1 text-xs font-medium whitespace-nowrap text-[var(--gm-inverse-text)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100";

function Tip({ children }: { children: string }) {
    return (
        <span role="tooltip" className={TIP}>
            {children}
        </span>
    );
}

export interface GammaAccountActionsProps {
    collapsed: boolean;
    /** 未登录时为 null */
    user: LocalUser | null;
    /** 会话是否已拉取完成（未完成时不闪「登录」卡） */
    ready: boolean;
    dark: boolean;
    /** 帮助中心模块开启且当前角色有权限时才显示帮助按钮 */
    showHelp?: boolean;
    onToggleTheme: () => void;
    onLogin: () => void;
    onPlans: () => void;
    /** CDK 兑换积分 */
    onRedeem?: () => void;
    onOpen: (path: string) => void;
    onLogout: () => void;
}

function ThemeButton({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
    return (
        <button type="button" onClick={onToggle} aria-label={dark ? "切换到白色主题" : "切换到黑夜主题"} className={ICON_BTN}>
            <span className="relative grid size-[18px] place-items-center">
                <Sun className={cn("absolute transition-all duration-300", dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100")} />
                <Moon className={cn("absolute transition-all duration-300", dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0")} />
            </span>
            <Tip>{dark ? "白色主题" : "黑夜主题"}</Tip>
        </button>
    );
}

function HelpButton({ onOpen }: { onOpen: (path: string) => void }) {
    return (
        <button type="button" onClick={() => onOpen("/help")} aria-label="帮助中心" className={ICON_BTN}>
            <CircleHelp />
            <Tip>帮助中心</Tip>
        </button>
    );
}

/** 通知中心沿用原组件（公告 + 互动消息弹窗），只换按钮外观 */
function NotificationButton() {
    return <AnnouncementNotificationCenter compact={false} buttonClassName={ICON_BTN} />;
}

/** 未登录：登录 / 注册卡；收起时只剩一个登录图标 */
function GuestCard({ collapsed, dark, showHelp, onToggleTheme, onLogin, onOpen }: Pick<GammaAccountActionsProps, "collapsed" | "dark" | "showHelp" | "onToggleTheme" | "onLogin" | "onOpen">) {
    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1">
                {showHelp ? <HelpButton onOpen={onOpen} /> : null}
                <ThemeButton dark={dark} onToggle={onToggleTheme} />
                <button type="button" onClick={onLogin} aria-label="登录 / 注册" className={cn(ICON_BTN, "text-[var(--gm-accent)]")}>
                    <LogIn />
                    <Tip>登录 / 注册</Tip>
                </button>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-end gap-0.5 px-0.5">
                {showHelp ? <HelpButton onOpen={onOpen} /> : null}
                <ThemeButton dark={dark} onToggle={onToggleTheme} />
            </div>
            <div className="rounded-[12px] bg-[var(--gm-wash)] p-3 ring-1 ring-[var(--gm-border)]">
                <p className="text-[13px] font-medium">登录后开始创作</p>
                <p className="mt-0.5 text-[11px] text-[var(--gm-text-3)]">作品、素材与积分跨设备同步</p>
                <button
                    type="button"
                    onClick={onLogin}
                    className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] bg-[image:var(--gm-gradient)] text-xs font-medium text-white shadow-[var(--gm-glow-blue)] transition-[filter] hover:brightness-110"
                >
                    <LogIn className="size-3.5" />
                    登录 / 注册
                </button>
            </div>
        </div>
    );
}

function Avatar({ user }: { user: LocalUser }) {
    if (user.avatarUrl) {
        // eslint-disable-next-line @next/next/no-img-element -- 用户头像来自对象存储，尺寸固定
        return <img src={user.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover ring-2 ring-[var(--gm-bg-elevated)]" />;
    }
    return (
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[image:var(--gm-gradient)] text-[11px] font-semibold text-white ring-2 ring-[var(--gm-bg-elevated)]">
            {userAvatarFallback(user.displayName || user.username)}
        </span>
    );
}

export function GammaAccountActions(props: GammaAccountActionsProps) {
    const { collapsed, user, ready, dark, showHelp = false, onToggleTheme, onPlans, onRedeem, onOpen, onLogout } = props;
    // 会话未就绪：只占位，避免已登录用户先看到一闪而过的「登录」卡
    if (!ready) return <div aria-hidden className={collapsed ? "h-24" : "h-32"} />;
    if (!user) return <GuestCard {...props} />;

    const points = Math.max(0, Math.floor(user.pointsBalance || 0));
    const accountItems = [
        { key: "profile", label: "个人中心", icon: <UserRound />, onSelect: () => onOpen("/profile") },
        { key: "plans", label: "套餐与积分", icon: <Crown />, onSelect: onPlans },
        { key: "points", label: "积分记录", icon: <History />, onSelect: () => onOpen("/profile?section=points") },
        ...(onRedeem ? [{ key: "redeem", label: "CDK 兑换", icon: <Gift />, onSelect: onRedeem }] : []),
        ...(user.role === "admin" ? [{ key: "admin", label: "管理后台", icon: <Settings />, onSelect: () => onOpen("/admin") }] : []),
        { key: "logout", label: "退出登录", icon: <LogOut />, danger: true, onSelect: onLogout },
    ];
    const name = user.displayName || user.username;
    const tools = (
        <>
            <NotificationButton />
            {showHelp ? <HelpButton onOpen={onOpen} /> : null}
            <ThemeButton dark={dark} onToggle={onToggleTheme} />
        </>
    );

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1">
                <button type="button" onClick={onPlans} aria-label={`积分 ${points}，查看套餐`} className={cn(ICON_BTN, "text-[var(--gm-accent)]")}>
                    <Zap className="fill-current" />
                    <Tip>{`积分 ${points.toLocaleString()}`}</Tip>
                </button>
                {tools}
                <GammaMenu label="账户菜单" placement="right-end" trigger={() => <Avatar user={user} />} items={accountItems} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-end gap-0.5 px-0.5">{tools}</div>
            <div className="rounded-[12px] bg-[var(--gm-wash)] p-2.5 ring-1 ring-[var(--gm-border)]">
                <div className="flex items-center gap-1.5">
                    <Zap className="size-3.5 fill-[var(--gm-cyan)] text-[var(--gm-accent)]" />
                    <span className="text-[15px] font-semibold tabular-nums">{points.toLocaleString()}</span>
                    <span className="text-[11px] text-[var(--gm-text-3)]">积分</span>
                    <button type="button" onClick={onPlans} className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--gm-accent)] hover:underline">
                        <Crown className="size-3" />
                        {user.hasActivePlan ? "续费" : "升级"}
                    </button>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--gm-text-3)]">{user.planName}</p>
            </div>
            <div className="border-t border-[var(--gm-border)] pt-2">
                <GammaMenu
                    label="账户菜单"
                    placement="right-end"
                    triggerClassName="w-full rounded-[10px]"
                    trigger={() => (
                        <span className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[var(--gm-wash)]">
                            <Avatar user={user} />
                            <span className="flex min-w-0 flex-col text-left leading-tight">
                                <span className="truncate text-[13px] text-[var(--gm-text)]">{name}</span>
                                <span className="truncate text-[11px] text-[var(--gm-text-3)]">ID {user.accountId}</span>
                            </span>
                        </span>
                    )}
                    items={accountItems}
                />
            </div>
        </div>
    );
}
