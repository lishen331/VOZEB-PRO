"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export interface GammaCommandItem {
    id: string;
    label: string;
    group: string;
    icon?: ReactNode;
    hint?: string;
    keywords?: string;
    onSelect: () => void;
}

const FOCUS_DELAY_MS = 30;

/** 顶栏搜索触发器：显示快捷键，点击或 Ctrl/⌘+K 打开命令面板 */
export function GammaSearchTrigger({ onOpen, placeholder = "搜索作品、专业、模板…" }: { onOpen: () => void; placeholder?: string }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="group flex h-9 w-full max-w-[420px] items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-wash)] px-3 text-[13px] text-[var(--gm-text-3)] ring-1 ring-[var(--gm-border)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            <Search className="size-4 transition-colors group-hover:text-[var(--gm-accent)]" />
            <span className="flex-1 truncate text-left">{placeholder}</span>
            <kbd className="rounded-md bg-[var(--gm-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--gm-text-2)]">Ctrl K</kbd>
        </button>
    );
}

/**
 * 命令面板：键盘优先（↑↓ 选择、Enter 执行、Esc 关闭），分组列出可跳转项。
 * 厚玻璃质感，打开时自动聚焦输入框。
 */
export function GammaCommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: readonly GammaCommandItem[] }) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return items;
        return items.filter((item) => `${item.label}${item.keywords ?? ""}${item.group}`.toLowerCase().includes(keyword));
    }, [items, query]);

    const groups = useMemo(() => {
        const map = new Map<string, { item: GammaCommandItem; index: number }[]>();
        results.forEach((item, index) => map.set(item.group, [...(map.get(item.group) ?? []), { item, index }]));
        return [...map];
    }, [results]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [open]);

    const close = () => {
        setQuery("");
        setActive(0);
        onClose();
    };

    const run = (item: GammaCommandItem | undefined) => {
        if (!item) return;
        close();
        item.onSelect();
    };

    return (
        <AnimatePresence>
            {open ? (
                <motion.div key="command" className="fixed inset-0 z-[115] flex items-start justify-center bg-[var(--gm-scrim)] px-4 pt-[14vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label="命令面板"
                        initial={{ opacity: 0, y: -12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        onClick={(event) => event.stopPropagation()}
                        className="gm-glass gm-glass-strong gm-glass-refract w-full max-w-[560px] overflow-hidden rounded-[var(--gm-radius-xl)]"
                    >
                        <div className="flex items-center gap-3 border-b border-[var(--gm-border)] px-4">
                            <Search className="size-4 text-[var(--gm-text-3)]" />
                            <input
                                ref={inputRef}
                                value={query}
                                aria-label="搜索命令"
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setActive(0);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        setActive((value) => Math.min(results.length - 1, value + 1));
                                    } else if (event.key === "ArrowUp") {
                                        event.preventDefault();
                                        setActive((value) => Math.max(0, value - 1));
                                    } else if (event.key === "Enter") {
                                        event.preventDefault();
                                        run(results[active]);
                                    } else if (event.key === "Escape") {
                                        close();
                                    }
                                }}
                                placeholder="搜索专业、模板或操作…"
                                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--gm-text-3)]"
                            />
                            <kbd className="rounded-md bg-[var(--gm-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--gm-text-2)]">Esc</kbd>
                        </div>
                        <div className="gm-scroll max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
                            {groups.length ? (
                                groups.map(([group, entries]) => (
                                    <div key={group} className="mb-1">
                                        <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-[var(--gm-text-3)]">{group}</p>
                                        {entries.map(({ item, index }) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                role="option"
                                                aria-selected={index === active}
                                                onPointerMove={() => setActive(index)}
                                                onClick={() => run(item)}
                                                className={cn(
                                                    "flex w-full items-center gap-3 rounded-[var(--gm-radius)] px-3 py-2.5 text-left text-[13px] transition-colors",
                                                    index === active ? "bg-[var(--gm-accent-soft)] text-[var(--gm-text)]" : "text-[var(--gm-text-2)]",
                                                )}
                                            >
                                                <span className={cn("grid size-7 place-items-center rounded-lg bg-[var(--gm-surface-3)] [&_svg]:size-4", index === active && "text-[var(--gm-accent)]")}>{item.icon}</span>
                                                <span className="flex-1 truncate">{item.label}</span>
                                                {item.hint ? <span className="text-[11px] text-[var(--gm-text-3)]">{item.hint}</span> : null}
                                                {index === active ? <CornerDownLeft className="size-3.5 text-[var(--gm-accent)]" /> : null}
                                            </button>
                                        ))}
                                    </div>
                                ))
                            ) : (
                                <p className="px-3 py-10 text-center text-[13px] text-[var(--gm-text-3)]">没有找到「{query}」相关结果</p>
                            )}
                        </div>
                        <div className="flex items-center gap-4 border-t border-[var(--gm-border)] px-4 py-2.5 text-[11px] text-[var(--gm-text-3)]">
                            <span>
                                <kbd className="font-mono">↑↓</kbd> 选择
                            </span>
                            <span>
                                <kbd className="font-mono">Enter</kbd> 打开
                            </span>
                            <span className="ml-auto">{results.length} 项</span>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

/** 全局 Ctrl/⌘ + K 快捷键 */
export function useGammaCommandHotkey(onOpen: () => void) {
    useEffect(() => {
        const handle = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                onOpen();
            }
        };
        window.addEventListener("keydown", handle);
        return () => window.removeEventListener("keydown", handle);
    }, [onOpen]);
}
