"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { BillingPlansModal } from "@/components/billing/billing-plans-modal";
import { GammaSidebar } from "@/components/gamma-ui/gamma-sidebar";
import { CdkRedeemModal } from "@/components/layout/cdk-redeem-modal";
import { GammaAccountActions } from "@/components/layout/gamma-account-actions";
import { isHelpCenterVisible, workspaceNavActiveKey, workspaceNavItems } from "@/components/layout/workspace-navigation";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { resetClientSessionState } from "@/lib/client-session-reset";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

/*
 * 全站统一的布鲁伽马侧栏（首页 / 与所有工作空间页面）：
 * 导航项按「功能模块开关 + 角色菜单权限 + 学校身份」过滤，底部是账户操作区。
 * 未登录用户点受保护入口时，(user) 布局会先带着 next 跳去登录。
 */

export interface GammaAppSidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    featureModules?: FeatureModuleSettings;
    /** 未登录时不传 */
    menuPermissions?: readonly UserNavigationMenuPermission[];
    schoolContext?: SchoolContext | null;
    /** 首页传入「回到首页登录」的版本；默认去 /login */
    onLogin?: () => void;
    /** 首页已有自己的套餐弹窗时传入；不传则用侧栏自带的 */
    onPlans?: () => void;
}

const assign = (path: string) => window.location.assign(path);

export function GammaAppSidebar({ collapsed, onToggle, featureModules, menuPermissions, schoolContext = null, onLogin, onPlans }: GammaAppSidebarProps) {
    const pathname = usePathname();
    const user = useUserStore((state) => state.user);
    const sessionReady = usePublicSessionStore((state) => state.ready);
    const sessionFeatureModules = usePublicSessionStore((state) => state.payload?.settings?.featureModules);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const [plansOpen, setPlansOpen] = useState(false);
    const [redeemOpen, setRedeemOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    // 后台改了模块开关后，会话里的设置比服务端首屏传入的更新
    const modules = sessionFeatureModules || featureModules;
    const items = workspaceNavItems({ schoolContext, featureModules: modules, menuPermissions });
    const activeKey = workspaceNavActiveKey(pathname, items);
    // 工作空间只在登录后渲染，用户已由服务端水合时不必等会话接口
    const ready = sessionReady || Boolean(user);

    const logout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            resetClientSessionState();
            window.location.assign("/");
        }
    };

    return (
        <>
            <GammaSidebar
                items={items}
                homeHref="/"
                activeKey={activeKey}
                collapsed={collapsed}
                onToggle={onToggle}
                actions={
                    <GammaAccountActions
                        collapsed={collapsed}
                        user={user}
                        ready={ready}
                        dark={theme === "dark"}
                        showHelp={isHelpCenterVisible(modules, menuPermissions)}
                        showTheme={false}
                        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
                        onLogin={onLogin || (() => assign("/login"))}
                        onPlans={onPlans || (() => setPlansOpen(true))}
                        onRedeem={() => setRedeemOpen(true)}
                        onOpen={assign}
                        onLogout={() => void logout()}
                    />
                }
            />
            {user ? <CdkRedeemModal open={redeemOpen} onClose={() => setRedeemOpen(false)} /> : null}
            {onPlans ? null : <BillingPlansModal open={plansOpen} onClose={() => setPlansOpen(false)} onSelect={(product) => assign(`/billing/checkout?product=${encodeURIComponent(product.id)}`)} />}
        </>
    );
}
