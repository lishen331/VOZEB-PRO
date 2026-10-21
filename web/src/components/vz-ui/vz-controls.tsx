"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/** 分段选择器：图片/视频模式、比例、时长等 */
export function VzSegmented<T extends string>({
    options,
    value,
    onChange,
    label,
    size = "md",
    className,
}: {
    options: readonly { value: T; label: ReactNode; icon?: ReactNode }[];
    value: T;
    onChange: (value: T) => void;
    label: string;
    size?: "sm" | "md";
    className?: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center gap-0.5 rounded-[var(--vz-radius)] bg-[var(--vz-surface)] p-1 ring-1 ring-[var(--vz-border)]", className)}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-[var(--vz-radius-sm)] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]",
                            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]",
                            active ? "bg-[var(--vz-surface-3)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-[var(--vz-text-3)] hover:text-[var(--vz-text)]",
                        )}
                    >
                        {option.icon}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

/** 标签 Chip：风格、筛选条件 */
export function VzChip({ active = false, children, onClick, icon }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]",
                active ? "bg-[var(--vz-brand-soft)] text-[#d8ccff] ring-1 ring-[rgba(139,92,246,0.55)]" : "bg-white/[0.04] text-[var(--vz-text-2)] ring-1 ring-[var(--vz-border)] hover:bg-white/[0.08] hover:text-[var(--vz-text)]",
            )}
        >
            {icon}
            {children}
        </button>
    );
}

export function VzSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]",
                checked ? "bg-[image:var(--vz-gradient)]" : "bg-[var(--vz-surface-3)]",
            )}
        >
            <span className={cn("size-[18px] rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[20px]" : "translate-x-[2px]")} />
        </button>
    );
}

export function VzSlider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
    const id = useId();
    const fill = `${((value - min) / (max - min)) * 100}%`;
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[13px]">
                <label htmlFor={id} className="text-[var(--vz-text-2)]">
                    {label}
                </label>
                <span className="tabular-nums text-[var(--vz-text)]">
                    {value}
                    {unit}
                </span>
            </div>
            <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="vz-range w-full" style={{ ["--vz-range-fill" as string]: fill }} />
        </div>
    );
}

export function VzInput({ label, hint, icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; icon?: ReactNode }) {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            {label ? (
                <label htmlFor={id} className="text-[13px] text-[var(--vz-text-2)]">
                    {label}
                </label>
            ) : null}
            <div className="group flex h-10 items-center gap-2 rounded-[var(--vz-radius)] bg-[var(--vz-surface)] px-3 ring-1 ring-[var(--vz-border)] transition-shadow focus-within:ring-[var(--vz-brand)] focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.15)] hover:ring-[var(--vz-border-strong)]">
                {icon ? <span className="text-[var(--vz-text-3)] group-focus-within:text-[#c4b5fd] [&_svg]:size-4">{icon}</span> : null}
                <input id={id} {...props} className={cn("h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--vz-text)] outline-none placeholder:text-[var(--vz-text-3)]", className)} />
            </div>
            {hint ? <p className="text-xs text-[var(--vz-text-3)]">{hint}</p> : null}
        </div>
    );
}
