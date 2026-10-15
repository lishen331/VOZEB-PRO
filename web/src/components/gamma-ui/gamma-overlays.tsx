"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type GammaToastTone = "success" | "error" | "info";

export interface GammaToastItem {
    id: number;
    tone: GammaToastTone;
    message: string;
}

const TOAST_ICON: Record<GammaToastTone, ReactNode> = {
    success: <CheckCircle2 className="size-4 text-[var(--gm-success)]" />,
    error: <AlertTriangle className="size-4 text-[var(--gm-danger)]" />,
    info: <Info className="size-4 text-[var(--gm-accent)]" />,
};

/** 顶部居中轻提示：弹簧进出 + 堆叠时自动让位 */
export function GammaToastStack({ toasts, onDismiss }: { toasts: GammaToastItem[]; onDismiss: (id: number) => void }) {
    return (
        <div aria-live="polite" className="pointer-events-none fixed top-5 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
            <AnimatePresence initial={false}>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        layout
                        role="status"
                        initial={{ opacity: 0, y: -16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[var(--gm-surface-2)] py-2 pr-2 pl-4 text-[13px] text-[var(--gm-text)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]"
                    >
                        {TOAST_ICON[toast.tone]}
                        {toast.message}
                        <button type="button" aria-label="关闭提示" onClick={() => onDismiss(toast.id)} className="grid size-6 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                            <X className="size-3.5" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

function useEscape(open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, onClose]);
}

/** 对话框：遮罩淡入 + 面板弹簧放大；Esc / 遮罩关闭，打开时聚焦首个可交互元素 */
export function GammaModal({ open, title, description, onClose, children, footer, width = 440 }: { open: boolean; title: string; description?: string; onClose: () => void; children?: ReactNode; footer?: ReactNode; width?: number }) {
    const panelRef = useRef<HTMLDivElement>(null);
    useEscape(open, onClose);
    useEffect(() => {
        if (open) panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    }, [open]);

    return (
        <AnimatePresence>
            {open ? (
                <motion.div key="modal" className="fixed inset-0 z-[110] grid place-items-center bg-[var(--gm-scrim)] p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        initial={{ opacity: 0, scale: 0.94, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        style={{ width }}
                        className="relative max-w-full overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-[var(--gm-border-strong)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-[var(--gm-blue)] opacity-25 blur-3xl" />
                        <div className="relative p-6">
                            <h2 className="pr-8 text-lg font-semibold">{title}</h2>
                            {description ? <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--gm-text-2)]">{description}</p> : null}
                            {children ? <div className="mt-5">{children}</div> : null}
                        </div>
                        {footer ? <div className="relative flex justify-end gap-2 border-t border-[var(--gm-border)] bg-[var(--gm-surface-2)] px-6 py-4">{footer}</div> : null}
                        <button type="button" aria-label="关闭" onClick={onClose} className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                            <X className="size-4" />
                        </button>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

/** 大图预览 */
export function GammaLightbox({ src, title, onClose, actions }: { src: string | null; title?: string; onClose: () => void; actions?: ReactNode }) {
    const closeRef = useRef<HTMLButtonElement>(null);
    useEscape(Boolean(src), onClose);
    useEffect(() => {
        if (src) closeRef.current?.focus();
    }, [src]);

    return (
        <AnimatePresence>
            {src ? (
                <motion.div
                    key="lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label={title || "预览"}
                    className="fixed inset-0 z-[110] grid place-items-center bg-black/85 p-8 backdrop-blur-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.figure
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, ease: EASE_OUT }}
                        className="relative m-0 flex max-h-full max-w-5xl flex-col overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border-strong)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                        <img src={src} alt={title || ""} className="max-h-[72vh] w-auto object-contain" />
                        <figcaption className="flex items-center gap-3 p-4">
                            <span className="flex-1 truncate text-sm">{title}</span>
                            {actions}
                        </figcaption>
                        <button
                            ref={closeRef}
                            type="button"
                            aria-label="关闭预览"
                            onClick={onClose}
                            className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                        >
                            <X className="size-4" />
                        </button>
                    </motion.figure>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

export interface GammaMenuItem {
    key: string;
    label: string;
    icon?: ReactNode;
    danger?: boolean;
    onSelect: () => void;
}

/** 下拉菜单：点击触发器展开，点外部或 Esc 关闭 */
export function GammaMenu({ trigger, items, align = "end", label }: { trigger: (open: boolean) => ReactNode; items: GammaMenuItem[]; align?: "start" | "end"; label: string }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    useEscape(open, () => setOpen(false));
    useEffect(() => {
        if (!open) return;
        const handlePointer = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        window.addEventListener("pointerdown", handlePointer);
        return () => window.removeEventListener("pointerdown", handlePointer);
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((value) => !value)} className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]">
                {trigger(open)}
            </button>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: EASE_OUT }}
                        className={cn(
                            "absolute top-full z-[60] mt-2 min-w-44 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] p-1.5 shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]",
                            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
                        )}
                    >
                        {items.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    item.onSelect();
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-[var(--gm-radius-sm)] px-2.5 py-2 text-left text-[13px] transition-colors [&_svg]:size-4",
                                    item.danger ? "text-[var(--gm-danger)] hover:bg-[rgba(255,77,109,0.1)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]",
                                )}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

/** 悬浮提示（hover / 键盘聚焦都会出现） */
export function GammaTooltip({ content, children }: { content: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="relative inline-flex" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
            {children}
            <AnimatePresence>
                {open ? (
                    <motion.span
                        role="tooltip"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 2 }}
                        transition={{ duration: 0.14 }}
                        className="pointer-events-none absolute bottom-full left-1/2 z-[70] mb-2 -translate-x-1/2 rounded-md bg-[var(--gm-surface-light)] px-2 py-1 text-xs font-medium whitespace-nowrap text-[var(--gm-inverse-text)] shadow-lg"
                    >
                        {content}
                    </motion.span>
                ) : null}
            </AnimatePresence>
        </span>
    );
}

export function GammaEmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
    return (
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[var(--gm-radius-xl)] border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)] px-6 py-16 text-center">
            <div aria-hidden className="gm-aurora pointer-events-none absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--gm-blue)] opacity-15 blur-3xl" />
            <span className="relative grid size-14 place-items-center rounded-2xl bg-[var(--gm-blue-soft)] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)] [&_svg]:size-6">{icon}</span>
            <h3 className="relative mt-4 text-base font-semibold">{title}</h3>
            <p className="relative mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--gm-text-2)]">{description}</p>
            {action ? <div className="relative mt-5">{action}</div> : null}
        </div>
    );
}
