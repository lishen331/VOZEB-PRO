"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { VzTone } from "./primitives";

export function VzSkeleton({ width = "100%", height = 14, radius, style }: { width?: CSSProperties["width"]; height?: CSSProperties["height"]; radius?: number; style?: CSSProperties }) {
    return <span className="vz-skel" aria-hidden style={{ display: "block", width, height, borderRadius: radius, ...style }} />;
}

export function VzProgress({ value, tone, indeterminate, label }: { value?: number; tone?: "success" | "danger"; indeterminate?: boolean; label: string }) {
    const pct = Math.max(0, Math.min(100, value ?? 0));
    return (
        <div className="vz-progress" data-tone={tone} data-indeterminate={indeterminate || undefined} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : pct}>
            <div className="vz-progress__bar" style={{ width: `${pct}%` }} />
        </div>
    );
}

export function VzStateBlock({ icon: Icon, title, desc, action, tone }: { icon: LucideIcon; title: string; desc?: string; action?: ReactNode; tone?: "danger" }) {
    return (
        <div className="vz-state" data-tone={tone} role={tone === "danger" ? "alert" : undefined}>
            <span className="vz-state__icon">
                <Icon aria-hidden />
            </span>
            <span className="vz-h3">{title}</span>
            {desc ? (
                <span className="vz-caption" style={{ maxWidth: 320 }}>
                    {desc}
                </span>
            ) : null}
            {action}
        </div>
    );
}

const ALERT_ICON: Partial<Record<VzTone, LucideIcon>> = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info };

export function VzAlert({ tone, title, children }: { tone: "success" | "warning" | "danger" | "info"; title?: string; children: ReactNode }) {
    const Icon = ALERT_ICON[tone] ?? Info;
    return (
        <div className="vz-alert" data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
            <Icon aria-hidden />
            <span>
                {title ? <b>{`${title} `}</b> : null}
                {children}
            </span>
        </div>
    );
}
