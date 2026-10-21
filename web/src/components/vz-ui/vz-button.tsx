import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type VzButtonVariant = "primary" | "hot" | "secondary" | "outline" | "ghost" | "danger";
type VzButtonSize = "sm" | "md" | "lg";

const variantClass: Record<VzButtonVariant, string> = {
    primary: "text-white bg-[image:var(--vz-gradient)] shadow-[var(--vz-glow)] hover:brightness-110 active:brightness-95",
    hot: "text-white bg-[image:var(--vz-gradient-hot)] shadow-[0_8px_28px_rgba(236,72,153,0.32)] hover:brightness-110 active:brightness-95",
    secondary: "text-[var(--vz-text)] bg-[var(--vz-surface-3)] hover:bg-[#2c2c40] active:bg-[#25253a]",
    outline: "text-[var(--vz-text)] border border-[var(--vz-border-strong)] bg-transparent hover:border-[var(--vz-brand)] hover:bg-[var(--vz-brand-soft)]",
    ghost: "text-[var(--vz-text-2)] bg-transparent hover:text-[var(--vz-text)] hover:bg-white/[0.06]",
    danger: "text-white bg-[#e11d48] hover:bg-[#f43f5e]",
};

const sizeClass: Record<VzButtonSize, string> = {
    sm: "h-8 gap-1.5 rounded-[var(--vz-radius-sm)] px-3 text-[13px]",
    md: "h-10 gap-2 rounded-[var(--vz-radius)] px-4 text-sm",
    lg: "h-12 gap-2 rounded-[var(--vz-radius)] px-6 text-[15px]",
};

export interface VzButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: VzButtonVariant;
    size?: VzButtonSize;
    loading?: boolean;
    icon?: ReactNode;
    /** 右侧附加信息，例如生成按钮上的积分消耗 */
    trailing?: ReactNode;
}

export function VzButton({ variant = "primary", size = "md", loading = false, icon, trailing, className, children, disabled, ...props }: VzButtonProps) {
    return (
        <button
            type="button"
            {...props}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                "inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-[filter,background-color,border-color,color,transform] duration-150 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vz-bg)]",
                "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
                variantClass[variant],
                sizeClass[size],
                className,
            )}
        >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
            {children}
            {trailing ? <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-xs font-normal">{trailing}</span> : null}
        </button>
    );
}

export interface VzIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    active?: boolean;
    size?: "sm" | "md";
}

export function VzIconButton({ label, active = false, size = "md", className, children, ...props }: VzIconButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={active || undefined}
            {...props}
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-[var(--vz-radius-sm)] text-[var(--vz-text-2)] transition-colors duration-150",
                "hover:bg-white/[0.07] hover:text-[var(--vz-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]",
                "disabled:pointer-events-none disabled:opacity-40",
                active && "bg-[var(--vz-brand-soft)] text-[#c4b5fd]",
                size === "sm" ? "size-7 [&_svg]:size-4" : "size-9 [&_svg]:size-[18px]",
                className,
            )}
        >
            {children}
        </button>
    );
}
