"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type VzToastTone = "success" | "error" | "info";

export interface VzToastItem {
    id: number;
    tone: VzToastTone;
    message: string;
}

const TOAST_ICON: Record<VzToastTone, ReactNode> = {
    success: <CheckCircle2 className="size-4 text-[var(--vz-success)]" />,
    error: <AlertTriangle className="size-4 text-[var(--vz-danger)]" />,
    info: <Info className="size-4 text-[var(--vz-brand-3)]" />,
};

/** 顶部居中的轻提示队列；增删由调用方管理 */
export function VzToastStack({ toasts, onDismiss }: { toasts: VzToastItem[]; onDismiss: (id: number) => void }) {
    return (
        <div aria-live="polite" className="pointer-events-none fixed top-20 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="status"
                    className="pointer-events-auto flex animate-in items-center gap-2.5 rounded-full bg-[var(--vz-surface-2)] py-2 pr-2 pl-4 text-[13px] text-[var(--vz-text)] shadow-[var(--vz-shadow)] ring-1 ring-[var(--vz-border-strong)] fade-in slide-in-from-top-2"
                >
                    {TOAST_ICON[toast.tone]}
                    {toast.message}
                    <button type="button" aria-label="关闭提示" onClick={() => onDismiss(toast.id)} className="grid size-6 place-items-center rounded-full text-[var(--vz-text-3)] hover:bg-white/10 hover:text-[var(--vz-text)]">
                        <X className="size-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}

/** 大图预览弹层：Esc / 点击遮罩关闭，打开时聚焦关闭按钮 */
export function VzLightbox({ src, title, onClose, actions }: { src: string | null; title?: string; onClose: () => void; actions?: ReactNode }) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!src) return;
        closeRef.current?.focus();
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [src, onClose]);

    if (!src) return null;

    return (
        <div role="dialog" aria-modal="true" aria-label={title || "预览"} className="fixed inset-0 z-[90] grid animate-in place-items-center bg-black/80 p-8 backdrop-blur-md fade-in" onClick={onClose}>
            <figure className="relative m-0 flex max-h-full max-w-5xl animate-in flex-col overflow-hidden rounded-[var(--vz-radius-xl)] bg-[var(--vz-surface)] ring-1 ring-[var(--vz-border-strong)] zoom-in-95" onClick={(event) => event.stopPropagation()}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 预览页静态素材 */}
                <img src={src} alt={title || ""} className="max-h-[72vh] w-auto object-contain" />
                <figcaption className="flex items-center gap-3 p-4">
                    <span className="flex-1 truncate text-sm text-[var(--vz-text)]">{title}</span>
                    {actions}
                </figcaption>
                <button
                    ref={closeRef}
                    type="button"
                    aria-label="关闭预览"
                    onClick={onClose}
                    className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]"
                >
                    <X className="size-4" />
                </button>
            </figure>
        </div>
    );
}

/** 空状态 / 模块占位 */
export function VzEmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-[var(--vz-radius-xl)] border border-dashed border-[var(--vz-border-strong)] bg-white/[0.015] px-6 py-20 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-[var(--vz-brand-soft)] text-[#c4b5fd] ring-1 ring-[rgba(139,92,246,0.3)] [&_svg]:size-6">{icon}</span>
            <h3 className="mt-4 text-base font-semibold">{title}</h3>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--vz-text-2)]">{description}</p>
            {action ? <div className="mt-5">{action}</div> : null}
        </div>
    );
}
