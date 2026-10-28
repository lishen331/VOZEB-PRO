"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBannerCarousel, GammaPromoCard, type GammaBannerSlide } from "@/components/gamma-ui/gamma-hero";
import { GammaAnnouncement } from "@/components/gamma-ui/gamma-shell";
import { useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import { GAMMA_SUBJECTS, gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { GammaToolRow } from "@/components/gamma-ui/gamma-tool-row";
import { GammaAppSidebar } from "@/components/layout/gamma-app-sidebar";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { GammaHomeGallery } from "./gamma-home-gallery";
import { useHomeActions } from "./home-actions";

/*
 * 布鲁伽马新首页（真实站点 /）：按可灵 /app 版式排布 ——
 * 公告 → 侧栏（含明暗切换，无顶栏）→ 轮播 + 推广卡 → 12 个专业方向工具行（点击进画布）
 * → 学生作品广场 → 页脚。
 * AI 创作暂未做好，首页不再放创作输入框；专业方向点击直接进入 /canvas 空画布。
 */

const FEATURED_SLUG = "film";

export interface GammaHomeViewProps {
    featureModules?: FeatureModuleSettings;
    /** 未登录时为空 */
    menuPermissions?: readonly UserNavigationMenuPermission[];
    schoolContext?: SchoolContext | null;
}
export function GammaHomeView({ featureModules, menuPermissions, schoolContext }: GammaHomeViewProps) {
    const { site, openLogin, openBillingPlans, openProtectedPath } = useHomeActions();
    const sidebar = useGammaSidebarState();

    const [showAnnouncement, setShowAnnouncement] = useState(true);

    // 专业方向暂不带示例提示词：画布自带的 Agent 对话面板目前关闭（CANVAS_AGENT_ENABLED），
    // 填进去的提示词没有地方承接，所以统一跳空画布。
    const openSubject = () => openProtectedPath("/canvas");
    const featured = gammaSubjectBySlug(FEATURED_SLUG);
    const toolSubjects = useMemo(() => GAMMA_SUBJECTS.filter((subject) => subject.slug !== FEATURED_SLUG), []);

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
                    <GammaButton size="sm" variant="cyan" onClick={openSubject}>
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
        [openProtectedPath, site.title],
    );

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
                <GammaAppSidebar
                    collapsed={sidebar.collapsed}
                    onToggle={sidebar.toggle}
                    featureModules={featureModules}
                    menuPermissions={menuPermissions}
                    schoolContext={schoolContext}
                    onLogin={() => openLogin("/")}
                    onPlans={openBillingPlans}
                    showTheme
                />
                <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto bg-transparent">
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-40 left-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                    <h1 className="sr-only">{site.title} · 学生作品展示</h1>

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
                            <GammaHomeGallery onCreate={openSubject} />
                        </div>

                        <HomeFooterLine />
                    </div>
                </main>
            </div>
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

