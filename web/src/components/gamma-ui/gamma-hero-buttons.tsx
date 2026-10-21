"use client";

import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";

import "@/components/gamma-ui/gamma-effects.css";
import { useGammaBurst, type GammaBurstKind } from "@/components/gamma-ui/gamma-burst";
import { cn } from "@/lib/utils";

/*
 * 醒目的特殊点击位：一个页面最多放一两个，用在「立即生成」「开通会员」「开始第一步」这类关键动作上。
 *   GammaBeamButton    流光描边（锥形光绕边旋转）
 *   GammaAuroraButton  极光流动底 + 点击粒子
 *   GammaMagneticButton 磁吸：靠近时被鼠标吸过去
 *   GammaHoldButton    长按确认：按住填满一圈才触发（付费 / 删除）
 *   GammaPingDot       呼吸光环：引导用户点这里
 */

const PRESS = { type: "spring", stiffness: 520, damping: 26 } as const;

export function GammaBeamButton({ children, icon, onClick, className }: { children: ReactNode; icon?: ReactNode; onClick?: () => void; className?: string }) {
    const reduce = useReducedMotion();
    return (
        <motion.button
            type="button"
            onClick={onClick}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={PRESS}
            className={cn(
                "gm-beam group inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-[var(--gm-text)] shadow-[0_0_24px_-6px_rgba(40,235,250,0.55)] transition-shadow hover:shadow-[0_0_36px_-4px_rgba(40,235,250,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                className,
            )}
        >
            {icon ? <span className="text-[var(--gm-accent)] transition-transform duration-300 group-hover:rotate-12">{icon}</span> : null}
            {children}
        </motion.button>
    );
}

export function GammaAuroraButton({ children, icon, onClick, burst = "sparkle", className }: { children: ReactNode; icon?: ReactNode; onClick?: () => void; burst?: GammaBurstKind; className?: string }) {
    const reduce = useReducedMotion();
    const fire = useGammaBurst();
    return (
        <motion.button
            type="button"
            onClick={(event) => {
                fire(event, burst);
                onClick?.();
            }}
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { scale: 0.95 }}
            transition={PRESS}
            className={cn(
                "gm-aurora-btn relative inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(0,80,245,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                className,
            )}
        >
            {/* 顶部高光，让渐变有体积 */}
            <span aria-hidden className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-b-full bg-gradient-to-b from-white/30 to-transparent" />
            {icon}
            <span className="relative">{children}</span>
        </motion.button>
    );
}

/** 磁吸按钮：鼠标在按钮周围 strength 范围内时，按钮朝鼠标偏移 */
export function GammaMagneticButton({ children, onClick, strength = 0.35, className }: { children: ReactNode; onClick?: () => void; strength?: number; className?: string }) {
    const reduce = useReducedMotion();
    const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 });
    const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 });
    const handleMove = (event: PointerEvent<HTMLDivElement>) => {
        if (reduce) return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * strength);
        y.set((event.clientY - rect.top - rect.height / 2) * strength);
    };
    return (
        // 外圈是感应区，比按钮大一圈
        <div
            className="-m-6 inline-flex p-6"
            onPointerMove={handleMove}
            onPointerLeave={() => {
                x.set(0);
                y.set(0);
            }}
        >
            <motion.button
                type="button"
                onClick={onClick}
                style={{ x, y }}
                whileTap={reduce ? undefined : { scale: 0.94 }}
                className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-full bg-[var(--gm-text)] px-6 text-sm font-semibold text-[var(--gm-bg)] shadow-[var(--gm-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                    className,
                )}
            >
                {children}
            </motion.button>
        </div>
    );
}

const HOLD_MS = 1100;
const RING_R = 19;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * 长按确认：按住进度环走满才触发；中途松手进度回退。键盘按住空格 / 回车同样有效。
 * 适合「删除作品」「花 200 积分生成 4K」这种不该误触的动作。
 */
export function GammaHoldButton({ children, onConfirm, tone = "danger", className }: { children: ReactNode; onConfirm: () => void; tone?: "danger" | "accent"; className?: string }) {
    const [progress, setProgress] = useState(0);
    const [done, setDone] = useState(false);
    const frame = useRef<number | null>(null);
    const start = useRef(0);
    const fire = useGammaBurst();
    const buttonRef = useRef<HTMLButtonElement>(null);

    const stop = () => {
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = null;
        if (!done) setProgress(0);
    };
    const begin = () => {
        if (done || frame.current) return;
        start.current = performance.now();
        const tick = (now: number) => {
            const value = Math.min(1, (now - start.current) / HOLD_MS);
            setProgress(value);
            if (value >= 1) {
                frame.current = null;
                setDone(true);
                if (buttonRef.current) fire({ currentTarget: buttonRef.current, clientX: 0, clientY: 0 }, "shock");
                onConfirm();
                window.setTimeout(() => {
                    setDone(false);
                    setProgress(0);
                }, 1400);
                return;
            }
            frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
    };
    useEffect(
        () => () => {
            if (frame.current) cancelAnimationFrame(frame.current);
        },
        [],
    );

    const color = tone === "danger" ? "var(--gm-danger)" : "var(--gm-accent)";
    return (
        <button
            ref={buttonRef}
            type="button"
            onPointerDown={begin}
            onPointerUp={stop}
            onPointerLeave={stop}
            onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                    event.preventDefault();
                    begin();
                }
            }}
            onKeyUp={stop}
            aria-label={`${typeof children === "string" ? children : "确认"}（长按）`}
            className={cn(
                "relative inline-flex h-11 select-none items-center gap-2.5 rounded-full bg-[var(--gm-wash)] pr-5 pl-1 text-sm font-medium ring-1 ring-[var(--gm-border-strong)] transition-[transform,background-color] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                done && "bg-[var(--gm-accent-soft)]",
                className,
            )}
        >
            <svg width="40" height="40" viewBox="0 0 44 44" className="-rotate-90" aria-hidden>
                <circle cx="22" cy="22" r={RING_R} fill="none" stroke="var(--gm-border-strong)" strokeWidth="3" />
                <circle cx="22" cy="22" r={RING_R} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={RING_LEN} strokeDashoffset={RING_LEN * (1 - progress)} className="gm-hold-ring" />
            </svg>
            <span className="tabular-nums">{done ? "已确认" : progress > 0 ? `继续按住 ${Math.ceil((1 - progress) * (HOLD_MS / 1000) * 10) / 10}s` : children}</span>
        </button>
    );
}

/** 呼吸光环：包住任意元素，引导用户点这里（新功能、首次使用） */
export function GammaPingDot({ children, active = true, className }: { children: ReactNode; active?: boolean; className?: string }) {
    return <span className={cn("relative inline-flex rounded-full", active && "gm-ping", className)}>{children}</span>;
}
