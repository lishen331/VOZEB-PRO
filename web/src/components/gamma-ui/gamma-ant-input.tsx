"use client";

/*
 * gamma-ui 的 antd 输入类兼容层：Input / Input.TextArea / Input.Search / Input.Password / InputNumber。
 * props 与 antd 同名同义；ref 形状也对齐（InputRef.input、TextAreaRef.resizableTextArea.textArea），
 * 已有的 focus / setSelectionRange 调用不用改。画布及其共享组件不使用本文件。
 */

import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, ReactNode, Ref, RefObject, TextareaHTMLAttributes } from "react";
import { useContext, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Search as SearchIcon, X } from "lucide-react";
import DisabledContext from "antd/es/config-provider/DisabledContext";
import { FormItemInputContext } from "antd/es/form/context";

import { cn } from "@/lib/utils";
import { CONTROL_TIER, controlItem, controlShell, type ControlSize } from "./gamma-control-scale";

type InputSize = ControlSize;
type Variant = "outlined" | "borderless" | "filled";

/** 高度/圆角/字号取自唯一刻度表（gamma-control-scale.ts），这里只保留各档的左右内边距 */
const SHELL_SIZE: Record<InputSize, string> = {
    small: controlShell("small", "px-2"),
    middle: controlShell("middle", "px-2.5"),
    large: controlShell("large", "px-3"),
};

/** 外框：描边 + 聚焦时品牌色描边与光圈；错误态走 --gm-danger */
export function gammaInputShellClass({ variant, status, disabled }: { variant: Variant; status?: string; disabled?: boolean }) {
    const error = status === "error";
    const warning = status === "warning";
    return cn(
        // ant-input 是补发的 antd 旧类名：global-*.css 的存量规则按它写
        "gm-input ant-input transition-[border-color,box-shadow,background-color] duration-200",
        variant === "borderless" ? "border border-transparent bg-transparent" : variant === "filled" ? "border border-transparent bg-[var(--gm-surface-2)]" : "border bg-[var(--gm-surface)]",
        variant !== "borderless" &&
            (error
                ? "border-[var(--gm-danger)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gm-danger)_18%,transparent)]"
                : warning
                  ? "border-[var(--gm-warning)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gm-warning)_18%,transparent)]"
                  : "border-[var(--gm-border-strong)] hover:border-[color-mix(in_srgb,var(--gm-accent)_55%,var(--gm-border-strong))] focus-within:border-[var(--gm-accent)] focus-within:shadow-[0_0_0_3px_var(--gm-accent-soft)]"),
        disabled && "cursor-not-allowed opacity-55",
    );
}

const FIELD = "min-w-0 flex-1 bg-transparent text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)] disabled:cursor-not-allowed";

/** Form.Item 校验态与禁用态，与 antd 一致从上下文读取 */
function useFieldContext(disabled?: boolean, status?: string) {
    const contextDisabled = useContext(DisabledContext);
    const formItem = useContext(FormItemInputContext);
    return { disabled: disabled ?? contextDisabled ?? false, status: status || formItem.status };
}

/** 受控 / 非受控统一：value 由外部给就用外部的，否则用内部状态（allowClear 和字数统计要用到当前值） */
function useFieldValue(value: unknown, defaultValue: unknown) {
    const [inner, setInner] = useState(() => (defaultValue === undefined || defaultValue === null ? "" : String(defaultValue)));
    const controlled = value !== undefined;
    return { current: controlled ? (value === null ? "" : String(value)) : inner, setInner, controlled };
}

/** allowClear 清空时合成一次 change 事件（target.value 为空串），让 Form.Item / 受控 onChange 都能收到 */
function emitClear<T extends HTMLInputElement | HTMLTextAreaElement>(element: T | null, onChange?: (event: ChangeEvent<T>) => void) {
    if (!element || !onChange) return;
    const previous = element.value;
    element.value = "";
    onChange({ target: element, currentTarget: element, type: "change" } as unknown as ChangeEvent<T>);
    // 受控组件由外部 value 决定显示；这里只为事件读值临时置空，避免与 React 状态打架
    element.value = previous;
}

function focusWithCursor(element: HTMLInputElement | HTMLTextAreaElement | null, options?: FocusOptions & { cursor?: "start" | "end" | "all" }) {
    if (!element) return;
    element.focus(options);
    const length = element.value.length;
    if (options?.cursor === "start") element.setSelectionRange(0, 0);
    else if (options?.cursor === "end") element.setSelectionRange(length, length);
    else if (options?.cursor === "all") element.select();
}

function ClearButton({ onClear, icon }: { onClear: () => void; icon?: ReactNode }) {
    return (
        <button
            type="button"
            tabIndex={-1}
            aria-label="清空"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
            className="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--gm-wash-heavy)] text-[var(--gm-text-2)] opacity-70 transition-opacity hover:opacity-100"
        >
            {icon ?? <X className="size-2.5" />}
        </button>
    );
}

/* ===== Input ===== */

export interface InputRef {
    input: HTMLInputElement | null;
    focus: (options?: FocusOptions & { cursor?: "start" | "end" | "all" }) => void;
    blur: () => void;
    select: () => void;
    setSelectionRange: (start: number, end: number, direction?: "forward" | "backward" | "none") => void;
    nativeElement: HTMLElement | null;
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
    size?: InputSize;
    prefix?: ReactNode;
    suffix?: ReactNode;
    addonBefore?: ReactNode;
    addonAfter?: ReactNode;
    allowClear?: boolean | { clearIcon?: ReactNode };
    showCount?: boolean;
    status?: "error" | "warning" | "";
    variant?: Variant;
    onPressEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
    /** allowClear 清空后回调（antd 同名 prop） */
    onClear?: () => void;
    rootClassName?: string;
    ref?: Ref<InputRef>;
}

function Addon({ children, side }: { children: ReactNode; side: "before" | "after" }) {
    return (
        <span
            className={cn(
                "gm-input-addon inline-flex shrink-0 items-center border border-[var(--gm-border-strong)] bg-[var(--gm-surface-2)] px-2.5 text-[13px] text-[var(--gm-text-2)]",
                side === "before" ? "-me-px rounded-s-[var(--gm-radius-sm)]" : "-ms-px rounded-e-[var(--gm-radius-sm)]",
            )}
        >
            {children}
        </span>
    );
}

/** 与 antd Input 同 API：prefix / suffix / addon / allowClear / showCount / onPressEnter / Form 校验态 */
function InputBase({
    size = "middle",
    prefix,
    suffix,
    addonBefore,
    addonAfter,
    allowClear,
    showCount,
    status,
    variant = "outlined",
    onPressEnter,
    onClear,
    onKeyDown,
    onChange,
    value,
    defaultValue,
    maxLength,
    disabled,
    className,
    style,
    rootClassName,
    ref,
    type = "text",
    ...rest
}: InputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const shellRef = useRef<HTMLSpanElement>(null);
    const field = useFieldContext(disabled, status);
    const state = useFieldValue(value, defaultValue);
    useImperativeHandle(ref, () => ({
        input: inputRef.current,
        focus: (options) => focusWithCursor(inputRef.current, options),
        blur: () => inputRef.current?.blur(),
        select: () => inputRef.current?.select(),
        setSelectionRange: (start, end, direction) => inputRef.current?.setSelectionRange(start, end, direction),
        nativeElement: shellRef.current,
    }));

    const grouped = Boolean(addonBefore || addonAfter);
    const clearable = Boolean(allowClear) && !field.disabled && !rest.readOnly;
    const shell = (
        <span
            ref={shellRef}
            style={grouped ? undefined : style}
            className={cn(
                gammaInputShellClass({ variant, status: field.status, disabled: field.disabled }),
                SHELL_SIZE[size],
                "group/input relative inline-flex w-full items-center gap-1.5",
                grouped && "z-[1] min-w-0 flex-1",
                addonBefore && "rounded-s-none",
                addonAfter && "rounded-e-none",
                !grouped && rootClassName,
            )}
            onMouseDown={(event) => {
                if (event.target !== inputRef.current && !(event.target as HTMLElement).closest("button")) {
                    event.preventDefault();
                    inputRef.current?.focus();
                }
            }}
        >
            {prefix ? <span className="gm-input-prefix inline-flex shrink-0 items-center text-[var(--gm-text-3)] transition-colors group-focus-within/input:text-[var(--gm-accent)] [&_svg]:size-[1.15em]">{prefix}</span> : null}
            <input
                {...rest}
                ref={inputRef}
                type={type}
                value={state.current}
                maxLength={maxLength}
                disabled={field.disabled}
                aria-invalid={field.status === "error" || undefined}
                onChange={(event) => {
                    if (!state.controlled) state.setInner(event.target.value);
                    onChange?.(event);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) onPressEnter?.(event);
                    onKeyDown?.(event);
                }}
                className={cn(FIELD, "self-stretch py-1", className)}
            />
            {clearable ? (
                state.current.length ? (
                    <ClearButton
                        icon={typeof allowClear === "object" ? allowClear.clearIcon : undefined}
                        onClear={() => {
                            if (!state.controlled) state.setInner("");
                            emitClear(inputRef.current, onChange);
                            onClear?.();
                            inputRef.current?.focus();
                        }}
                    />
                ) : (
                    <span aria-hidden className="size-4 shrink-0" />
                )
            ) : null}
            {showCount ? <span className="shrink-0 text-xs tabular-nums text-[var(--gm-text-3)]">{maxLength ? `${state.current.length} / ${maxLength}` : state.current.length}</span> : null}
            {suffix ? <span className="gm-input-suffix inline-flex shrink-0 items-center text-[var(--gm-text-3)] [&_svg]:size-[1.15em]">{suffix}</span> : null}
        </span>
    );
    if (!grouped) return shell;
    return (
        <span style={style} className={cn("gm-input-group ant-input-group-wrapper ant-input-wrapper inline-flex w-full items-stretch", rootClassName)}>
            {addonBefore ? <Addon side="before">{addonBefore}</Addon> : null}
            {shell}
            {addonAfter ? <Addon side="after">{addonAfter}</Addon> : null}
        </span>
    );
}

/* ===== TextArea ===== */

export interface TextAreaRef {
    resizableTextArea?: { textArea: HTMLTextAreaElement };
    focus: (options?: FocusOptions & { cursor?: "start" | "end" | "all" }) => void;
    blur: () => void;
    nativeElement: HTMLElement | null;
}

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
    autoSize?: boolean | { minRows?: number; maxRows?: number };
    showCount?: boolean;
    allowClear?: boolean | { clearIcon?: ReactNode };
    status?: "error" | "warning" | "";
    variant?: Variant;
    size?: InputSize;
    onPressEnter?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    rootClassName?: string;
    ref?: Ref<TextAreaRef>;
}

/** 输入框类没有固定高度，只取刻度表的圆角与字号；上下留白按档位单独给 */
const TEXTAREA_SIZE: Record<InputSize, string> = {
    small: `${CONTROL_TIER.small.radius} px-2 py-1 ${CONTROL_TIER.small.text}`,
    middle: `${CONTROL_TIER.middle.radius} px-2.5 py-1.5 ${CONTROL_TIER.middle.text} leading-[1.6]`,
    large: `${CONTROL_TIER.large.radius} px-3 py-2 ${CONTROL_TIER.large.text} leading-[1.6]`,
};

/** autoSize：按内容撑高，限制在 minRows ~ maxRows 之间（与 antd 行为一致） */
function useAutoSize(ref: RefObject<HTMLTextAreaElement | null>, autoSize: TextAreaProps["autoSize"], value: string) {
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element || !autoSize) return;
        const style = getComputedStyle(element);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
        const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        const { minRows = 1, maxRows } = typeof autoSize === "object" ? autoSize : {};
        element.style.height = "auto";
        const minHeight = minRows * lineHeight + chrome;
        const maxHeight = maxRows ? maxRows * lineHeight + chrome : Infinity;
        const target = Math.min(Math.max(element.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth), minHeight), maxHeight);
        element.style.height = `${target}px`;
        element.style.overflowY = element.scrollHeight + 1 > target ? "auto" : "hidden";
    }, [autoSize, ref, value]);
}

/** 与 antd Input.TextArea 同 API：autoSize / rows / showCount / allowClear / onPressEnter；ref.resizableTextArea.textArea 可用 */
function TextArea({ autoSize, showCount, allowClear, status, variant = "outlined", size = "middle", onPressEnter, onKeyDown, onChange, value, defaultValue, maxLength, disabled, className, style, rootClassName, ref, ...rest }: TextAreaProps) {
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLSpanElement>(null);
    const field = useFieldContext(disabled, status);
    const state = useFieldValue(value, defaultValue);
    useAutoSize(textAreaRef, autoSize, state.current);
    useImperativeHandle(ref, () => ({
        resizableTextArea: textAreaRef.current ? { textArea: textAreaRef.current } : undefined,
        focus: (options) => focusWithCursor(textAreaRef.current, options),
        blur: () => textAreaRef.current?.blur(),
        nativeElement: wrapperRef.current ?? textAreaRef.current,
    }));
    const clearable = Boolean(allowClear) && !field.disabled && !rest.readOnly;
    const wrapped = Boolean(showCount || clearable);
    const textArea = (
        <textarea
            {...rest}
            ref={textAreaRef}
            value={state.current}
            maxLength={maxLength}
            disabled={field.disabled}
            aria-invalid={field.status === "error" || undefined}
            onChange={(event) => {
                if (!state.controlled) state.setInner(event.target.value);
                onChange?.(event);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) onPressEnter?.(event);
                onKeyDown?.(event);
            }}
            style={wrapped ? undefined : style}
            className={cn(
                gammaInputShellClass({ variant, status: field.status, disabled: field.disabled }),
                TEXTAREA_SIZE[size],
                "block w-full resize-y text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)] focus:border-[var(--gm-accent)] focus:shadow-[0_0_0_3px_var(--gm-accent-soft)]",
                variant === "borderless" && "focus:border-transparent focus:shadow-none",
                autoSize && "resize-none",
                clearable && "pe-7",
                !wrapped && className,
                !wrapped && rootClassName,
            )}
        />
    );
    if (!wrapped) return textArea;
    return (
        <span ref={wrapperRef} style={style} className={cn("gm-textarea relative block w-full", className, rootClassName)}>
            {textArea}
            {clearable && state.current.length ? (
                <span className="absolute end-2 top-2">
                    <ClearButton
                        icon={typeof allowClear === "object" ? allowClear.clearIcon : undefined}
                        onClear={() => {
                            if (!state.controlled) state.setInner("");
                            emitClear(textAreaRef.current, onChange);
                            textAreaRef.current?.focus();
                        }}
                    />
                </span>
            ) : null}
            {showCount ? <span className="mt-1 block text-end text-xs tabular-nums text-[var(--gm-text-3)]">{maxLength ? `${state.current.length} / ${maxLength}` : state.current.length}</span> : null}
        </span>
    );
}

/* ===== Search / Password ===== */

export interface SearchProps extends InputProps {
    onSearch?: (value: string, event?: unknown, info?: { source?: "input" | "clear" }) => void;
    /** true 显示放大镜主按钮；字符串 / 节点作为按钮文字 */
    enterButton?: ReactNode;
    loading?: boolean;
}

/** 与 antd Input.Search 同 API：回车或点按钮触发 onSearch；清空也会以空串触发一次 */
function Search({ onSearch, enterButton = false, loading = false, onPressEnter, onChange, size = "middle", disabled, value, defaultValue, ref, ...rest }: SearchProps) {
    const innerRef = useRef<InputRef>(null);
    useImperativeHandle(ref, () => innerRef.current as InputRef);
    const field = useFieldContext(disabled);
    const state = useFieldValue(value, defaultValue);
    const search = (source: "input" | "clear") => onSearch?.(source === "clear" ? "" : (innerRef.current?.input?.value ?? state.current), undefined, { source });
    const buttonHeight = controlItem(size, size === "large" ? "px-4" : size === "small" ? "px-2" : "px-3");
    const button = enterButton ? (
        <button
            type="button"
            disabled={field.disabled || loading}
            aria-busy={loading || undefined}
            aria-label={typeof enterButton === "string" ? enterButton : "搜索"}
            onClick={() => search("input")}
            className={cn(
                "gm-input-search-button ant-input-search-button ant-input-search-btn inline-flex shrink-0 items-center justify-center gap-1.5 rounded-e-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] font-medium whitespace-nowrap text-white transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55",
                buttonHeight,
            )}
        >
            {loading ? <Loader2 aria-hidden className="size-[1.1em] animate-spin" /> : enterButton === true ? <SearchIcon className="size-[1.1em]" /> : null}
            {enterButton === true ? null : enterButton}
        </button>
    ) : null;
    return (
        <InputBase
            {...rest}
            ref={innerRef}
            size={size}
            disabled={field.disabled}
            value={state.controlled ? state.current : undefined}
            defaultValue={state.controlled ? undefined : defaultValue}
            onChange={(event) => {
                if (!state.controlled) state.setInner(event.target.value);
                onChange?.(event);
            }}
            // antd：点清空按钮时以 source=clear 触发一次搜索
            onClear={() => search("clear")}
            onPressEnter={(event) => {
                onPressEnter?.(event);
                search("input");
            }}
            suffix={
                enterButton ? undefined : (
                    <button type="button" tabIndex={-1} aria-label="搜索" disabled={field.disabled} onClick={() => search("input")} className="inline-flex text-[var(--gm-text-3)] transition-colors hover:text-[var(--gm-accent)]">
                        {loading ? <Loader2 className="size-[1.15em] animate-spin" /> : <SearchIcon className="size-[1.15em]" />}
                    </button>
                )
            }
            addonAfter={button ? <span className="contents">{button}</span> : undefined}
            rootClassName={cn("gm-input-search", rest.rootClassName)}
        />
    );
}

/** 与 antd Input.Password 同 API：右侧眼睛切换明文 */
function Password({ ref, suffix, ...rest }: InputProps) {
    const [visible, setVisible] = useState(false);
    return (
        <InputBase
            {...rest}
            ref={ref}
            type={visible ? "text" : "password"}
            suffix={
                <>
                    {suffix}
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-label={visible ? "隐藏密码" : "显示密码"}
                        aria-pressed={visible}
                        onClick={() => setVisible((value) => !value)}
                        className="inline-flex text-[var(--gm-text-3)] transition-colors hover:text-[var(--gm-text)]"
                    >
                        {visible ? <Eye className="size-[1.15em]" /> : <EyeOff className="size-[1.15em]" />}
                    </button>
                </>
            }
        />
    );
}

export const Input = Object.assign(InputBase, { TextArea, Search, Password });

/* ===== InputNumber ===== */

export interface InputNumberProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> {
    value?: number | null;
    defaultValue?: number | null;
    onChange?: (value: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    size?: InputSize;
    prefix?: ReactNode;
    suffix?: ReactNode;
    addonBefore?: ReactNode;
    addonAfter?: ReactNode;
    status?: "error" | "warning" | "";
    variant?: Variant;
    onPressEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
    rootClassName?: string;
    ref?: Ref<InputRef>;
}

const clampNumber = (value: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
const roundTo = (value: number, precision?: number) => (precision === undefined ? value : Number(value.toFixed(precision)));
const formatNumber = (value: number | null | undefined, precision?: number) => (value === null || value === undefined || Number.isNaN(value) ? "" : precision === undefined ? String(value) : value.toFixed(precision));

/**
 * 与 antd InputNumber 同 API：输入时只回调可解析的数字（空串回调 null），失焦时按 min / max / precision 规整；
 * 右侧上下步进按钮，键盘 ↑↓ 按 step 增减。
 */
export function InputNumber({ value, defaultValue, onChange, min, max, step = 1, precision, disabled, onBlur, onKeyDown, className, ref, ...rest }: InputNumberProps) {
    const field = useFieldContext(disabled, rest.status);
    const controlled = value !== undefined;
    const [inner, setInner] = useState<number | null>(defaultValue ?? null);
    const numeric = controlled ? (value ?? null) : inner;
    const [draft, setDraft] = useState<string | null>(null);
    const text = draft ?? formatNumber(numeric, precision);

    const commit = (next: number | null) => {
        if (!controlled) setInner(next);
        if (next !== numeric) onChange?.(next);
    };
    const stepBy = (direction: 1 | -1) => {
        const base = numeric ?? (min !== undefined && min > 0 ? min : 0);
        commit(roundTo(clampNumber(base + direction * step, min, max), precision ?? (String(step).split(".")[1]?.length || undefined)));
        setDraft(null);
    };
    const stepper = "grid h-1/2 w-5 place-items-center text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-accent)] disabled:pointer-events-none disabled:opacity-35";
    return (
        <InputBase
            {...rest}
            ref={ref}
            type="text"
            inputMode={precision === 0 ? "numeric" : "decimal"}
            role="spinbutton"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={numeric ?? undefined}
            disabled={field.disabled}
            value={text}
            className={cn("tabular-nums", className)}
            rootClassName={cn("gm-input-number group/num pe-0", rest.rootClassName)}
            onChange={(event) => {
                const raw = event.target.value;
                setDraft(raw);
                if (raw.trim() === "") return commit(null);
                const parsed = Number(raw);
                if (!Number.isNaN(parsed) && /^-?\d*\.?\d*$/.test(raw.trim())) commit(parsed);
            }}
            onBlur={(event) => {
                if (draft !== null) {
                    const parsed = draft.trim() === "" ? null : Number(draft);
                    commit(parsed === null || Number.isNaN(parsed) ? (parsed === null ? null : numeric) : roundTo(clampNumber(parsed, min, max), precision));
                    setDraft(null);
                }
                onBlur?.(event);
            }}
            onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    stepBy(event.key === "ArrowUp" ? 1 : -1);
                }
                onKeyDown?.(event);
            }}
            suffix={
                <>
                    {rest.suffix}
                    <span className="ms-1 flex h-[calc(100%+2px)] -me-px flex-col self-stretch overflow-hidden rounded-e-[inherit] border-s border-[var(--gm-border)] opacity-0 transition-opacity group-hover/num:opacity-100 group-focus-within/num:opacity-100">
                        <button type="button" tabIndex={-1} aria-label="增加" disabled={field.disabled || (max !== undefined && (numeric ?? -Infinity) >= max)} onMouseDown={(event) => event.preventDefault()} onClick={() => stepBy(1)} className={stepper}>
                            <ChevronUp className="size-3" />
                        </button>
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-label="减少"
                            disabled={field.disabled || (min !== undefined && (numeric ?? Infinity) <= min)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => stepBy(-1)}
                            className={cn(stepper, "border-t border-[var(--gm-border)]")}
                        >
                            <ChevronDown className="size-3" />
                        </button>
                    </span>
                </>
            }
        />
    );
}
