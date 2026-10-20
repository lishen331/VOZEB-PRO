"use client";

/*
 * gamma-ui 的 antd 兼容层：Select。props 与 antd 同名同义，只覆盖页面实际用到的部分
 * （统计见 过程文件/bluegamma-rollout/survey-select-props.mjs）。
 * 定位与焦点交给 radix Popover；列表是 listbox，方向键移动、回车选中、Esc 关闭。
 * Form.Item 校验态/禁用态与 gamma-ant-input 一致从上下文读取。画布及其共享组件不使用本文件。
 */

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import DisabledContext from "antd/es/config-provider/DisabledContext";
import { FormItemInputContext } from "antd/es/form/context";

import { cn } from "@/lib/utils";

export interface SelectOption<V = string> {
    value: V;
    label: ReactNode;
    disabled?: boolean;
    /** 原生 title 属性，常用于悬浮提示的补充说明 */
    title?: string;
}

type SelectSize = "small" | "middle" | "large";
type SelectStatus = "error" | "warning";

interface SelectBaseProps<V> {
    /** NoInfer：options 的字面量类型不参与 V 的推断，V 只由 value / onChange 决定（与 antd 一致） */
    options?: readonly SelectOption<NoInfer<V>>[];
    placeholder?: ReactNode;
    disabled?: boolean;
    loading?: boolean;
    variant?: "outlined" | "borderless" | "filled";
    showSearch?: boolean;
    /** antd 语义：false 表示不做客户端过滤（配合 onSearch 异步搜索） */
    filterOption?: boolean | ((input: string, option: SelectOption<V>) => boolean);
    /** 同 filterOption，只按指定字段做默认子串匹配；两者同时出现时 filterOption 优先 */
    optionFilterProp?: string;
    /** 数字时浮层固定该宽度（不跟随触发器宽度），默认跟随触发器宽度 */
    popupMatchSelectWidth?: number | boolean;
    onSearch?: (keyword: string) => void;
    onOpenChange?: (open: boolean) => void;
    onPopupScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
    optionRender?: (option: SelectOption<V>) => ReactNode;
    notFoundContent?: ReactNode;
    size?: SelectSize;
    status?: SelectStatus;
    className?: string;
    style?: CSSProperties;
    id?: string;
    "aria-label"?: string;
    children?: ReactNode;
}

type SingleSelectProps<V> = SelectBaseProps<V> & {
    mode?: undefined;
    value?: V | null;
    defaultValue?: V | null;
    onChange?: (value: V) => void;
    allowClear?: boolean;
};

type MultiSelectProps<V> = SelectBaseProps<V> & {
    mode: "multiple" | "tags";
    value?: readonly V[] | null;
    defaultValue?: readonly V[] | null;
    onChange?: (value: V[]) => void;
    allowClear?: boolean;
    maxTagCount?: number | "responsive";
    /** mode="tags" 时限制最多可添加的标签数量 */
    maxCount?: number;
    /** mode="tags" 时把输入按分隔符切成多个 tag（如逗号、空格） */
    tokenSeparators?: string[];
};

export type SelectProps<V = string> = SingleSelectProps<V> | MultiSelectProps<V>;

const SIZE_CLASS: Record<SelectSize, string> = {
    small: "min-h-7 rounded-[7px] px-2 text-xs",
    middle: "min-h-8 rounded-[var(--gm-radius-sm)] px-2.5 text-[13px]",
    large: "min-h-10 rounded-[var(--gm-radius)] px-3 text-sm",
};

function defaultFilter<V>(input: string, option: SelectOption<V>) {
    const text = typeof option.label === "string" ? option.label : String(option.value);
    return text.toLowerCase().includes(input.toLowerCase());
}

function splitTokens(input: string, separators: string[]) {
    if (!separators.length) return [input];
    const pattern = new RegExp(`[${separators.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")}]`);
    return input
        .split(pattern)
        .map((item) => item.trim())
        .filter(Boolean);
}

// 函数重载而非单一 props 联合类型：联合类型下 TS 的泛型 V 推断会在两个分支间混淆
// （例如 mode="tags" + value: string[] 时会把 V 错误推成 string[] 而不是 string）。
export function Select<V = string>(props: SingleSelectProps<V>): ReturnType<typeof SelectImpl>;
export function Select<V = string>(props: MultiSelectProps<V>): ReturnType<typeof SelectImpl>;
export function Select<V = string>(props: SelectProps<V>) {
    return SelectImpl(props);
}

function SelectImpl<V = string>(props: SelectProps<V>) {
    const {
        options = [],
        placeholder = "请选择",
        disabled,
        loading = false,
        variant = "outlined",
        showSearch = false,
        filterOption,
        optionFilterProp,
        popupMatchSelectWidth = true,
        onSearch,
        onOpenChange,
        onPopupScroll,
        optionRender,
        notFoundContent = "暂无数据",
        size = "middle",
        status,
        className,
        style,
        id,
        "aria-label": ariaLabel,
    } = props;
    const mode = props.mode;
    const multi = mode === "multiple" || mode === "tags";
    const allowClear = props.allowClear ?? false;
    const maxTagCount = multi ? props.maxTagCount : undefined;
    const maxCount = multi ? props.maxCount : undefined;
    const tokenSeparators = (multi ? props.tokenSeparators : undefined) ?? [];
    const value = props.value;
    const defaultValue = props.defaultValue;
    const contextDisabled = useContext(DisabledContext);
    const formItem = useContext(FormItemInputContext);
    const isDisabled = disabled ?? contextDisabled ?? false;
    const resolvedStatus = status || (formItem.status as SelectStatus | undefined);

    const autoId = useId();
    const resolvedId = id ?? autoId;
    const listId = `${resolvedId}-list`;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const [inner, setInner] = useState<V | readonly V[] | null>(defaultValue ?? (multi ? [] : null));
    const searchRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [themeRoot, setThemeRoot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (open) setThemeRoot((triggerRef.current?.closest(".gm") as HTMLElement | null) ?? null);
    }, [open]);

    const controlled = value !== undefined;
    const current = controlled ? value : inner;
    const selected: V[] = multi ? [...((current as readonly V[] | null) ?? [])] : current !== null && current !== undefined ? [current as V] : [];

    const commit = (next: V | V[]) => {
        if (!controlled) setInner(next);
        if (multi) (props as MultiSelectProps<V>).onChange?.(next as V[]);
        else (props as SingleSelectProps<V>).onChange?.(next as V);
    };

    const filtered = useMemo(() => {
        if (!query.trim()) return options;
        if (filterOption === false) return options;
        if (typeof filterOption === "function") return options.filter((option) => filterOption(query, option));
        if (optionFilterProp) return options.filter((option) => String((option as unknown as Record<string, unknown>)[optionFilterProp] ?? "").toLowerCase().includes(query.toLowerCase()));
        return options.filter((option) => defaultFilter(query, option));
    }, [options, query, filterOption, optionFilterProp]);
    const enabled = filtered.filter((option) => !option.disabled);
    const canCreate = Boolean(mode === "tags" && query.trim() && !options.some((option) => String(option.value) === query.trim()) && (maxCount === undefined || selected.length < maxCount));
    const activeValue = enabled[cursor]?.value;

    const toggleOpen = (next: boolean) => {
        setOpen(next);
        onOpenChange?.(next);
        if (next) {
            setCursor(0);
            setQuery("");
        }
    };

    const pickSingle = (next: V) => {
        commit(next);
        toggleOpen(false);
    };
    const toggleMulti = (next: V) => {
        const has = selected.some((item) => item === next);
        if (!has && maxCount !== undefined && selected.length >= maxCount) return;
        commit(has ? selected.filter((item) => item !== next) : [...selected, next]);
        setQuery("");
        searchRef.current?.focus();
    };
    const removeTag = (next: V) => commit(selected.filter((item) => item !== next));
    const addTags = (raw: string) => {
        const tokens = splitTokens(raw, tokenSeparators);
        if (!tokens.length) return;
        const next = [...selected];
        for (const token of tokens) if (!next.some((item) => item === (token as unknown as V))) next.push(token as unknown as V);
        commit(next);
        setQuery("");
    };

    const labelOf = (item: V) => options.find((option) => option.value === item)?.label ?? String(item);
    const single = !multi && selected[0] !== undefined ? options.find((option) => option.value === selected[0]) : undefined;

    const handleKey = (event: ReactKeyboardEvent) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((current) => Math.min(enabled.length - 1 + (canCreate ? 1 : 0), current + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((current) => Math.max(0, current - 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (mode === "tags" && query.trim() && tokenSeparators.length === 0) {
                if (canCreate && cursor === enabled.length) addTags(query.trim());
                else if (enabled[cursor]) toggleMulti(enabled[cursor].value);
            } else if (multi && enabled[cursor]) toggleMulti(enabled[cursor].value);
            else if (!multi && enabled[cursor]) pickSingle(enabled[cursor].value);
        } else if (event.key === "Backspace" && !query && multi && selected.length) {
            removeTag(selected[selected.length - 1]);
        } else if ((event.key === "," || tokenSeparators.includes(event.key)) && mode === "tags" && tokenSeparators.length && query.trim()) {
            event.preventDefault();
            addTags(query);
        }
    };

    const visibleTags = maxTagCount === "responsive" || maxTagCount === undefined ? selected : selected.slice(0, maxTagCount);
    const hiddenCount = selected.length - visibleTags.length;

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={toggleOpen}>
            <PopoverPrimitive.Trigger asChild disabled={isDisabled}>
                <button
                    ref={triggerRef}
                    id={resolvedId}
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-haspopup="listbox"
                    aria-invalid={resolvedStatus === "error" || undefined}
                    aria-label={ariaLabel}
                    onKeyDown={(event) => {
                        if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
                            event.preventDefault();
                            toggleOpen(true);
                        }
                    }}
                    style={style}
                    className={cn(
                        "group flex w-full items-center gap-2 px-3 py-1 text-left transition-shadow duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                        SIZE_CLASS[size],
                        variant === "borderless" ? "bg-transparent ring-0" : variant === "filled" ? "bg-[var(--gm-surface-2)] ring-1" : "bg-[var(--gm-surface)] ring-1",
                        variant !== "borderless" &&
                            (resolvedStatus === "error"
                                ? "ring-[var(--gm-danger)]"
                                : resolvedStatus === "warning"
                                  ? "ring-[var(--gm-warning)]"
                                  : open
                                    ? "shadow-[0_0_0_4px_var(--gm-accent-soft)] ring-[var(--gm-accent)]"
                                    : "ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)] focus-visible:ring-[var(--gm-accent)]"),
                        className,
                    )}
                >
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        {multi && selected.length ? (
                            <>
                                {visibleTags.map((item) => (
                                    <span key={String(item)} className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--gm-accent-soft)] pr-1 pl-2 text-xs text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]">
                                        {labelOf(item)}
                                        <span
                                            role="button"
                                            tabIndex={-1}
                                            aria-label="移除"
                                            onPointerDown={(event) => event.preventDefault()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                removeTag(item);
                                            }}
                                            className="grid size-4 place-items-center rounded-full hover:bg-[var(--gm-accent)] hover:text-[var(--gm-bg)]"
                                        >
                                            <X className="size-3" />
                                        </span>
                                    </span>
                                ))}
                                {hiddenCount > 0 ? <span className="text-xs text-[var(--gm-text-3)]">+{hiddenCount}</span> : null}
                            </>
                        ) : single ? (
                            <span className="truncate text-[var(--gm-text)]">{single.label}</span>
                        ) : (
                            <span className="truncate text-[var(--gm-text-3)]">{placeholder}</span>
                        )}
                    </span>
                    {loading ? <Loader2 className="size-4 animate-spin text-[var(--gm-text-3)]" /> : null}
                    {allowClear && (multi ? selected.length > 0 : single) && !isDisabled ? (
                        <span
                            role="button"
                            tabIndex={-1}
                            aria-label="清空"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                                event.stopPropagation();
                                commit(multi ? [] : (null as unknown as V));
                            }}
                            className="grid size-5 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                        >
                            <X className="size-3.5" />
                        </span>
                    ) : null}
                    <ChevronDown className={cn("size-4 shrink-0 text-[var(--gm-text-3)] transition-transform duration-200", open && "rotate-180 text-[var(--gm-accent)]")} />
                </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal container={themeRoot}>
                <PopoverPrimitive.Content
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        (searchRef.current ?? (event.currentTarget as HTMLElement | null))?.focus();
                    }}
                    onKeyDown={handleKey}
                    style={typeof popupMatchSelectWidth === "number" ? { width: popupMatchSelectWidth } : undefined}
                    className={cn(
                        "gm-glass gm-glass-strong z-[140] min-w-[220px] overflow-hidden rounded-[var(--gm-radius-lg)] p-1 shadow-[var(--gm-shadow)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                        popupMatchSelectWidth === true ? "w-[var(--radix-popover-trigger-width)]" : "",
                    )}
                    tabIndex={-1}
                >
                    {showSearch || mode === "tags" ? (
                        <label className="mb-1 flex h-9 items-center gap-2 rounded-[10px] bg-[var(--gm-wash)] px-2.5">
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setCursor(0);
                                    onSearch?.(event.target.value);
                                }}
                                placeholder={mode === "tags" ? "输入后回车添加" : "搜索"}
                                aria-label="搜索选项"
                                aria-controls={listId}
                                aria-activedescendant={activeValue !== undefined ? `${resolvedId}-opt-${String(activeValue)}` : undefined}
                                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]"
                            />
                        </label>
                    ) : null}
                    <div id={listId} role="listbox" aria-multiselectable={multi || undefined} onScroll={onPopupScroll} className="gm-scroll max-h-72 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-xs text-[var(--gm-text-3)]">
                                <Loader2 className="size-4 animate-spin" /> 加载中…
                            </div>
                        ) : filtered.length === 0 && !canCreate ? (
                            <div className="py-6 text-center text-xs text-[var(--gm-text-3)]">{notFoundContent}</div>
                        ) : (
                            filtered.map((option) => {
                                const isSelected = selected.some((item) => item === option.value);
                                const isActive = option.value === activeValue;
                                return (
                                    <div
                                        key={String(option.value)}
                                        id={`${resolvedId}-opt-${String(option.value)}`}
                                        role="option"
                                        title={option.title}
                                        aria-selected={isSelected}
                                        aria-disabled={option.disabled || undefined}
                                        onPointerMove={() => !option.disabled && setCursor(enabled.findIndex((item) => item.value === option.value))}
                                        onClick={() => {
                                            if (option.disabled) return;
                                            if (multi) toggleMulti(option.value);
                                            else pickSingle(option.value);
                                        }}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] transition-colors",
                                            option.disabled ? "cursor-not-allowed opacity-40" : isActive ? "bg-[var(--gm-wash-strong)]" : "",
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
                                        <span className="min-w-0 flex-1 truncate">{optionRender ? optionRender(option) : option.label}</span>
                                        {!multi && isSelected ? <Check className="size-4 shrink-0" /> : null}
                                    </div>
                                );
                            })
                        )}
                        {canCreate ? (
                            <div
                                role="option"
                                aria-selected={false}
                                onClick={() => addTags(query.trim())}
                                className={cn("flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--gm-accent)]", cursor === enabled.length && "bg-[var(--gm-wash-strong)]")}
                            >
                                创建「{query.trim()}」
                            </div>
                        ) : null}
                    </div>
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}
