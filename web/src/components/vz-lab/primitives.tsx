"use client";

import { Tooltip } from "antd";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type LabTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";
export type LabForce = "hover" | "active" | "focus";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "link" | "danger";
    size?: "sm" | "md" | "lg";
    icon?: LucideIcon;
    loading?: boolean;
    selected?: boolean;
    /** Showcase only: pin a visual state. */
    force?: LabForce;
};

export function LabButton({ variant = "secondary", size = "md", icon: Icon, loading, selected, force, className, children, disabled, ...rest }: ButtonProps) {
    return (
        <button
            type="button"
            className={cn("vzl-btn", `vzl-btn--${variant}`, className)}
            data-size={size}
            data-force={force}
            data-selected={selected || undefined}
            aria-busy={loading || undefined}
            aria-pressed={selected}
            {...rest}
            disabled={disabled || loading}
        >
            {loading ? <span className="vzl-spinner" aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
            {children}
        </button>
    );
}

/** Icon-only button; `label` drives both the tooltip and aria-label. */
export function LabIconButton({ icon, label, variant = "ghost", className, ...rest }: Omit<ButtonProps, "children" | "icon"> & { icon: LucideIcon; label: string }) {
    return (
        <Tooltip title={label} mouseEnterDelay={0.25}>
            <LabButton variant={variant} icon={icon} aria-label={label} className={cn("vzl-btn--icon", className)} {...rest} />
        </Tooltip>
    );
}

export function LabTag({ tone = "neutral", icon: Icon, dot, pulse, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: LabTone; icon?: LucideIcon; dot?: boolean; pulse?: boolean }) {
    return (
        <span className={cn("vzl-tag", className)} data-tone={tone === "neutral" ? undefined : tone} {...rest}>
            {dot ? <i className="vzl-dot" data-pulse={pulse || undefined} aria-hidden /> : null}
            {Icon ? <Icon aria-hidden /> : null}
            <span>{children}</span>
        </span>
    );
}

const STATUS = {
    queued: { tone: "neutral", label: "排队中" },
    running: { tone: "brand", label: "生成中" },
    success: { tone: "success", label: "已完成" },
    warning: { tone: "warning", label: "部分完成" },
    failed: { tone: "danger", label: "失败" },
    draft: { tone: "info", label: "草稿" },
} as const;

export type LabStatus = keyof typeof STATUS;

export function LabStatusBadge({ status, label }: { status: LabStatus; label?: string }) {
    const item = STATUS[status];
    return (
        <LabTag tone={item.tone} dot pulse={status === "running"}>
            {label ?? item.label}
        </LabTag>
    );
}

export function LabModelTag({ name, vendor }: { name: string; vendor: string }) {
    return (
        <span className="vzl-tag vzl-model-tag" title={`${vendor} · ${name}`}>
            <span className="vzl-logo" aria-hidden>
                {vendor.slice(0, 1).toUpperCase()}
            </span>
            <span>{name}</span>
        </span>
    );
}

type CardProps = HTMLAttributes<HTMLDivElement> & { interactive?: boolean; selected?: boolean; disabled?: boolean; force?: "hover"; children: ReactNode };

/** Card with a pointer-following highlight when interactive. */
export function LabCard({ interactive, selected, disabled, force, className, onMouseMove, children, ...rest }: CardProps) {
    const onMove = (event: MouseEvent<HTMLDivElement>) => {
        if (interactive) {
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
            event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
        }
        onMouseMove?.(event);
    };
    return (
        <div
            className={cn("vzl-card", className)}
            data-interactive={interactive || undefined}
            data-selected={selected || undefined}
            data-disabled={disabled || undefined}
            data-force={force}
            tabIndex={interactive && !disabled ? 0 : undefined}
            aria-disabled={disabled || undefined}
            onMouseMove={onMove}
            {...rest}
        >
            {children}
        </div>
    );
}

export function LabSectionTitle({ eyebrow, title, desc, extra }: { eyebrow?: string; title: string; desc?: string; extra?: ReactNode }) {
    return (
        <div className="vzl-sec-title">
            <div>
                {eyebrow ? <span className="vzl-eyebrow">{eyebrow}</span> : null}
                <h2 className="vzl-h2">{title}</h2>
                {desc ? <p className="vzl-body">{desc}</p> : null}
            </div>
            {extra}
        </div>
    );
}
