"use client";

import type { ReactNode } from "react";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * 选择器：单选 / 多选 / 标签输入 / 可搜索 / 分组 / 选项描述与图标 / 禁用项 / 加载中 / 空结果。
 * 定位与焦点交给 radix Popover；列表是 listbox，方向键移动、回车选中、Esc 关闭、Backspace 删最后一个标签。
 * 表单里用 invalid + describedBy 接报错（见 gamma-form）。
 */

export interface GammaSelectOption<V extends string = string> {
    value: V;
    label: string;
    description?: string;
    icon?: ReactNode;
    group?: string;
    disabled?: boolean;
    /** 右侧附加信息，例如积分 / 时长 */
    meta?: ReactNode;
}

interface BaseProps<V extends string> {
    options: readonly GammaSelectOption<V>[];
    placeholder?: string;
    searchable?: boolean;
    loading?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    size?: "sm" | "md";
    emptyText?: string;
    id?: string;
    describedBy?: string;
    ariaLabel?: string;
    className?: string;
}

type SingleProps<V extends string> = BaseProps<V> & { mode?: "single"; value: V | null; onChange: (value: V | null) => void; clearable?: boolean };
type MultiProps<V extends string> = BaseProps<V> & { mode: "multiple" | "tags"; value: readonly V[]; onChange: (value: V[]) => void; maxTags?: number };
export type GammaSelectProps<V extends string = string> = SingleProps<V> | MultiProps<V>;

const POP = { type: "spring", stiffness: 520, damping: 34 } as const;

function useFiltered<V extends string>(options: readonly GammaSelectOption<V>[], query: string) {
    return useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((option) => `${option.label}${option.description ?? ""}`.toLowerCase().includes(q)) : options;
    }, [options, query]);
}

/** 把选项按 group 排好，返回 [组名, 选项[]][]；没有 group 的放在最前 */
function grouped<V extends string>(options: readonly GammaSelectOption<V>[]) {
    const map = new Map<string, GammaSelectOption<V>[]>();
    for (const option of options) {
        const key = option.group ?? "";
        map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
}

export function GammaSelect<V extends string = string>(props: GammaSelectProps<V>) {
    const { options, placeholder = "请选择", searchable = false, loading = false, disabled = false, invalid = false, size = "md", emptyText = "没有匹配的选项", describedBy, ariaLabel, className } = props;
    const multi = props.mode === "multiple" || props.mode === "tags";
    const reduce = useReducedMotion();
    const autoId = useId();
    const id = props.id ?? autoId;
    const listId = `${id}-list`;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [themeRoot, setThemeRoot] = useState<HTMLElement | null>(null);
    // 打开时找一次最近的 .gm 主题容器（DOM 是外部系统，放在 effect 里读）
    useEffect(() => {
        if (open) setThemeRoot((triggerRef.current?.closest(".gm") as HTMLElement | null) ?? null);
    }, [open]);

    const selected: readonly V[] = multi ? (props as MultiProps<V>).value : (props as SingleProps<V>).value ? [(props as SingleProps<V>).value as V] : [];
    const filtered = useFiltered(options, query);
    const enabled = filtered.filter((option) => !option.disabled);
    // tags 模式：输入的内容不在选项里时，提供「创建」一项
    const canCreate = props.mode === "tags" && query.trim() && !options.some((option) => option.label === query.trim());
    const maxTags = multi ? (props as MultiProps<V>).maxTags : undefined;
    const maxReached = maxTags !== undefined && selected.length >= maxTags;

    const commit = (value: V) => {
        if (!multi) {
            (props as SingleProps<V>).onChange(value);
            setOpen(false);
            return;
        }
        const multiProps = props as MultiProps<V>;
        const has = selected.includes(value);
        if (!has && maxReached) return;
        multiProps.onChange(has ? selected.filter((item) => item !== value) : [...selected, value]);
        setQuery("");
        searchRef.current?.focus();
    };
    const remove = (value: V) => multi && (props as MultiProps<V>).onChange(selected.filter((item) => item !== value));

    const handleKey = (event: KeyboardEvent) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((value) => Math.min(enabled.length - 1 + (canCreate ? 1 : 0), value + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((value) => Math.max(0, value - 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (canCreate && cursor === enabled.length) commit(query.trim() as V);
            else if (enabled[cursor]) commit(enabled[cursor].value);
        } else if (event.key === "Backspace" && !query && multi && selected.length) {
            remove(selected[selected.length - 1]);
        }
    };

    const labelOf = (value: V) => options.find((option) => option.value === value)?.label ?? value;
    const single = !multi && selected[0] ? options.find((option) => option.value === selected[0]) : undefined;
    const height = size === "sm" ? "min-h-8" : "min-h-10";
    const activeValue = enabled[cursor]?.value;

    return (
        <PopoverPrimitive.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setCursor(0);
                    setQuery("");
                }
            }}
        >
            <PopoverPrimitive.Trigger asChild disabled={disabled}>
                <button
                    ref={triggerRef}
                    id={id}
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-haspopup="listbox"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-label={ariaLabel}
                    onKeyDown={(event) => {
                        if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
                            event.preventDefault();
                            setOpen(true);
                        }
                    }}
                    className={cn(
                        "group flex w-full items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 py-1 text-left text-sm ring-1 transition-shadow duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                        height,
                        invalid ? "ring-[var(--gm-danger)]" : open ? "shadow-[0_0_0_4px_var(--gm-accent-soft)] ring-[var(--gm-accent)]" : "ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)] focus-visible:ring-[var(--gm-accent)]",
                        className,
                    )}
                >
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        {multi && selected.length ? (
                            <AnimatePresence initial={false}>
                                {selected.map((value) => (
                                    <motion.span
                                        key={value}
                                        layout={!reduce}
                                        initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        transition={POP}
                                        className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--gm-accent-soft)] pr-1 pl-2 text-xs text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]"
                                    >
                                        {labelOf(value)}
                                        <span
                                            role="button"
                                            tabIndex={-1}
                                            aria-label={`移除 ${labelOf(value)}`}
                                            onPointerDown={(event) => event.preventDefault()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                remove(value);
                                            }}
                                            className="grid size-4 place-items-center rounded-full hover:bg-[var(--gm-accent)] hover:text-[var(--gm-bg)]"
                                        >
                                            <X className="size-3" />
                                        </span>
                                    </motion.span>
                                ))}
                            </AnimatePresence>
                        ) : single ? (
                            <span className="flex min-w-0 items-center gap-2">
                                {single.icon ? <span className="text-[var(--gm-text-2)] [&_svg]:size-4">{single.icon}</span> : null}
                                <span className="truncate text-[var(--gm-text)]">{single.label}</span>
                            </span>
                        ) : (
                            <span className="truncate text-[var(--gm-text-3)]">{placeholder}</span>
                        )}
                    </span>
                    {loading ? <Loader2 className="size-4 animate-spin text-[var(--gm-text-3)]" /> : null}
                    {!multi && (props as SingleProps<V>).clearable && single ? (
                        <span
                            role="button"
                            tabIndex={-1}
                            aria-label="清空"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                                event.stopPropagation();
                                (props as SingleProps<V>).onChange(null);
                            }}
                            className="grid size-5 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                        >
                            <X className="size-3.5" />
                        </span>
                    ) : null}
                    <ChevronDown className={cn("size-4 shrink-0 text-[var(--gm-text-3)] transition-transform duration-200", open && "rotate-180 text-[var(--gm-accent)]")} />
                </button>
            </PopoverPrimitive.Trigger>
            {/* 浮层挂到最近的 .gm 主题容器里，才能继承深 / 浅色变量 */}
            <PopoverPrimitive.Portal container={themeRoot}>
                <PopoverPrimitive.Content
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                    onOpenAutoFocus={(event) => {
                        // 有搜索框就把焦点给搜索框，否则留在列表上方便方向键
                        event.preventDefault();
                        (searchRef.current ?? (event.currentTarget as HTMLElement | null))?.focus();
                    }}
                    onKeyDown={handleKey}
                    className="gm-glass gm-glass-strong z-[140] w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-hidden rounded-[var(--gm-radius-lg)] p-1 shadow-[var(--gm-shadow)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                    tabIndex={-1}
                >
                    {searchable || props.mode === "tags" ? (
                        <label className="mb-1 flex h-9 items-center gap-2 rounded-[10px] bg-[var(--gm-wash)] px-2.5">
                            <Search className="size-3.5 text-[var(--gm-text-3)]" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setCursor(0);
                                }}
                                placeholder={props.mode === "tags" ? "输入后回车添加" : "搜索"}
                                aria-label="搜索选项"
                                aria-controls={listId}
                                aria-activedescendant={activeValue ? `${id}-opt-${activeValue}` : undefined}
                                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]"
                            />
                        </label>
                    ) : null}
                    <div id={listId} role="listbox" aria-multiselectable={multi || undefined} className="gm-scroll max-h-72 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-xs text-[var(--gm-text-3)]">
                                <Loader2 className="size-4 animate-spin" /> 加载中…
                            </div>
                        ) : filtered.length === 0 && !canCreate ? (
                            <div className="py-6 text-center text-xs text-[var(--gm-text-3)]">{emptyText}</div>
                        ) : (
                            grouped(filtered).map(([group, items]) => (
                                <div key={group || "_"} role="group" aria-label={group || undefined}>
                                    {group ? <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-[var(--gm-text-3)]">{group}</div> : null}
                                    {items.map((option) => {
                                        const isSelected = selected.includes(option.value);
                                        const isActive = option.value === activeValue;
                                        const blocked = option.disabled || (!isSelected && maxReached);
                                        return (
                                            <div
                                                key={option.value}
                                                id={`${id}-opt-${option.value}`}
                                                role="option"
                                                aria-selected={isSelected}
                                                aria-disabled={blocked || undefined}
                                                onPointerMove={() => !blocked && setCursor(enabled.findIndex((item) => item.value === option.value))}
                                                onClick={() => !blocked && commit(option.value)}
                                                className={cn(
                                                    "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] transition-colors",
                                                    blocked ? "cursor-not-allowed opacity-40" : isActive ? "bg-[var(--gm-wash-strong)]" : "",
                                                    isSelected && "text-[var(--gm-accent)]",
                                                )}
                                            >
                                                {multi ? (
                                                    <span
                                                        className={cn(
                                                            "grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors",
                                                            isSelected ? "bg-[var(--gm-blue)] text-white ring-[var(--gm-blue)]" : "ring-[var(--gm-border-strong)]",
                                                        )}
                                                    >
                                                        {isSelected ? <Check className="size-3" /> : null}
                                                    </span>
                                                ) : null}
                                                {option.icon ? <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[var(--gm-wash)] text-[var(--gm-text-2)] [&_svg]:size-4">{option.icon}</span> : null}
                                                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                                    <span className="truncate">{option.label}</span>
                                                    {option.description ? <span className="truncate text-[11px] text-[var(--gm-text-3)]">{option.description}</span> : null}
                                                </span>
                                                {option.meta ? <span className="shrink-0 text-[11px] text-[var(--gm-text-3)]">{option.meta}</span> : null}
                                                {!multi && isSelected ? <Check className="size-4 shrink-0" /> : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                        {canCreate ? (
                            <div
                                role="option"
                                aria-selected={false}
                                onClick={() => commit(query.trim() as V)}
                                className={cn("flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--gm-accent)]", cursor === enabled.length && "bg-[var(--gm-wash-strong)]")}
                            >
                                <Plus className="size-4" />
                                创建「{query.trim()}」
                            </div>
                        ) : null}
                    </div>
                    {maxTags ? (
                        <div className="border-t border-[var(--gm-border)] px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--gm-text-3)]">
                            已选 {selected.length} / {maxTags}
                        </div>
                    ) : null}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}
