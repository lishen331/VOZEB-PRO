"use client";

import { useMemo, useState } from "react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBannerCarousel, GammaPromoCard, type GammaBannerSlide } from "@/components/gamma-ui/gamma-hero";
import { GammaSidebar, useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import type { GammaRailItem } from "@/components/gamma-ui/gamma-shell";
import { GAMMA_SUBJECTS, gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { GammaToolRow } from "@/components/gamma-ui/gamma-tool-row";
import { resetClientSessionState } from "@/lib/client-session-reset";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { GammaHomeGallery } from "./gamma-home-gallery";
import { GammaHomeSidebarActions } from "./gamma-home-sidebar";
import { useHomeActions } from "./home-actions";

/*
 * 布鲁伽马新首页（真实站点 /）：可灵 /app 版式 —— 侧栏 → 轮播 + 推广卡 → 12 个专业 → 公开作品广场。
 * 与预览页 /bluegamma/home 的区别：全部接真实数据与真实页面（登录态、积分、套餐、作品广场、创作入口），
 * 主题跟随全站（html.dark / gm-app），不再用预览页的本地主题。
 */

/** 工具行主卡推荐的专业 */
const FEATURED_SLUG = "film";

/** 侧栏入口指向现有功能页；受保护页面未登录时先去登录 */
const SIDEBAR_ITEMS: readonly (GammaRailItem & { protected?: boolean })[] = [
    { key: "home", label: "首页", icon: "home", href: "/", group: "create" },
    { key: "create", label: "AI 创作", icon: "subjects", group: "create", protected: true },
    { key: "drama", label: "短剧制作", icon: "courseware", group: "create", protected: true },
    { key: "assets", label: "我的素材", icon: "assets", group: "assets", protected: true },
    { key: "prompts", label: "提示词库", icon: "prompts", group: "assets", protected: true },
    { key: "gallery", label: "作品广场", icon: "plaza", href: "/gallery", group: "community" },
    { key: "community", label: "创作社区", icon: "classes", group: "community", protected: true },
];

/** 侧栏 key → 真实页面 */
const ROUTE: Record<string, string> = { create: "/create", drama: "/drama", assets: "/assets", prompts: "/prompts", community: "/community" };

export function GammaHomeView() {
    const { authenticated, sessionReady, site, openLogin, openBillingPlans, openProtectedPath, startCreating } = useHomeActions();
    const user = useUserStore((state) => state.user);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const sidebar = useGammaSidebarState();
    const [loggingOut, setLoggingOut] = useState(false);

    /** 选专业 → 带着该专业的示例提示词进入 AI 创作（未登录先登录） */
    const openSubject = (slug: string) => startCreating(gammaSubjectBySlug(slug).example);

    const slides = useMemo<GammaBannerSlide[]>(
        () => [
            {
                key: "launch",
                eyebrow: site.title,
                title: (
                    <>
                        12 个设计专业，<span className="gm-gradient-text">一个创作台</span>
                    </>
                ),
                description: "从效果图到成片，服装、室内、影视、游戏一站生成",
                cover: "/style-thumbs/cinematic.jpg",
                action: (
                    <GammaButton size="sm" variant="cyan" onClick={() => startCreating()}>
                        开始创作
                    </GammaButton>
                ),
            },
            {
                key: "drama",
                eyebrow: "短剧制作 · 从剧本到成片",
                title: "一个人也能拍完一部短剧",
                description: "剧本拆分镜、角色与场景定妆、分镜出图与视频合成",
                cover: "/style-thumbs/realistic.jpg",
                action: (
                    <GammaButton size="sm" variant="glass" onClick={() => openProtectedPath("/drama")}>
                        新建短剧
                    </GammaButton>
                ),
            },
            {
                key: "gallery",
                eyebrow: "作品广场 · 灵感",
                title: "看看大家都在做什么",
                description: "公开作品可直接复制提示词，一键做同款",
                cover: "/style-thumbs/dark-fantasy.jpg",
                action: (
                    <GammaButton size="sm" variant="glass" onClick={() => window.location.assign("/gallery")}>
                        逛作品广场
                    </GammaButton>
                ),
            },
        ],
        [openProtectedPath, site.title, startCreating],
    );

    const featured = gammaSubjectBySlug(FEATURED_SLUG);
    const toolSubjects = useMemo(() => GAMMA_SUBJECTS.filter((subject) => subject.slug !== FEATURED_SLUG), []);
    const items = useMemo(() => SIDEBAR_ITEMS.map(({ protected: _protected, ...item }) => item), []);

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
        <div className="fixed inset-0 z-0 flex bg-[var(--gm-bg)] text-[var(--gm-text)]">
            <GammaSidebar
                items={items}
                homeHref="/"
                activeKey="home"
                collapsed={sidebar.collapsed}
                onToggle={sidebar.toggle}
                onSelect={(key) => openProtectedPath(ROUTE[key] || "/")}
                actions={
                    <GammaHomeSidebarActions
                        collapsed={sidebar.collapsed}
                        user={authenticated ? user : null}
                        ready={sessionReady}
                        dark={theme === "dark"}
                        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
                        onLogin={() => openLogin("/")}
                        onPlans={openBillingPlans}
                        onOpen={openProtectedPath}
                        onLogout={() => void logout()}
                    />
                }
            />
            <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto">
                <div aria-hidden className="gm-aurora pointer-events-none absolute -top-40 left-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                <h1 className="sr-only">{site.title} · AI 创作平台</h1>
                <div className="relative flex flex-col gap-3 px-4 pt-4 pb-12 lg:px-5">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_1fr]">
                        <GammaBannerCarousel slides={slides} />
                        <GammaPromoCard
                            title={
                                <>
                                    套餐与积分，
                                    <br />
                                    按需开通
                                </>
                            }
                            description="查看全部套餐与积分包"
                            cover="/style-thumbs/3d-render.jpg"
                            onClick={openBillingPlans}
                        />
                    </div>
                    <GammaToolRow featured={featured} subjects={toolSubjects} onPick={openSubject} />
                    <div className="mt-2">
                        <GammaHomeGallery onCreate={() => startCreating()} />
                    </div>
                    <HomeFooterLine />
                </div>
            </main>
        </div>
    );
}

/** 页脚：版权 + 隐私 / 条款（来自站点设置） */
function HomeFooterLine() {
    const { site } = useHomeActions();
    const policies = [site.privacyUrl?.trim() ? { label: "隐私政策", href: site.privacyUrl.trim() } : null, site.termsUrl?.trim() ? { label: "服务条款", href: site.termsUrl.trim() } : null].filter((item): item is { label: string; href: string } =>
        Boolean(item),
    );
    const copyright = site.footerCopyright?.trim();
    if (!copyright && !policies.length) return null;
    return (
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[var(--gm-border)] pt-5 text-xs text-[var(--gm-text-3)]">
            {copyright ? <span>{copyright}</span> : null}
            {policies.map((item) => (
                <a key={item.href} href={item.href} className="transition-colors hover:text-[var(--gm-text)]">
                    {item.label}
                </a>
            ))}
        </footer>
    );
}
