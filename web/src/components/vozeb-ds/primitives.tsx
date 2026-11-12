"use client";

import { Tooltip } from "antd";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

export type VzTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";
export type VzForceState = "hover" | "active" | "focus";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: Ref<HTMLButtonElement>;
    variant?: "primary" | "secondary" | "ghost" | "link" | "danger";
    size?: "sm" | "md" | "lg";
    icon?: LucideIcon;
    loading?: boolean;
    selected?: boolean;
    /** Showcase only: pin a visual state. */
    force?: VzForceState;
};

export function VzButton({ variant = "secondary", size = "md", icon: Icon, loading, selected, force, className, children, disabled, ...rest }: ButtonProps) {
    return (
        <button
            type="button"
            className={cn("vz-btn", `vz-btn--${variant}`, className)}
            data-size={size}
            data-force={force}
            data-selected={selected || undefined}
            aria-busy={loading || undefined}
            aria-pressed={selected}
            disabled={disabled || loading}
            {...rest}
        >
            {loading ? <span className="vz-spinner" aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
            {children}
        </button>
    );
}

type IconButtonProps = Omit<ButtonProps, "children" | "icon"> & { icon: LucideIcon; label: string };

/** Icon-only button. `label` drives both tooltip and aria-label. */
export function VzIconButton({ icon, label, variant = "ghost", className, ...rest }: IconButtonProps) {
    return (
        <Tooltip title={label} mouseEnterDelay={0.25}>
            <VzButton variant={variant} icon={icon} aria-label={label} className={cn("vz-btn--icon", className)} {...rest} />
        </Tooltip>
    );
}

export function VzTag({ tone = "neutral", icon: Icon, dot, pulse, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: VzTone; icon?: LucideIcon; dot?: boolean; pulse?: boolean }) {
    return (
        <span className={cn("vz-tag", className)} data-tone={tone === "neutral" ? undefined : tone} {...rest}>
            {dot ? <i className="vz-dot" data-pulse={pulse || undefined} aria-hidden /> : null}
            {Icon ? <Icon aria-hidden /> : null}
            <span>{children}</span>
        </span>
    );
}

const STATUS_MAP = {
    queued: { tone: "neutral", label: "排队中" },
    running: { tone: "brand", label: "生成中" },
    success: { tone: "success", label: "已完成" },
    warning: { tone: "warning", label: "部分完成" },
    failed: { tone: "danger", label: "失败" },
    info: { tone: "info", label: "草稿" },
} as const;

export type VzStatus = keyof typeof STATUS_MAP;

export function VzStatusBadge({ status, label }: { status: VzStatus; label?: string }) {
    const item = STATUS_MAP[status];
    return (
        <VzTag tone={item.tone} dot pulse={status === "running"} role="status">
            {label ?? item.label}
        </VzTag>
    );
}

export function VzModelTag({ name, vendor }: { name: string; vendor: string }) {
    return (
        <span className="vz-tag vz-model-tag" title={`${vendor} · ${name}`}>
            <span className="vz-model-tag__logo" aria-hidden>
                {vendor.slice(0, 1).toUpperCase()}
            </span>
            <span>{name}</span>
        </span>
    );
}

type CardProps = HTMLAttributes<HTMLDivElement> & { interactive?: boolean; selected?: boolean; disabled?: boolean; force?: "hover"; children: ReactNode };

/** Card with pointer-following highlight when interactive. */
export function VzCard({ interactive, selected, disabled, force, className, onMouseMove, children, ...rest }: CardProps) {
    const handleMove = useCallback(
        (event: MouseEvent<HTMLDivElement>) => {
            if (interactive) {
                const rect = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
                event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
            }
            onMouseMove?.(event);
        },
        [interactive, onMouseMove],
    );
    return (
        <div
            className={cn("vz-card", className)}
            data-interactive={interactive || undefined}
            data-selected={selected || undefined}
            data-disabled={disabled || undefined}
            data-force={force}
            tabIndex={interactive && !disabled ? 0 : undefined}
            aria-selected={interactive ? Boolean(selected) : undefined}
            aria-disabled={disabled || undefined}
            onMouseMove={handleMove}
            {...rest}
        >
            {children}
        </div>
    );
}

export function VzSectionTitle({ eyebrow, title, desc, extra }: { eyebrow?: string; title: string; desc?: string; extra?: ReactNode }) {
    return (
        <div className="vz-section-title">
            <div>
                {eyebrow ? <span className="vz-eyebrow">{eyebrow}</span> : null}
                <h2 className="vz-h2">{title}</h2>
                {desc ? <p className="vz-body">{desc}</p> : null}
            </div>
            {extra}
        </div>
    );
}
