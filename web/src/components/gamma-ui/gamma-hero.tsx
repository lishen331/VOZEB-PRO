"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export interface GammaBannerSlide {
    key: string;
    eyebrow: string;
    title: ReactNode;
    description: string;
    cover: string;
    action?: ReactNode;
}

const SLIDE_MS = 5000;

/** 首页主轮播（对标可灵顶部大 Banner）：自动播放，指示条按时长填充，hover 暂停 */
export function GammaBannerCarousel({ slides }: { slides: readonly GammaBannerSlide[] }) {
    const reduce = useReducedMotion();
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused || reduce || slides.length < 2) return;
        const timer = window.setTimeout(() => setIndex((value) => (value + 1) % slides.length), SLIDE_MS);
        return () => window.clearTimeout(timer);
    }, [index, paused, reduce, slides.length]);

    const slide = slides[index];

    return (
        <div
            role="region"
            aria-roledescription="carousel"
            aria-label="活动推荐"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            className="gm-on-dark gm-glass-refract @container relative isolate h-[176px] overflow-hidden rounded-[var(--gm-radius-xl)] bg-[#04060c]/70 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        >
            {/* 背景层单独用 clip-path 裁圆角：切换时的 scale 动画与 mask 会让子层逃出 overflow-hidden 的圆角 */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1] [clip-path:inset(0_round_var(--gm-radius-xl))]">
                <AnimatePresence initial={false}>
                    <motion.div key={slide.key} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                        <img src={slide.cover} alt="" className="absolute inset-y-0 right-0 h-full w-[68%] object-cover [mask-image:linear-gradient(90deg,transparent,#000_45%)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,6,12,0.92)_0%,rgba(4,6,12,0.75)_42%,transparent_72%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_100%,var(--gm-banner-glow),transparent_55%)]" />
                    </motion.div>
                </AnimatePresence>
            </div>
            {/* 窄屏时文案区放宽到 64%，避免标题被挤成三行 */}
            <div className="flex h-full max-w-[64%] flex-col justify-center px-5 pb-6 @min-[560px]:max-w-[54%] @min-[560px]:px-8" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={slide.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="flex flex-col gap-2">
                        <span className="truncate text-[11px] font-medium tracking-[0.18em] text-[var(--gm-cyan)] uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">{slide.eyebrow}</span>
                        <h2 className="text-[18px] leading-tight @min-[560px]:text-[22px] font-semibold text-balance text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">{slide.title}</h2>
                        {/* 窄屏只留一行描述、更窄时隐藏，保证 176px 高度内眉题和按钮都不被挤出 */}
                        <p className="hidden truncate text-[13px] text-white/75 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)] @min-[420px]:block @min-[560px]:whitespace-normal">{slide.description}</p>
                        {slide.action ? <div className="mt-1">{slide.action}</div> : null}
                    </motion.div>
                </AnimatePresence>
            </div>
            <div className="absolute bottom-4 left-5 flex gap-2 @min-[560px]:left-8">
                {slides.map((item, itemIndex) => {
                    const current = itemIndex === index;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            aria-label={`第 ${itemIndex + 1} 张`}
                            aria-current={current}
                            onClick={() => setIndex(itemIndex)}
                            className={cn("relative h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.25)] transition-[width] duration-300 hover:bg-[rgba(255,255,255,0.45)]", current ? "w-12" : "w-8")}
                        >
                            {current ? (
                                <span key={`${item.key}-${String(paused)}`} className={cn("absolute inset-0 rounded-full bg-[var(--gm-cyan)]", !paused && !reduce && "gm-fill")} style={{ ["--gm-fill-duration" as string]: `${SLIDE_MS}ms` }} />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** 轮播旁的浅色推广卡（对标可灵右侧白底卡） */
export function GammaPromoCard({ title, description, cover, onClick }: { title: ReactNode; description: string; cover?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group gm-glass gm-glass-sheen gm-glass-refract @container relative isolate flex h-[176px] w-full min-w-0 overflow-hidden rounded-[var(--gm-radius-xl)] text-left text-[var(--gm-text)] transition-shadow hover:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            {/* 背景层单独用 clip-path 裁圆角：带 mask / transform 的子层会被提升为合成层，Chromium 下会逃出 overflow-hidden 的圆角，右侧两角漏出方块 */}
            <span aria-hidden className="pointer-events-none absolute inset-0 -z-[1] [clip-path:inset(0_round_var(--gm-radius-xl))]">
                {cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材；裁切区更宽、锚点偏右上，避免色块缩在左下角导致右上角露出大片底色 */
                    <img src={cover} alt="" className="absolute inset-y-0 right-0 h-full w-[62%] object-cover object-[75%_20%] transition-transform duration-700 [mask-image:linear-gradient(90deg,transparent,#000_32%)] group-hover:scale-105" />
                ) : (
                    /* 无封面时用品牌蓝青光斑，避免示意图的紫粉色跑调 */
                    <span className="absolute inset-y-0 right-0 w-[62%] bg-[radial-gradient(70%_90%_at_85%_15%,rgba(40,235,250,0.55),transparent_65%),radial-gradient(80%_100%_at_60%_100%,rgba(0,80,245,0.7),transparent_70%)] transition-transform duration-700 [mask-image:linear-gradient(90deg,transparent,#000_32%)] group-hover:scale-105" />
                )}
            </span>
            <div className="flex min-w-0 flex-col justify-center gap-2 px-5 @min-[360px]:px-7">
                <h3 className="text-lg leading-snug font-semibold @min-[360px]:text-xl">{title}</h3>
                <p className="text-[13px] text-[var(--gm-text-2)]">{description}</p>
                <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--gm-blue)] px-3 py-1 text-xs font-medium text-white transition-transform duration-300 group-hover:translate-x-1">立即了解 →</span>
            </div>
        </button>
    );
}
