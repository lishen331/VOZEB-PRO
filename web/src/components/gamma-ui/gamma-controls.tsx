"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 480, damping: 36 } as const;

/** 分段 / 标签切换：选中底块在选项间滑动（layoutId） */
export function GammaTabs<T extends string>({
    options,
    value,
    onChange,
    label,
    size = "md",
    variant = "pill",
    className,
}: {
    options: readonly { value: T; label: ReactNode; icon?: ReactNode }[];
    value: T;
    onChange: (value: T) => void;
    label: string;
    size?: "sm" | "md";
    variant?: "pill" | "underline";
    className?: string;
}) {
    const groupId = useId();
    const reduce = useReducedMotion();
    const isPill = variant === "pill";
    return (
        <div role="tablist" aria-label={label} className={cn("inline-flex items-center", isPill ? "gap-0.5 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] p-1 ring-1 ring-[var(--gm-border)]" : "gap-6", className)}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                            isPill ? cn("rounded-[var(--gm-radius-sm)]", size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-4 text-[13px]") : "h-9 text-sm",
                            active ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:text-[var(--gm-text-2)]",
                        )}
                    >
                        {active ? (
                            <motion.span
                                layoutId={`${groupId}-indicator`}
                                transition={reduce ? { duration: 0 } : SPRING}
                                className={cn(
                                    "absolute",
                                    isPill ? "inset-0 rounded-[var(--gm-radius-sm)] bg-[var(--gm-surface-3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--gm-cyan)] shadow-[var(--gm-glow-cyan)]",
                                )}
                            />
                        ) : null}
                        <span className="relative z-[1] inline-flex items-center gap-1.5">
                            {option.icon}
                            {option.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** 胶囊筛选的样式；需要用 <Link> 做筛选（例如 URL 驱动的列表）时直接套这个类名 */
export function gammaChipClass(active: boolean) {
    return cn(
        // 不换行、不被挤压：在横向滚动的筛选条里，窄屏下也保持一个胶囊一行
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
        active ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]" : "bg-[var(--gm-wash)] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]",
    );
}

export function GammaChip({ active = false, children, onClick, icon, count }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: ReactNode; count?: number }) {
    return (
        <motion.button type="button" aria-pressed={active} onClick={onClick} whileTap={{ scale: 0.95 }} className={gammaChipClass(active)}>
            {icon}
            {children}
            {count !== undefined ? <span className="text-[11px] tabular-nums opacity-60">{count}</span> : null}
        </motion.button>
    );
}

export function GammaSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    const reduce = useReducedMotion();
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-bg)]",
                checked ? "justify-end bg-[var(--gm-blue)] shadow-[var(--gm-glow-blue)]" : "justify-start bg-[var(--gm-surface-3)]",
            )}
        >
            <motion.span layout transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 32 }} className={cn("size-5 rounded-full bg-white shadow", checked && "shadow-[0_0_10px_rgba(40,235,250,0.7)]")} />
        </button>
    );
}

export function GammaCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    const reduce = useReducedMotion();
    return (
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[var(--gm-text-2)] select-none hover:text-[var(--gm-text)]">
            <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span
                className={cn(
                    "grid size-[18px] place-items-center rounded-[5px] ring-1 transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--gm-accent)]",
                    checked ? "bg-[var(--gm-blue)] ring-[var(--gm-blue)]" : "bg-transparent ring-[var(--gm-border-strong)]",
                )}
            >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }} transition={reduce ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }} />
                </svg>
            </span>
            {label}
        </label>
    );
}

export function GammaSlider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
    const id = useId();
    const fill = `${((value - min) / (max - min)) * 100}%`;
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[13px]">
                <label htmlFor={id} className="text-[var(--gm-text-2)]">
                    {label}
                </label>
                <span className="rounded-md bg-[var(--gm-surface-3)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--gm-text)]">
                    {value}
                    {unit}
                </span>
            </div>
            <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="gm-range w-full" style={{ ["--gm-range-fill" as string]: fill }} />
        </div>
    );
}

export function GammaInput({ label, hint, error, icon, suffix, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string; icon?: ReactNode; suffix?: ReactNode }) {
    const id = useId();
    const describedBy = error || hint ? `${id}-desc` : undefined;
    return (
        <div className="flex flex-col gap-1.5">
            {label ? (
                <label htmlFor={id} className="text-[13px] text-[var(--gm-text-2)]">
                    {label}
                </label>
            ) : null}
            <div
                className={cn(
                    "group flex h-10 items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 ring-1 transition-shadow duration-200 focus-within:shadow-[0_0_0_4px_var(--gm-accent-soft)]",
                    error ? "ring-[var(--gm-danger)]" : "ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)] focus-within:ring-[var(--gm-accent)]",
                )}
            >
                {icon ? <span className="text-[var(--gm-text-3)] transition-colors group-focus-within:text-[var(--gm-accent)] [&_svg]:size-4">{icon}</span> : null}
                <input
                    id={id}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    {...props}
                    className={cn("h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]", className)}
                />
                {suffix}
            </div>
            {error || hint ? (
                <p id={describedBy} className={cn("text-xs", error ? "text-[var(--gm-danger)]" : "text-[var(--gm-text-3)]")}>
                    {error || hint}
                </p>
            ) : null}
        </div>
    );
}

export function GammaBadge({ tone = "blue", children }: { tone?: "blue" | "cyan" | "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
    const toneClass = {
        blue: "bg-[var(--gm-blue-soft)] text-[var(--gm-blue-text)]",
        cyan: "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]",
        success: "bg-[rgba(35,209,139,0.14)] text-[var(--gm-success)]",
        warning: "bg-[rgba(255,181,71,0.14)] text-[var(--gm-warning)]",
        danger: "bg-[rgba(255,77,109,0.14)] text-[var(--gm-danger)]",
        neutral: "bg-[var(--gm-wash)] text-[var(--gm-text-2)]",
    }[tone];
    return <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", toneClass)}>{children}</span>;
}
