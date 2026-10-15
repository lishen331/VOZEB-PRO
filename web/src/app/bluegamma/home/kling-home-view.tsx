"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download } from "lucide-react";

import "@/components/gamma-ui/gamma-tokens.css";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBannerCarousel, GammaPromoCard } from "@/components/gamma-ui/gamma-hero";
import { GammaLightbox, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaAnnouncement } from "@/components/gamma-ui/gamma-shell";
import { GammaSidebar, useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import { GAMMA_SUBJECTS, gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { GammaToolRow } from "@/components/gamma-ui/gamma-tool-row";
import { GammaUpgradeModal } from "@/app/bluegamma/gamma-account";
import { GammaSidebarActions } from "@/app/bluegamma/home/sidebar-actions";
import { GAMMA_RAIL_ITEMS } from "@/app/bluegamma/gamma-nav";
import { GammaPlaza } from "@/app/bluegamma/gamma-plaza";
import { buildHomeSlides } from "@/app/bluegamma/gamma-slides";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";

/** 工具行主卡推荐的专业（对应可灵 Omni 的位置） */
const FEATURED_SLUG = "film";

/**
 * 本页侧栏：本身就是首页，不再放「首页 / 新首页」两个重复入口（Logo 即回首页）；
 * 「全部」并入上一组，不再单独占一个分区。
 */
const SIDEBAR_ITEMS = GAMMA_RAIL_ITEMS.filter((item) => item.key !== "home" && item.key !== "kling-home").map((item) => (item.group === "more" ? { ...item, group: "community" } : item));

/**
 * 可灵式首页（/bluegamma/home）：严格按可灵 /app 版式排布，只用现有组件。
 *   公告条 → 顶栏 → 轮播 + 推广卡 → 工具行（换成 12 个专业）→ 推荐/关注/活动 + 筛选 + 瀑布流
 * 与 /bluegamma（完整版首页）并存，替换时二选一。
 */
export function KlingHomeView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
    const [showAnnouncement, setShowAnnouncement] = useState(true);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const sidebar = useGammaSidebarState();

    const notice = useCallback((message: string) => toast("info", message), [toast]);
    const openSubject = useCallback((slug: string) => toast("info", `进入「${gammaSubjectBySlug(slug).name}」创作台（演示）`), [toast]);

    const slides = useMemo(() => buildHomeSlides(openSubject), [openSubject]);
    const featured = gammaSubjectBySlug(FEATURED_SLUG);
    const toolSubjects = useMemo(() => GAMMA_SUBJECTS.filter((subject) => subject.slug !== FEATURED_SLUG), []);

    const handleRemix = (prompt: string, slug: string) => {
        void navigator.clipboard?.writeText(prompt).catch(() => undefined);
        toast("success", `已复制「${gammaSubjectBySlug(slug).name}」同款提示词`);
    };

    return (
        <>
            <AnimatePresence initial={false}>
                {showAnnouncement ? (
                    <motion.div key="announcement" initial={{ height: 0 }} animate={{ height: 40 }} exit={{ height: 0 }} className="shrink-0 overflow-hidden">
                        <GammaAnnouncement
                            onClose={() => setShowAnnouncement(false)}
                            action={
                                <button type="button" onClick={() => setUpgradeOpen(true)} className="relative shrink-0 rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105">
                                    立即升级 →
                                </button>
                            }
                        >
                            ✦ 【抢先体验】BlueGamma 2.0 即将上线！创作者年卡会员可抢先体验全新创作页面
                        </GammaAnnouncement>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <div className="flex min-h-0 flex-1">
                <GammaSidebar
                    items={SIDEBAR_ITEMS}
                    homeHref="/bluegamma/home"
                    activeKey="kling-home"
                    collapsed={sidebar.collapsed}
                    onToggle={sidebar.toggle}
                    onSelect={() => notice("该模块的新版页面正在设计中")}
                    actions={
                        <GammaSidebarActions
                            collapsed={sidebar.collapsed}
                            points={demo.points}
                            checkedIn={demo.checkedIn}
                            onCheckIn={demo.checkIn}
                            onNotify={() => notice("暂无新通知")}
                            onUpgrade={() => setUpgradeOpen(true)}
                            onNotice={notice}
                        />
                    }
                />
                {/* 顶栏已撤掉，所有操作在侧栏；内容区占满宽度，不再居中留白 */}
                <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto">
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-40 left-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />

                    <div className="relative flex flex-col gap-3 px-4 pt-4 pb-12 lg:px-5">
                        {/* 第一行：大轮播 + 推广卡（对应可灵 4.0 Banner + 右侧白底推广） */}
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_1fr]">
                            <GammaBannerCarousel slides={slides} />
                            <GammaPromoCard
                                title={
                                    <>
                                        毕设季 · 作品集一键排版，
                                        <br />
                                        从草图到展板
                                    </>
                                }
                                description="作品集 · 展板 · 答辩视频一次产出"
                                cover="/style-thumbs/3d-render.jpg"
                                onClick={() => setUpgradeOpen(true)}
                            />
                        </div>

                        {/* 第二行：可灵的工具行 → 12 个专业方向 */}
                        <GammaToolRow featured={featured} subjects={toolSubjects} onPick={openSubject} />

                        {/* 下方：推荐 / 关注 / 活动 + 搜索 + 专业筛选 + 瀑布流 */}
                        <div className="mt-2">
                            <GammaPlaza compact onPreview={setPreview} onRemix={handleRemix} onNotice={notice} />
                        </div>
                    </div>
                </main>
            </div>

            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
            <GammaLightbox
                src={preview?.src ?? null}
                title={preview?.title}
                onClose={() => setPreview(null)}
                actions={
                    <GammaButton size="sm" variant="glass" icon={<Download className="size-4" />} onClick={() => toast("success", "已开始下载（演示）")}>
                        下载
                    </GammaButton>
                }
            />
            <GammaUpgradeModal
                open={upgradeOpen}
                onClose={() => setUpgradeOpen(false)}
                onConfirm={() => {
                    setUpgradeOpen(false);
                    toast("success", "已提交开通（演示）");
                }}
            />
        </>
    );
}
