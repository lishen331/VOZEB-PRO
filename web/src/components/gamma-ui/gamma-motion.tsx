"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export const GM_EASE = [0.22, 1, 0.36, 1] as const;

const HIDDEN_SHOW = { hidden: {}, show: {} };

/** 列表容器：子项依次入场（滚动进视口触发一次） */
export function GammaStagger({ children, step = 0.05, className }: { children: ReactNode; step?: number; className?: string }) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-10% 0px" });
    return (
        <motion.div ref={ref} className={className} initial="hidden" animate={inView || reduce ? "show" : "hidden"} variants={{ ...HIDDEN_SHOW, show: { transition: { staggerChildren: reduce ? 0 : step } } }}>
            {children}
        </motion.div>
    );
}

/** 配合 GammaStagger 使用的子项 */
export function GammaStaggerItem({ children, className }: { children: ReactNode; className?: string }) {
    const reduce = useReducedMotion();
    return (
        <motion.div className={className} variants={{ hidden: { opacity: 0, y: reduce ? 0 : 16 }, show: { opacity: 1, y: 0 } }} transition={{ duration: reduce ? 0 : 0.42, ease: GM_EASE }}>
            {children}
        </motion.div>
    );
}

/** 页面入场只排前 12 项，之后的直接出现，整段控制在 ~500ms 内 */
export const GM_ENTRY_STAGGER_LIMIT = 12;

/**
 * 只在第一次拿到数据时返回 true；之后筛选、翻页、刷新不再重播入场。
 * 渲染期读 ref 是有意的：内容首次出现那一帧要拿到 true，effect 之后才落标记。
 */
export function useFirstEntry(ready: boolean) {
    const played = useRef(false);
    const shouldAnimate = !played.current;
    useEffect(() => {
        if (ready) played.current = true;
    }, [ready]);
    return shouldAnimate;
}

/** 页面入场单元：淡入上移 8px，按 index 间隔 40ms；超过上限或 animate=false 直接出现 */
export function GammaReveal({ children, index = 0, animate = true, className }: { children: ReactNode; index?: number; animate?: boolean; className?: string }) {
    const play = animate && index < GM_ENTRY_STAGGER_LIMIT;
    return (
        <motion.div className={className} initial={play ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: GM_EASE, delay: play ? index * 0.04 : 0 }}>
            {children}
        </motion.div>
    );
}

/** 数字滚动：值变化时平滑过渡，而不是直接跳 */
export function GammaCountUp({ value, duration = 0.6, className }: { value: number; duration?: number; className?: string }) {
    const reduce = useReducedMotion();
    const [display, setDisplay] = useState(value);
    const previous = useRef(value);

    useEffect(() => {
        if (reduce) {
            setDisplay(value);
            previous.current = value;
            return;
        }
        const controls = animate(previous.current, value, {
            duration,
            ease: GM_EASE,
            onUpdate: (latest) => setDisplay(Math.round(latest)),
            onComplete: () => {
                previous.current = value;
            },
        });
        return () => controls.stop();
    }, [duration, reduce, value]);

    return (
        <span className={cn("tabular-nums", className)} aria-live="polite">
            {display.toLocaleString()}
        </span>
    );
}

/** 环形进度：生成任务用，描边随进度生长 */
export function GammaProgressRing({ value, size = 44, strokeWidth = 3, children }: { value: number; size?: number; strokeWidth?: number; children?: ReactNode }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(100, Math.max(0, value));
    return (
        <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--gm-surface-3)" strokeWidth={strokeWidth} />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--gm-cyan)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={false}
                    animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
                    transition={{ duration: 0.4, ease: GM_EASE }}
                />
            </svg>
            <span className="absolute text-[10px] font-medium tabular-nums">{children}</span>
        </span>
    );
}
