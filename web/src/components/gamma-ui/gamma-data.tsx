"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, FileImage, FileVideo, X } from "lucide-react";

import { cn } from "@/lib/utils";

/* ===== 头像与头像组 ===== */

export function GammaAvatar({ src, name, size = 32, ring = true, status }: { src?: string; name: string; size?: number; ring?: boolean; status?: "online" | "busy" }) {
    const ringClass = ring && "ring-2 ring-[var(--gm-surface)]";
    return (
        <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- 头像为静态示意素材
                <img src={src} alt={name} className={cn("size-full rounded-full object-cover", ringClass)} />
            ) : (
                <span role="img" aria-label={name} className={cn("grid size-full place-items-center rounded-full bg-[image:var(--gm-gradient)] text-[11px] font-semibold text-white", ringClass)}>
                    {name.slice(0, 1)}
                </span>
            )}
            {status ? <span aria-hidden className={cn("absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-[var(--gm-surface)]", status === "online" ? "bg-[var(--gm-success)]" : "bg-[var(--gm-warning)]")} /> : null}
        </span>
    );
}

/** 头像组：hover 时展开间距 */
export function GammaAvatarGroup({ people, max = 4, size = 30 }: { people: readonly { name: string; src?: string }[]; max?: number; size?: number }) {
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;
    const overlap = -size / 3;
    return (
        <span className="group inline-flex items-center" role="group" aria-label={`${people.length} 位成员`}>
            {shown.map((person, index) => (
                <span key={person.name} className="transition-[margin] duration-300 group-hover:!ml-0.5" style={{ marginLeft: index === 0 ? 0 : overlap }} title={person.name}>
                    <GammaAvatar src={person.src} name={person.name} size={size} />
                </span>
            ))}
            {rest > 0 ? (
                <span
                    className="grid place-items-center rounded-full bg-[var(--gm-surface-3)] text-[11px] font-medium text-[var(--gm-text-2)] ring-2 ring-[var(--gm-surface)] transition-[margin] duration-300 group-hover:!ml-0.5"
                    style={{ width: size, height: size, marginLeft: overlap }}
                >
                    +{rest}
                </span>
            ) : null}
        </span>
    );
}

/* ===== 分页 ===== */

/** 当前页两侧各显示几页 */
const PAGE_WINDOW = 1;

function pageList(current: number, total: number): (number | "gap")[] {
    const candidates = new Set([1, total, ...Array.from({ length: PAGE_WINDOW * 2 + 1 }, (_, offset) => current - PAGE_WINDOW + offset)]);
    const sorted = [...candidates].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ["gap" as const, page] : [page]));
}

export function GammaPagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
    const reduce = useReducedMotion();
    const item = "grid size-8 place-items-center rounded-[var(--gm-radius-sm)] text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]";
    return (
        <nav aria-label="分页" className="inline-flex items-center gap-1">
            <button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => onChange(page - 1)} className={cn(item, "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] disabled:pointer-events-none disabled:opacity-35")}>
                <ChevronLeft className="size-4" />
            </button>
            {pageList(page, total).map((entry, index) =>
                entry === "gap" ? (
                    <span key={`gap-${index}`} aria-hidden className="w-6 text-center text-[var(--gm-text-3)]">
                        …
                    </span>
                ) : (
                    <button
                        key={entry}
                        type="button"
                        aria-current={entry === page ? "page" : undefined}
                        onClick={() => onChange(entry)}
                        className={cn(item, "relative", entry === page ? "text-white" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)]")}
                    >
                        {entry === page ? (
                            <motion.span
                                layoutId="gm-page-indicator"
                                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 34 }}
                                className="absolute inset-0 rounded-[inherit] bg-[image:var(--gm-gradient)] shadow-[var(--gm-glow-blue)]"
                            />
                        ) : null}
                        <span className="relative">{entry}</span>
                    </button>
                ),
            )}
            <button type="button" aria-label="下一页" disabled={page >= total} onClick={() => onChange(page + 1)} className={cn(item, "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] disabled:pointer-events-none disabled:opacity-35")}>
                <ChevronRight className="size-4" />
            </button>
        </nav>
    );
}

/* ===== 文件标签 ===== */

export function GammaFileChip({ name, size, kind = "image", progress, onRemove }: { name: string; size: string; kind?: "image" | "video"; progress?: number; onRemove?: () => void }) {
    const Icon = kind === "video" ? FileVideo : FileImage;
    const uploading = progress !== undefined && progress < 100;
    return (
        <span className="relative inline-flex max-w-[260px] items-center gap-2.5 overflow-hidden rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] py-2 pr-2 pl-2.5 ring-1 ring-[var(--gm-border)]">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]">
                <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{name}</span>
                <span className="block font-mono text-[10px] text-[var(--gm-text-3)]">{uploading ? `上传中 ${progress}%` : size}</span>
            </span>
            {onRemove ? (
                <button type="button" aria-label={`移除 ${name}`} onClick={onRemove} className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                    <X className="size-3.5" />
                </button>
            ) : null}
            {uploading ? <span aria-hidden className="absolute bottom-0 left-0 h-0.5 bg-[image:var(--gm-gradient)] transition-[width] duration-300" style={{ width: `${progress}%` }} /> : null}
        </span>
    );
}

/* ===== 键位提示 ===== */

export function GammaKbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[var(--gm-surface-2)] px-1.5 font-mono text-[11px] text-[var(--gm-text-2)] shadow-[inset_0_-1px_0_var(--gm-border-strong)] ring-1 ring-[var(--gm-border)]">
            {children}
        </kbd>
    );
}

/* ===== 骨架块 ===== */

export function GammaSkeleton({ className }: { className?: string }) {
    return <span aria-hidden className={cn("gm-shimmer block rounded-[var(--gm-radius-sm)] bg-[var(--gm-surface-2)]", className)} />;
}

/* ===== 数据表格 ===== */

export interface GammaColumn<Row> {
    key: string;
    title: string;
    render: (row: Row) => ReactNode;
    align?: "left" | "right";
    sortValue?: (row: Row) => number | string;
}

/** 轻量数据表：表头可排序、行 hover 高亮、空态 */
export function GammaTable<Row extends { id: string }>({ columns, rows, empty = "暂无数据" }: { columns: readonly GammaColumn<Row>[]; rows: readonly Row[]; empty?: string }) {
    const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
    const sortColumn = columns.find((item) => item.key === sort?.key);
    const getValue = sortColumn?.sortValue;
    const sorted = getValue && sort ? [...rows].sort((a, b) => (getValue(a) > getValue(b) ? sort.direction : -sort.direction)) : rows;

    return (
        <div className="overflow-hidden rounded-[var(--gm-radius-lg)] ring-1 ring-[var(--gm-border)]">
            <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--gm-surface-2)] text-xs text-[var(--gm-text-3)]">
                    <tr>
                        {columns.map((item) => {
                            const active = sort?.key === item.key;
                            const descending = active && sort?.direction === -1;
                            return (
                                <th key={item.key} scope="col" aria-sort={active ? (descending ? "descending" : "ascending") : undefined} className={cn("px-4 py-3 font-medium", item.align === "right" && "text-right")}>
                                    {item.sortValue ? (
                                        <button
                                            type="button"
                                            onClick={() => setSort((current) => ({ key: item.key, direction: current?.key === item.key && current.direction === 1 ? -1 : 1 }))}
                                            className={cn("inline-flex items-center gap-1 transition-colors hover:text-[var(--gm-text)]", active && "text-[var(--gm-accent)]")}
                                        >
                                            {item.title}
                                            <span aria-hidden className={cn("inline-block transition-transform duration-200", descending && "rotate-180", !active && "opacity-40")}>
                                                ↑
                                            </span>
                                        </button>
                                    ) : (
                                        item.title
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gm-border)] bg-[var(--gm-surface)]">
                    {sorted.length ? (
                        sorted.map((row) => (
                            <tr key={row.id} className="transition-colors hover:bg-[var(--gm-wash)]">
                                {columns.map((item) => (
                                    <td key={item.key} className={cn("px-4 py-3", item.align === "right" && "text-right tabular-nums")}>
                                        {item.render(row)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={columns.length} className="px-4 py-10 text-center text-[var(--gm-text-3)]">
                                {empty}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
