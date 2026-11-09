"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBannerCarousel, GammaPromoCard, type GammaBannerSlide } from "@/components/gamma-ui/gamma-hero";
import { GammaAnnouncement } from "@/components/gamma-ui/gamma-shell";
import { useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import { GammaAppSidebar } from "@/components/layout/gamma-app-sidebar";
import { WelcomeGuide } from "@/components/onboarding/welcome-guide";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { GammaHomeGallery } from "./gamma-home-gallery";
import { GammaHomeCases } from "./gamma-home-cases";
import { useHomeActions } from "./home-actions";

/*
 * 布鲁伽马用户首页：展示真实入口、真实公开作品与课程大厅，不将尚未上线的专业方向伪装为独立产品。
 */

/** 滚动超过这个距离才显示「回到顶部」，约等于首屏轮播完全滚出 */
const BACK_TO_TOP_THRESHOLD = 420;

export interface GammaHomeViewProps {
    featureModules?: FeatureModuleSettings;
    /** 未登录时为空 */
    menuPermissions?: readonly UserNavigationMenuPermission[];
    schoolContext?: SchoolContext | null;
}
export function GammaHomeView({ featureModules, menuPermissions, schoolContext }: GammaHomeViewProps) {
    const { site, openLogin, openProtectedPath } = useHomeActions();
    const sidebar = useGammaSidebarState();
    const scrollRef = useRef<HTMLElement | null>(null);
    const [showBackToTop, setShowBackToTop] = useState(false);

    const [showAnnouncement, setShowAnnouncement] = useState(true);

    // 回到顶部：首屏（轮播 + 推广卡）滚出视野后再出现，避免一进页面就挡住内容。
    // 滚动的是 <main> 而不是 window，所以监听的是元素自身的 scroll。
    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const onScroll = () => setShowBackToTop(container.scrollTop > BACK_TO_TOP_THRESHOLD);
        onScroll();
        container.addEventListener("scroll", onScroll, { passive: true });
        return () => container.removeEventListener("scroll", onScroll);
    }, []);

    const openCourseHall = () => openProtectedPath("/teaching?tab=catalog");

    const slides = useMemo<GammaBannerSlide[]>(
        () => [
            {
                key: "launch",
                eyebrow: site.title,
                title: (
                    <>
                        AI 创作工作台，<span className="gm-gradient-text">从灵感到作品</span>
                    </>
                ),
                description: "在无限画布中组织灵感、调用创作工具并发布作品",
                cover: "/style-thumbs/cinematic.jpg",
                action: (
                    <GammaButton size="sm" variant="cyan" onClick={() => openProtectedPath("/canvas")}>
                        开始创作
                    </GammaButton>
                ),
            },
            {
                key: "drama",
                eyebrow: "短剧制作 · 从剧本到成片",
                title: "一个人也能拍完一部短剧",
                description: "剧本拆分镜、角色与场景定妆、分镜出图与视频合成",
                cover: "/home/banner-drama.jpg",
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
                    <GammaButton size="sm" variant="glass" onClick={() => window.location.assign("/community")}>
                        逛作品广场
                    </GammaButton>
                ),
            },
        ],
        [openProtectedPath, site.title],
    );

    return (
        <div className="fixed inset-0 z-0 flex flex-col bg-[var(--gm-bg)] text-[var(--gm-text)]">
            {/* 公告条横跨整个顶部（含侧栏上方），关闭后整页随之上移 */}
            <AnimatePresence initial={false}>
                {showAnnouncement ? (
                    <motion.div key="announcement" initial={{ height: 0 }} animate={{ height: 40 }} exit={{ height: 0 }} className="relative z-50 shrink-0 overflow-hidden">
                        <GammaAnnouncement onClose={() => setShowAnnouncement(false)}>✦ 欢迎来到蓝色伽马 BlueGamma · AI 创作工作台</GammaAnnouncement>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <div className="flex min-h-0 flex-1">
                <GammaAppSidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} featureModules={featureModules} menuPermissions={menuPermissions} schoolContext={schoolContext} onLogin={() => openLogin("/")} showTheme />
                <main ref={scrollRef} className="gm-scroll relative min-w-0 flex-1 overflow-y-auto bg-transparent">
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-40 left-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                    <h1 className="sr-only">{site.title} · 学生作品展示</h1>

                    <div className="relative flex flex-col gap-3 px-4 pt-4 pb-12 lg:px-5">
                        {/* 轮播与推广卡始终同排，窗口变窄时按比例一起收缩；只有手机宽度才上下排 */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                            <GammaBannerCarousel slides={slides} />
                            <GammaPromoCard
                                title={
                                    <>
                                        课程大厅，
                                        <br />
                                        发现优质课程
                                    </>
                                }
                                description="浏览课程中心的公开课程内容"
                                onClick={openCourseHall}
                            />
                        </div>

                        <GammaHomeCases />

                        <div className="mt-2">
                            <GammaHomeGallery onCreate={() => openProtectedPath("/canvas")} />
                        </div>

                        <HomeFooterLine />
                    </div>
                </main>
                <BackToTopButton visible={showBackToTop} containerRef={scrollRef} />
            </div>
            {/* 首次使用引导：内容按当前可见模块生成，全部不可见时组件自身返回 null */}
            <WelcomeGuide featureModules={featureModules} menuPermissions={menuPermissions} schoolContext={schoolContext} />
        </div>
    );
}

/**
 * 回到首页顶部：玻璃胶囊 + 品牌描边，滚过首屏后从右下角弹入。
 * 固定定位在视口右下（相对整个页面，不是滚动容器内），避免随内容一起滚走。
 */
function BackToTopButton({ visible, containerRef }: { visible: boolean; containerRef: RefObject<HTMLElement | null> }) {
    const reduce = useReducedMotion();
    const scrollToTop = () => {
        containerRef.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    };
    return (
        <AnimatePresence>
            {visible ? (
                <motion.button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="回到首页顶部"
                    title="回到首页顶部"
                    initial={{ opacity: 0, y: 12, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.92 }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--gm-surface-2)_82%,transparent)] px-3.5 py-2 text-[13px] font-medium text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border-strong)] backdrop-blur-xl transition-colors hover:text-[var(--gm-accent)] hover:ring-[var(--gm-accent)] focus-visible:text-[var(--gm-accent)] focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:outline-none lg:right-8 lg:bottom-8"
                    style={{ boxShadow: "var(--gm-shadow)" }}
                >
                    <ArrowUp className="size-3.5" />
                    回到顶部
                </motion.button>
            ) : null}
        </AnimatePresence>
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
