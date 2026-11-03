"use client";

import { AlertCircle, Check, Sparkles } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type LabRunStatus = "idle" | "running" | "success" | "error";

const LABEL: Record<LabRunStatus, string> = { idle: "开始生成", running: "生成中", success: "生成完成", error: "失败，点击重试" };

export function LabGenerateButton({ status = "idle", cost, progress, className, disabled, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { status?: LabRunStatus; cost?: number; progress?: number }) {
    const running = status === "running";
    const Icon = status === "success" ? Check : status === "error" ? AlertCircle : Sparkles;
    return (
        <button type="button" className={cn("vzl-gen", className)} data-status={status} aria-busy={running || undefined} {...rest} disabled={disabled || running}>
            {running ? <span className="vzl-spinner" aria-hidden /> : <Icon aria-hidden />}
            <span aria-live="polite">{LABEL[status]}</span>
            {running && progress !== undefined ? <span className="vzl-gen__pill vzl-num">{`${Math.round(progress)}%`}</span> : null}
            {status === "idle" && cost !== undefined ? <span className="vzl-gen__pill vzl-num">{`${cost} 积分`}</span> : null}
        </button>
    );
}
