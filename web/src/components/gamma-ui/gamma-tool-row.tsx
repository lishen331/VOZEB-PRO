"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

import { GammaCardCorners } from "@/components/gamma-ui/gamma-cards";
import { SUBJECT_ACCENT, type GammaSubject } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

const SCROLL_STEP = 480;
const EDGE_EPSILON = 4;

/**
 * 可灵首页「工具行」的布鲁伽马版：
 *   - 左侧一张宽主卡（对应可灵 Omni），放推荐专业 + 立即体验
 *   - 右侧一排等宽专业卡（对应可灵 图片生成/视频生成/…），图标 + 名称 + 右箭头，可选角标
 * hover 时箭头前移、边角亮起；超出宽度可横向滚动，两端出现翻页按钮。
 */
export function GammaToolRow({ featured, subjects, onPick }: { featured: GammaSubject; subjects: readonly GammaSubject[]; onPick: (slug: string) => void }) {
    const reduce = useReducedMotion();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });

    useEffect(() => {
        const node = scrollerRef.current;
        if (!node) return;
        const update = () => setEdges({ start: node.scrollLeft > EDGE_EPSILON, end: node.scrollLeft + node.clientWidth < node.scrollWidth - EDGE_EPSILON });
        update();
        node.addEventListener("scroll", update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => {
            node.removeEventListener("scroll", update);
            observer.disconnect();
        };
    }, []);

    const scrollByStep = (direction: 1 | -1) => scrollerRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: reduce ? "auto" : "smooth" });
    const FeaturedIcon = featured.icon;

    return (
        <div className="relative">
            {/* 可滚动的一侧渐隐，避免末张卡被箭头按钮压住、看起来像被硬裁 */}
            <div
                ref={scrollerRef}
                className="hide-scrollbar flex gap-3 overflow-x-auto pb-1"
                role="list"
                aria-label="专业方向"
                style={{ maskImage: `linear-gradient(90deg, ${edges.start ? "transparent, #000 48px" : "#000"}, ${edges.end ? "#000 calc(100% - 72px), transparent" : "#000"})` }}
            >
                {/* 主卡：对应可灵 Omni 多模态创作工具。整卡可点，「立即体验」只是视觉按钮，避免按钮嵌套 */}
                <div role="listitem" className="shrink-0">
                    <button
                        type="button"
                        onClick={() => onPick(featured.slug)}
                        className="group gm-on-dark relative isolate flex h-[88px] w-[360px] items-center gap-4 overflow-hidden rounded-[var(--gm-radius-lg)] bg-[#061226] px-5 text-left ring-1 ring-[var(--gm-accent-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                    >
                        {/* 背景层单独用 clip-path 裁圆角：带 blur / 动画的子层会被提升为合成层，Chromium 下会逃出 overflow-hidden 的圆角，四角漏出方块 */}
                        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 [clip-path:inset(0_round_var(--gm-radius-lg))]">
                            <span className="absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_100%,rgba(0,80,245,0.55),transparent_60%),radial-gradient(80%_120%_at_100%_0%,rgba(40,235,250,0.25),transparent_60%)]" />
                            <span className="gm-aurora absolute -top-10 -left-6 size-32 rounded-full bg-[var(--gm-cyan)] opacity-20 blur-3xl" />
                        </span>
                        <GammaCardCorners />
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[image:var(--gm-gradient)] text-white shadow-[var(--gm-glow-blue)] transition-transform duration-500 group-hover:rotate-[20deg]">
                            <FeaturedIcon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold whitespace-nowrap text-white">{featured.name} · 多模态创作</span>
                            <span className="mt-1 block truncate text-xs text-white/65">{featured.tagline}</span>
                        </span>
                        <span className="shrink-0 rounded-[var(--gm-radius-sm)] bg-[var(--gm-cyan)] px-3 py-1.5 text-[13px] font-semibold text-[var(--gm-text-on-cyan)] shadow-[var(--gm-glow-cyan)] transition-transform duration-200 group-hover:scale-105">
                            立即体验
                        </span>
                    </button>
                </div>

                {subjects.map((subject) => {
                    const accent = SUBJECT_ACCENT[subject.accent];
                    const Icon = subject.icon;
                    return (
                        <div role="listitem" key={subject.slug} className="min-w-[164px] flex-1 shrink-0">
                            <motion.button
                                type="button"
                                onClick={() => onPick(subject.slug)}
                                whileTap={reduce ? undefined : { scale: 0.97 }}
                                className="group relative flex h-[88px] w-full min-w-[164px] flex-col justify-between overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-4 text-left ring-1 ring-[var(--gm-border)] transition-[box-shadow,background-color] duration-300 hover:bg-[var(--gm-surface-2)] hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                            >
                                {/* hover 光斑带 blur，同样要用 clip-path 裁圆角，否则右下角漏方块 */}
                                <span aria-hidden className="pointer-events-none absolute inset-0 [clip-path:inset(0_round_var(--gm-radius-lg))]">
                                    <span className="absolute -right-8 -bottom-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" style={{ background: accent.glow }} />
                                </span>
                                <GammaCardCorners />
                                {subject.badge ? (
                                    <span
                                        className={cn(
                                            "absolute top-0 right-3 rounded-b-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                                            subject.badge === "hot" ? "bg-[var(--gm-cyan)] text-[var(--gm-text-on-cyan)]" : "bg-[var(--gm-blue)] text-white",
                                        )}
                                    >
                                        {subject.badge}
                                    </span>
                                ) : null}
                                <span className={cn("relative grid size-8 place-items-center rounded-lg ring-1 ring-[var(--gm-border-strong)] transition-transform duration-300 group-hover:scale-110", accent.chip, accent.text)}>
                                    <Icon className="size-[17px]" strokeWidth={1.8} />
                                </span>
                                <span className="relative flex items-center justify-between gap-2">
                                    <span className="truncate text-[14px] font-semibold text-[var(--gm-text)]">{subject.name}</span>
                                    <ArrowRight className="size-4 shrink-0 text-[var(--gm-text-3)] transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-[var(--gm-accent)]" />
                                </span>
                            </motion.button>
                        </div>
                    );
                })}
            </div>
            {edges.start ? (
                <button
                    type="button"
                    aria-label="向左滚动专业"
                    onClick={() => scrollByStep(-1)}
                    className="gm-glass absolute top-1/2 -left-4 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] shadow-[var(--gm-shadow)] transition-transform hover:scale-105"
                >
                    <ChevronLeft className="size-4" />
                </button>
            ) : null}
            {edges.end ? (
                <button
                    type="button"
                    aria-label="向右滚动专业"
                    onClick={() => scrollByStep(1)}
                    className="gm-glass absolute top-1/2 -right-4 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] shadow-[var(--gm-shadow)] transition-transform hover:scale-105"
                >
                    <ChevronRight className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
