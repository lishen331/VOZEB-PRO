"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Download, LayoutTemplate, Palette, Sparkles, Zap } from "lucide-react";

import "@/components/gamma-ui/gamma-tokens.css";
import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaPointsPill, GammaTaskCard } from "@/components/gamma-ui/gamma-cards";
import { GammaCommandPalette, GammaSearchTrigger, useGammaCommandHotkey, type GammaCommandItem } from "@/components/gamma-ui/gamma-command";
import { GammaComposer, type GammaComposerSubmit } from "@/components/gamma-ui/gamma-composer";
import { GammaBannerCarousel, GammaPromoCard } from "@/components/gamma-ui/gamma-hero";
import { GammaLightbox, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaAnnouncement, GammaRail, GammaSection } from "@/components/gamma-ui/gamma-shell";
import { GAMMA_SUBJECTS, gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { GammaFontSwitcher, GammaThemeToggle } from "@/components/gamma-ui/gamma-theme";
import { GammaAccountMenu, GammaUpgradeModal } from "@/app/bluegamma/gamma-account";
import { GammaCreatorBoard, GammaFeaturedReel, GammaFooter, GammaRecentProjects, GammaTemplateRail } from "@/app/bluegamma/gamma-home-sections";
import { GAMMA_RAIL_ITEMS } from "@/app/bluegamma/gamma-nav";
import { GammaPlaza } from "@/app/bluegamma/gamma-plaza";
import { buildHomeSlides } from "@/app/bluegamma/gamma-slides";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { cn } from "@/lib/utils";

const SMOOTH_CENTER: ScrollIntoViewOptions = { behavior: "smooth", block: "center" };
const SMOOTH_START: ScrollIntoViewOptions = { behavior: "smooth", block: "start" };
/** 每 1% 进度约 0.03 秒，用来估算剩余时间 */
const SECONDS_PER_PERCENT = 0.03;

function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了";
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    return "晚上好";
}

function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView(SMOOTH_START);
}

/**
 * 布鲁伽马新版首页（对标可灵 /app 结构，面向设计与艺术专业）：
 * 公告条 → 玻璃顶栏（搜索 / 积分 / 主题）→ 问候 + 轮播 + 推广 → 创作输入（专业切换）→ 继续创作
 * → 专业方向 → 灵感模板 → 精选短片 + 创作者榜 → 我的生成 → 作品广场 → 页脚
 */
export function GammaHomeView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const router = useRouter();
    const [activeNav, setActiveNav] = useState("home");
    const [subjectSlug, setSubjectSlug] = useState(GAMMA_SUBJECTS[0].slug);
    const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
    const [showAnnouncement, setShowAnnouncement] = useState(true);
    // 顶栏胶囊化：离开顶部即收缩，回到顶部再展开
    const [scrolled, setScrolled] = useState(false);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [remix, setRemix] = useState<{ text: string; seq: number } | undefined>(undefined);
    // 问候语依赖本地时间，只在客户端首帧之后计算，避免 SSR 与客户端文案不一致
    const [hello] = useState(() => (typeof window === "undefined" ? "你好" : greeting()));
    const composerRef = useRef<HTMLDivElement>(null);
    const tasksRef = useRef<HTMLDivElement>(null);

    const subject = gammaSubjectBySlug(subjectSlug);
    const notice = useCallback((message: string) => toast("info", message), [toast]);

    const pickSubject = useCallback((slug: string) => {
        setSubjectSlug(slug);
        composerRef.current?.scrollIntoView(SMOOTH_CENTER);
    }, []);

    const openCommand = useCallback(() => setCommandOpen(true), []);
    useGammaCommandHotkey(openCommand);

    const handleNav = (key: string) => {
        setActiveNav(key);
        if (key === "majors" || key === "plaza") scrollToId(key);
        else notice("该模块的新版页面正在设计中");
    };

    const slides = useMemo(() => buildHomeSlides(pickSubject), [pickSubject]);

    const fillPrompt = (text: string, slug: string) => {
        setSubjectSlug(slug);
        setRemix((current) => ({ text, seq: (current?.seq ?? 0) + 1 }));
        composerRef.current?.scrollIntoView(SMOOTH_CENTER);
    };

    const handleRemix = (prompt: string, slug: string) => {
        fillPrompt(prompt, slug);
        toast("info", "已填入同款提示词");
    };

    const handleTemplate = (slug: string, title: string) => {
        fillPrompt(gammaSubjectBySlug(slug).example, slug);
        toast("info", `已套用模板「${title}」`);
    };

    const handleSubmit = (payload: GammaComposerSubmit) => {
        demo.submit(payload);
        window.requestAnimationFrame(() => tasksRef.current?.scrollIntoView(SMOOTH_START));
    };

    const download = () => toast("success", "已开始下载（演示）");

    const commandItems: GammaCommandItem[] = useMemo(
        () => [
            ...GAMMA_SUBJECTS.map((item) => {
                const Icon = item.icon;
                return { id: `major-${item.slug}`, group: "专业方向", label: `${item.name} · ${item.tagline}`, keywords: `${item.nameEn} ${item.outputs.join(" ")}`, icon: <Icon />, hint: item.nameEn, onSelect: () => pickSubject(item.slug) };
            }),
            { id: "go-templates", group: "跳转", label: "灵感模板", icon: <LayoutTemplate />, onSelect: () => scrollToId("templates") },
            { id: "go-plaza", group: "跳转", label: "作品广场", icon: <Sparkles />, onSelect: () => scrollToId("plaza") },
            { id: "go-design", group: "跳转", label: "设计系统", icon: <Palette />, hint: "/bluegamma/design", onSelect: () => router.push("/bluegamma/design") },
            { id: "act-upgrade", group: "操作", label: "升级会员", icon: <Zap />, onSelect: () => setUpgradeOpen(true) },
        ],
        [pickSubject, router],
    );

    return (
        <>
            <AnimatePresence initial={false}>
                {showAnnouncement ? (
                    <motion.div key="announcement" initial={{ height: 0 }} animate={{ height: 40 }} exit={{ height: 0 }} className="shrink-0 overflow-hidden">
                        <GammaAnnouncement
                            onClose={() => setShowAnnouncement(false)}
                            action={
                                <button type="button" onClick={() => setUpgradeOpen(true)} className="relative shrink-0 rounded-full bg-[rgba(4,6,12,0.8)] px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105">
                                    立即升级 →
                                </button>
                            }
                        >
                            ✦ 品牌焕新：正式更名「布鲁伽马 BlueGamma」，12 个设计专业全面上线
                        </GammaAnnouncement>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <div className="flex min-h-0 flex-1">
                <GammaRail items={GAMMA_RAIL_ITEMS} activeKey={activeNav} onSelect={handleNav} />
                <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 12)}>
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-40 left-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                    {/* 顶栏：贴在顶部时通栏；往下滚后收成居中胶囊并保持吸顶 */}
                    <div className={cn("sticky top-0 z-30 transition-[padding] duration-300", scrolled ? "px-6 pt-3" : "px-0 pt-0")}>
                        <header
                            className={cn(
                                "gm-glass gm-glass-sheen flex items-center gap-3 transition-[max-width,height,border-radius,padding,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
                                scrolled ? "mx-auto h-14 max-w-[880px] rounded-full px-4 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.6)]" : "h-16 w-full max-w-none rounded-none px-6",
                            )}
                        >
                            <GammaSearchTrigger onOpen={openCommand} />
                            <div className="ml-auto flex items-center gap-2">
                                <GammaPointsPill points={demo.points} />
                                <GammaButton size="sm" variant={demo.checkedIn ? "ghost" : "soft"} icon={<Zap className="size-3.5" />} onClick={demo.checkIn}>
                                    {demo.checkedIn ? "今日已签到" : "签到 +50"}
                                </GammaButton>
                                <GammaIconButton label="通知" onClick={() => notice("暂无新通知")}>
                                    <Bell />
                                </GammaIconButton>
                                <GammaFontSwitcher />
                                <GammaThemeToggle />
                                <GammaAccountMenu onNotice={notice} />
                            </div>
                        </header>
                    </div>

                    <div className="relative mx-auto flex max-w-[1360px] flex-col gap-10 px-8 pt-5 pb-10">
                        <div className="flex flex-col gap-3">
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="flex items-end justify-between gap-4">
                                <div>
                                    <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--gm-accent)] uppercase">BlueGamma Studio</p>
                                    <h1 className="mt-1.5 text-[28px] leading-tight font-semibold" suppressHydrationWarning>
                                        {hello}，今天想创作点什么？
                                    </h1>
                                </div>
                                <p className="hidden text-xs text-[var(--gm-text-3)] lg:block">
                                    本周已生成 <span className="font-mono text-[var(--gm-text)]">1,284</span> 件作品 · 覆盖 <span className="font-mono text-[var(--gm-text)]">12</span> 个专业
                                </p>
                            </motion.div>
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
                                    cover="/style-thumbs/comic.jpg"
                                    onClick={() => notice("作品集排版即将上线")}
                                />
                            </div>
                        </div>

                        <div ref={composerRef} className="scroll-mt-24">
                            <GammaComposer subject={subject} onSubjectChange={setSubjectSlug} points={demo.points} onSubmit={handleSubmit} initialPrompt={remix} />
                        </div>

                        <GammaRecentProjects onOpen={(title) => notice(`打开「${title}」（演示）`)} />

                        <GammaTemplateRail onUse={handleTemplate} />

                        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                            <GammaFeaturedReel onPlay={() => setPreview({ src: "/style-thumbs/noir.jpg", title: "《雾港》· 毕业设计短片" })} />
                            <GammaCreatorBoard onFollow={(name) => toast("success", `已关注 ${name}`)} />
                        </div>

                        {/* 作品展示：替换原「专业方向」。搜索已经在顶栏，这里不再重复搜索框 */}
                        <GammaPlaza compact hideSearch onPreview={setPreview} onRemix={handleRemix} onNotice={notice} />

                        {demo.tasks.length ? (
                            <div ref={tasksRef} className="scroll-mt-20">
                                <GammaSection id="tasks" title={`我的生成 · ${demo.tasks.length}`} description="生成完成后可预览与下载，失败会自动退回积分">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        {demo.tasks.map((task) => (
                                            <GammaTaskCard
                                                key={task.key}
                                                status={task.status}
                                                title={task.title}
                                                meta={task.meta}
                                                cover={task.cover}
                                                progress={task.progress}
                                                etaSeconds={task.status === "running" ? Math.max(1, Math.ceil((100 - task.progress) * SECONDS_PER_PERCENT)) : undefined}
                                                onOpen={() => setPreview({ src: task.cover, title: task.title })}
                                                onDownload={download}
                                                onRetry={() => demo.retry(task)}
                                            />
                                        ))}
                                    </div>
                                </GammaSection>
                            </div>
                        ) : null}

                        <GammaFooter onNavigate={(label) => notice(`「${label}」页面设计中`)} />
                    </div>
                </main>
            </div>

            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
            <GammaCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} />
            <GammaLightbox
                src={preview?.src ?? null}
                title={preview?.title}
                onClose={() => setPreview(null)}
                actions={
                    <GammaButton size="sm" variant="glass" icon={<Download className="size-4" />} onClick={download}>
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
