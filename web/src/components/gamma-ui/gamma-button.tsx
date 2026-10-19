"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type GammaButtonVariant = "primary" | "cyan" | "soft" | "outline" | "ghost" | "danger" | "glass";
export type GammaButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<GammaButtonVariant, string> = {
    primary: "text-white bg-[image:var(--gm-gradient)] shadow-[var(--gm-glow-blue)] hover:shadow-[0_10px_34px_rgba(0,80,245,0.6)]",
    cyan: "text-[var(--gm-text-on-cyan)] bg-[var(--gm-cyan)] shadow-[var(--gm-glow-cyan)] hover:bg-[var(--gm-cyan-hover)]",
    soft: "text-[var(--gm-blue-text)] bg-[var(--gm-blue-soft)] ring-1 ring-inset ring-[rgba(0,80,245,0.35)] hover:bg-[rgba(0,80,245,0.26)] [--gm-ripple:rgba(0,80,245,0.3)]",
    outline: "text-[var(--gm-text)] ring-1 ring-inset ring-[var(--gm-border-strong)] hover:ring-[var(--gm-accent)] hover:text-[var(--gm-accent)] [--gm-ripple:var(--gm-accent-soft)]",
    ghost: "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] [--gm-ripple:var(--gm-accent-soft)]",
    danger: "text-white bg-[var(--gm-danger)] hover:brightness-110",
    glass: "text-[var(--gm-text)] bg-[var(--gm-wash-strong)] ring-1 ring-inset ring-[var(--gm-border-strong)] backdrop-blur-xl hover:bg-[var(--gm-wash-heavy)] [--gm-ripple:var(--gm-accent-soft)]",
};

const SIZE: Record<GammaButtonSize, string> = {
    xs: "h-7 gap-1 rounded-[var(--gm-radius-sm)] px-2.5 text-xs",
    sm: "h-8 gap-1.5 rounded-[var(--gm-radius-sm)] px-3 text-[13px]",
    md: "h-10 gap-2 rounded-[var(--gm-radius)] px-4 text-sm",
    lg: "h-12 gap-2 rounded-[var(--gm-radius)] px-6 text-[15px]",
};

const BASE =
    "group relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-medium whitespace-nowrap transition-[box-shadow,background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-bg)] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none";

const RIPPLE_MS = 600;
const CONFIRM_MS = 1200;

export interface GammaButtonProps {
    variant?: GammaButtonVariant;
    size?: GammaButtonSize;
    icon?: ReactNode;
    /** 图标在文字右侧，hover 时向右滑一点 */
    trailingIcon?: ReactNode;
    badge?: ReactNode;
    loading?: boolean;
    /** 点击后短暂显示对勾 */
    confirmOnClick?: boolean;
    /** 持续扫光，用于主行动按钮 */
    shine?: boolean;
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
    onClick?: () => void;
    type?: "button" | "submit";
    ariaLabel?: string;
}

/** 主按钮：按压回弹 + 水波纹 + 可选扫光／点击确认 */
export function GammaButton({ variant = "primary", size = "md", icon, trailingIcon, badge, loading = false, confirmOnClick = false, shine = false, disabled, className, children, onClick, type = "button", ariaLabel }: GammaButtonProps) {
    const reduce = useReducedMotion();
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
    const [confirmed, setConfirmed] = useState(false);
    const seq = useRef(0);
    const timers = useRef<number[]>([]);

    useEffect(() => {
        const pending = timers.current;
        return () => pending.forEach((timer) => window.clearTimeout(timer));
    }, []);

    const handleClick = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            if (!reduce) {
                const rect = event.currentTarget.getBoundingClientRect();
                seq.current += 1;
                const ripple = { id: seq.current, x: event.clientX - rect.left, y: event.clientY - rect.top };
                setRipples((list) => [...list, ripple]);
                timers.current.push(window.setTimeout(() => setRipples((list) => list.filter((item) => item.id !== ripple.id)), RIPPLE_MS));
            }
            if (confirmOnClick) {
                setConfirmed(true);
                timers.current.push(window.setTimeout(() => setConfirmed(false), CONFIRM_MS));
            }
            onClick?.();
        },
        [confirmOnClick, onClick, reduce],
    );

    const leading = loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : confirmed ? <Check className="size-4 animate-in zoom-in" aria-hidden /> : icon;

    return (
        <motion.button
            type={type}
            aria-label={ariaLabel}
            aria-busy={loading || undefined}
            disabled={disabled || loading}
            onClick={handleClick}
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(BASE, VARIANT[variant], SIZE[size], shine && "gm-shine", className)}
        >
            {ripples.map((ripple) => (
                <motion.span
                    key={ripple.id}
                    initial={{ opacity: 0.45, scale: 0 }}
                    animate={{ opacity: 0, scale: 1 }}
                    transition={{ duration: RIPPLE_MS / 1000, ease: "easeOut" }}
                    style={{ left: ripple.x, top: ripple.y }}
                    className="pointer-events-none absolute size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--gm-ripple,rgba(255,255,255,0.35))]"
                />
            ))}
            <span className="relative z-[1] inline-flex items-center gap-[inherit]">
                {leading}
                {children}
                {badge ? <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[rgba(0,0,0,0.22)] px-2 py-0.5 text-xs font-normal">{badge}</span> : null}
                {trailingIcon ? <span className="inline-flex transition-transform duration-200 group-hover:translate-x-1">{trailingIcon}</span> : null}
            </span>
        </motion.button>
    );
}

/** 图标按钮：按压回弹，可带选中态 */
export function GammaIconButton({ label, active = false, size = "md", onClick, children, className, disabled }: { label: string; active?: boolean; size?: "sm" | "md"; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
    const reduce = useReducedMotion();
    return (
        <motion.button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={active || undefined}
            disabled={disabled}
            onClick={onClick}
            whileTap={reduce ? undefined : { scale: 0.88 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-2)] transition-colors duration-200 hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] disabled:pointer-events-none disabled:opacity-40",
                active && "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]",
                size === "sm" ? "size-7 [&_svg]:size-4" : "size-9 [&_svg]:size-[18px]",
                className,
            )}
        >
            {children}
        </motion.button>
    );
}
