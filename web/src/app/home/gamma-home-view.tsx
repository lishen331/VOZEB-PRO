"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Download, LayoutTemplate, Palette, Sparkles, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaPointsPill, GammaTaskCard } from "@/components/gamma-ui/gamma-cards";
import { GammaCommandPalette, GammaSearchTrigger, useGammaCommandHotkey, type GammaCommandItem } from "@/components/gamma-ui/gamma-command";
import { GammaHomeAgentComposer } from "./home-agent-composer";
import { GammaBannerCarousel, GammaPromoCard, type GammaBannerSlide } from "@/components/gamma-ui/gamma-hero";
import { GammaLightbox, GammaToastStack, type GammaToastItem } from "@/components/gamma-ui/gamma-overlays";
import { AnnouncementNotificationCenter } from "@/components/layout/announcement-notification-center";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GammaAnnouncement, GammaSection } from "@/components/gamma-ui/gamma-shell";
import { useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import { GAMMA_SUBJECTS, gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { GammaAppSidebar } from "@/components/layout/gamma-app-sidebar";
import { listCanvasProjectSummaries } from "@/services/api/canvas-projects";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { cn } from "@/lib/utils";
import { GammaCreatorBoard, GammaFeaturedReel, GammaRecentProjects, GammaTemplateRail, type RecentProjectItem } from "@/app/bluegamma/gamma-home-sections";
import { GammaHomeGallery } from "./gamma-home-gallery";
import { useHomeActions } from "./home-actions";

/*
 * 布鲁伽马新首页（真实站点 /）：demo 版式 ——
 * 公告 → 胶囊顶栏 → 问候 → 主视觉（轮播 + 推广卡）→ 创作输入 → 继续创作
 * → 灵感模板 → 精选短片 / 创作者榜 → 作品展示 → 页脚。
 * 数据与动作沿用首页原有实现：startCreating / openProtectedPath / openBillingPlans / openLogin。
 */

const FEATURED_SLUG = "film";
/** 每 1% 进度约 0.03 秒，用来估算剩余时间 */
const SECONDS_PER_PERCENT = 0.03;

function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了";
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    return "晚上好";
}

/** 把 ISO 时间转成「12 分钟前」 */
function relativeTime(iso: string) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "昨天";
    if (days < 30) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
}

export interface GammaHomeViewProps {
    featureModules?: FeatureModuleSettings;
    /** 未登录时为空 */
    menuPermissions?: readonly UserNavigationMenuPermission[];
    schoolContext?: SchoolContext | null;
}

export function GammaHomeView({ featureModules, menuPermissions, schoolContext }: GammaHomeViewProps) {
    const { site, authenticated, openLogin, openBillingPlans, openProtectedPath, startCreating } = useHomeActions();
    const sidebar = useGammaSidebarState();
    const user = useUserStore((state) => state.user);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);

    // 顶栏胶囊化：离开顶部即收缩，回到顶部再展开
    const [scrolled, setScrolled] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [subjectSlug, setSubjectSlug] = useState(GAMMA_SUBJECTS[0].slug);
    const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
    const [showAnnouncement, setShowAnnouncement] = useState(true);
    const [toasts, setToasts] = useState<GammaToastItem[]>([]);
    // 问候语依赖本地时间，只在客户端首帧之后计算，避免 SSR 与客户端文案不一致
    const [hello] = useState(() => (typeof window === "undefined" ? "你好" : greeting()));

    const points = Math.max(0, Math.floor(user?.pointsBalance || 0));

    const notice = useCallback((message: string) => {
        setToasts((current) => [...current, { id: Date.now() + Math.random(), tone: "info", message }]);
    }, []);

    const openCommand = useCallback(() => setCommandOpen(true), []);
    useGammaCommandHotkey(openCommand);

    /** 选专业 → 带上该专业的示例提示词进入 AI 创作（未登录先登录） */
    const openSubject = useCallback((slug: string) => startCreating(gammaSubjectBySlug(slug).example), [startCreating]);

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

    const handleSubmit = (prompt: string) => {
        startCreating(prompt);
    };

    const commandItems: GammaCommandItem[] = useMemo(
        () => [
            ...GAMMA_SUBJECTS.map((item) => {
                const Icon = item.icon;
                return { id: `major-${item.slug}`, group: "专业方向", label: `${item.name} · ${item.tagline}`, keywords: `${item.nameEn} ${item.outputs.join(" ")}`, icon: <Icon />, hint: item.nameEn, onSelect: () => openSubject(item.slug) };
            }),
            { id: "go-gallery", group: "跳转", label: "作品广场", icon: <Sparkles />, onSelect: () => openProtectedPath("/gallery") },
            { id: "go-canvas", group: "跳转", label: "无限画布", icon: <LayoutTemplate />, onSelect: () => openProtectedPath("/canvas") },
            { id: "go-ip", group: "跳转", label: "IP 库", icon: <Palette />, onSelect: () => openProtectedPath("/ip-library") },
            { id: "act-plans", group: "操作", label: "套餐与积分", icon: <Zap />, onSelect: openBillingPlans },
        ],
        [openBillingPlans, openProtectedPath, openSubject],
    );

    // 继续创作：登录后显示真实的最近画布项目
    const recentQuery = useQuery({
        queryKey: ["home-recent-projects"],
        queryFn: () => listCanvasProjectSummaries({ page: 1, pageSize: 3 }),
        enabled: authenticated,
        staleTime: 60_000,
    });
    const recentProjects: RecentProjectItem[] | undefined = useMemo(() => {
        if (!authenticated) return undefined;
        return (recentQuery.data?.projects || []).map((project) => ({
            id: project.id,
            title: project.title,
            subjectSlug: FEATURED_SLUG,
            edited: relativeTime(project.updatedAt),
            assets: project.nodeCount,
        }));
    }, [authenticated, recentQuery.data]);

    return (
        <div className="fixed inset-0 z-0 flex flex-col bg-[var(--gm-bg)] text-[var(--gm-text)]">
            {/* 公告条横跨整个顶部（含侧栏上方），关闭后整页随之上移 */}
            <AnimatePresence initial={false}>
                {showAnnouncement ? (
                    <motion.div key="announcement" initial={{ height: 0 }} animate={{ height: 40 }} exit={{ height: 0 }} className="relative z-50 shrink-0 overflow-hidden">
                        <GammaAnnouncement
                            onClose={() => setShowAnnouncement(false)}
                            action={
                                <button type="button" onClick={openBillingPlans} className="relative shrink-0 rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105">
                                    立即升级 →
                                </button>
                            }
                        >
                            ✦ 品牌焕新：正式更名「蓝色伽马 BlueGamma」，12 个设计专业全面上线
                        </GammaAnnouncement>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <div className="flex min-h-0 flex-1">
                <GammaAppSidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} featureModules={featureModules} menuPermissions={menuPermissions} schoolContext={schoolContext} onLogin={() => openLogin("/")} onPlans={openBillingPlans} />
                <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto bg-transparent" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 12)}>
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-40 left-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                    <h1 className="sr-only">{site.title} · AI 创作平台</h1>

                    {/* 顶栏：贴在顶部时通栏；往下滚后收成居中胶囊并保持吸顶 */}
                    <div className={cn("sticky top-0 z-30 transition-[padding] duration-300", scrolled ? "px-6 pt-3" : "px-0 pt-0")}>
                        <header
                            className={cn(
                                "gm-glass gm-glass-sheen flex items-center gap-3 transition-[max-width,height,border-radius,padding,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
                                scrolled ? "mx-auto h-14 max-w-[880px] rounded-full px-4 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.6)]" : "h-16 w-full max-w-none rounded-none border-b border-[var(--gm-border)] px-6",
                            )}
                        >
                            <GammaSearchTrigger onOpen={openCommand} />
                            <div className="ml-auto flex items-center gap-2">
                                {authenticated ? <GammaPointsPill points={points} /> : null}
                                <AnnouncementNotificationCenter
                                    compact
                                    buttonClassName="grid size-9 shrink-0 place-items-center rounded-[10px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] [&_svg]:size-[18px]"
                                />
                                <AnimatedThemeToggler
                                    theme={theme}
                                    onThemeChange={setTheme}
                                    aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                                    className="grid size-9 shrink-0 place-items-center rounded-[10px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] [&_svg]:size-[18px]"
                                />
                            </div>
                        </header>
                    </div>

                    <div className="relative mx-auto flex w-full max-w-[1360px] flex-col gap-9 px-6 pt-6 pb-14 lg:px-8">
                        <div className="flex flex-col gap-3">
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="flex items-end justify-between gap-4">
                                <div>
                                    <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--gm-accent)] uppercase">BlueGamma Studio</p>
                                    <h2 className="gm-home-greeting mt-2 text-[34px] leading-[1.15] font-semibold tracking-tight" suppressHydrationWarning>
                                        {hello}，今天想创作点什么？
                                    </h2>
                                </div>
                                <p className="hidden text-xs text-[var(--gm-text-3)] lg:block">12 个设计专业 · 从灵感到成片，一个工作台完成</p>
                            </motion.div>
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
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
                        </div>

                        <GammaHomeAgentComposer subjectSlug={subjectSlug} onSubjectChange={setSubjectSlug} onSubmit={handleSubmit} />

                        <GammaRecentProjects projects={recentProjects} loading={authenticated && recentQuery.isLoading} onOpen={(title, id) => (id ? openProtectedPath(`/canvas/${id}`) : notice(`打开「${title}」（演示）`))} />

                        <GammaTemplateRail onUse={(slug) => openSubject(slug)} />

                        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                            <GammaFeaturedReel onPlay={() => setPreview({ src: "/style-thumbs/noir.jpg", title: "《雾港》· 毕业设计短片" })} />
                            <GammaCreatorBoard onFollow={(name) => notice(`已关注 ${name}`)} />
                        </div>

                        {/* 作品展示：搜索已在顶栏，这里不再重复搜索框 */}
                        <GammaHomeGallery onCreate={() => startCreating()} hideSearch />

                        <HomeFooterLine />
                    </div>
                </main>
            </div>

            <GammaToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
            <GammaCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} />
            <GammaLightbox
                src={preview?.src ?? null}
                title={preview?.title}
                onClose={() => setPreview(null)}
                actions={
                    <GammaButton size="sm" variant="glass" icon={<Download className="size-4" />} onClick={() => notice("已开始下载（演示）")}>
                        下载
                    </GammaButton>
                }
            />
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
