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
            className="gm-on-dark relative isolate h-[176px] overflow-hidden rounded-[var(--gm-radius-xl)] bg-[#04060c] ring-1 ring-[var(--gm-border)]"
        >
            <AnimatePresence initial={false}>
                <motion.div key={slide.key} className="absolute inset-0 -z-[1]" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                    <img src={slide.cover} alt="" aria-hidden className="absolute inset-y-0 right-0 h-full w-[68%] object-cover [mask-image:linear-gradient(90deg,transparent,#000_45%)]" />
                    <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,6,12,0.92)_0%,rgba(4,6,12,0.75)_42%,transparent_72%)]" />
                    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_100%,var(--gm-banner-glow),transparent_55%)]" />
                </motion.div>
            </AnimatePresence>
            <div className="flex h-full max-w-[54%] flex-col justify-center px-8 pb-6" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={slide.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="flex flex-col gap-2">
                        <span className="text-[11px] font-medium tracking-[0.18em] text-[var(--gm-cyan)] uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">{slide.eyebrow}</span>
                        <h2 className="text-[22px] leading-tight font-semibold text-balance text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">{slide.title}</h2>
                        <p className="text-[13px] text-white/75 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">{slide.description}</p>
                        {slide.action ? <div className="mt-1">{slide.action}</div> : null}
                    </motion.div>
                </AnimatePresence>
            </div>
            <div className="absolute bottom-4 left-8 flex gap-2">
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
export function GammaPromoCard({ title, description, cover, onClick }: { title: ReactNode; description: string; cover: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative isolate flex h-[176px] w-full overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface-light)] text-left text-[var(--gm-inverse-text)] ring-1 ring-[var(--gm-border-strong)] transition-shadow hover:shadow-[var(--gm-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材；裁切区更宽、锚点偏右上，避免色块缩在左下角导致右上角露出大片底色 */}
            <img src={cover} alt="" aria-hidden className="absolute inset-y-0 right-0 -z-[1] h-full w-[62%] object-cover object-[75%_20%] transition-transform duration-700 [mask-image:linear-gradient(90deg,transparent,#000_32%)] group-hover:scale-105" />
            <div className="flex flex-col justify-center gap-2 px-7">
                <h3 className="text-xl leading-snug font-semibold">{title}</h3>
                <p className="text-[13px] text-[var(--gm-inverse-text-2)]">{description}</p>
                <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--gm-blue)] px-3 py-1 text-xs font-medium text-white transition-transform duration-300 group-hover:translate-x-1">立即了解 →</span>
            </div>
        </button>
    );
}
