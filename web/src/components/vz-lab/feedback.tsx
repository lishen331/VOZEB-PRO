"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export function LabSkeleton({ width = "100%", height = 14, radius }: { width?: CSSProperties["width"]; height?: CSSProperties["height"]; radius?: number }) {
    return <span className="vzl-skel" aria-hidden style={{ width, height, borderRadius: radius }} />;
}

export function LabProgress({ value = 0, tone, indeterminate, label }: { value?: number; tone?: "success" | "danger"; indeterminate?: boolean; label: string }) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    return (
        <div className="vzl-progress" data-tone={tone} data-indeterminate={indeterminate || undefined} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : pct}>
            <div className="vzl-progress__bar" style={{ width: `${pct}%` }} />
        </div>
    );
}

export function LabState({ icon: Icon, title, desc, action, tone }: { icon: LucideIcon; title: string; desc?: string; action?: ReactNode; tone?: "danger" }) {
    return (
        <div className="vzl-state" data-tone={tone} role={tone === "danger" ? "alert" : undefined}>
            <span className="vzl-state__icon">
                <Icon aria-hidden />
            </span>
            <span className="vzl-h3">{title}</span>
            {desc ? (
                <span className="vzl-caption" style={{ maxWidth: 320 }}>
                    {desc}
                </span>
            ) : null}
            {action}
        </div>
    );
}

const ICONS = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info };

export function LabAlert({ tone, title, children }: { tone: keyof typeof ICONS; title?: string; children: ReactNode }) {
    const Icon = ICONS[tone];
    return (
        <div className="vzl-alert" data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
            <Icon aria-hidden />
            <span>
                {title ? <b>{`${title} `}</b> : null}
                {children}
            </span>
        </div>
    );
}
