"use client";

import { AlertCircle, Check, Sparkles } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type VzRunStatus = "idle" | "running" | "success" | "error";

const LABEL: Record<VzRunStatus, string> = { idle: "开始生成", running: "生成中", success: "再次生成", error: "生成失败，重试" };

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { status?: VzRunStatus; cost?: number; progress?: number };

export function VzGenerateButton({ status = "idle", cost, progress, className, disabled, ...rest }: Props) {
    const running = status === "running";
    return (
        <button type="button" className={cn("vz-gen", className)} data-status={status} aria-busy={running || undefined} aria-live="polite" {...rest} disabled={disabled || running}>
            {running ? <span className="vz-spinner" aria-hidden /> : status === "success" ? <Check aria-hidden /> : status === "error" ? <AlertCircle aria-hidden /> : <Sparkles aria-hidden />}
            <span>{LABEL[status]}</span>
            {running && typeof progress === "number" ? <span className="vz-gen__cost vz-num">{`${Math.round(progress)}%`}</span> : null}
            {status === "idle" && typeof cost === "number" ? <span className="vz-gen__cost vz-num">{`${cost} 积分`}</span> : null}
        </button>
    );
}
