"use client";

/*
 * gamma-ui 的 antd 兼容层：外观走布鲁伽马设计系统，props 与 antd 同名同义。
 * 页面只把 `from "antd"` 里的这几个组件改成从这里导入，调用处逻辑不动。
 *
 * - 只覆盖页面实际用到的 props（统计见 过程文件/bluegamma-rollout/survey-props.mjs）
 * - 结构类名用 gm-*（如 .gm-btn / .gm-segmented-item），供页面 className 和 e2e 定位
 * - 画布及其共享组件不使用本文件（canvas-isolation.test.ts 守护）
 */

import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode, Ref } from "react";
import { Children, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, Loader2, XCircle } from "lucide-react";
import DisabledContext from "antd/es/config-provider/DisabledContext";

import { cn } from "@/lib/utils";
import { controlBox, controlItem, controlSquare, type ControlSize } from "./gamma-control-scale";

/** antd 把纯文本子节点包一层 span；保留同样的结构，现有断言与样式钩子不受影响 */
function wrapText(children: ReactNode) {
    return Children.map(children, (child) => (typeof child === "string" || typeof child === "number" ? <span>{child}</span> : child));
}

/** 与 antd 一致：Form disabled 等上下文禁用对子控件生效 */
function useMergedDisabled(disabled?: boolean) {
    const contextDisabled = useContext(DisabledContext);
    return disabled ?? contextDisabled ?? false;
}

const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/* ===== Button ===== */

type ButtonType = "primary" | "default" | "dashed" | "text" | "link";

const BUTTON_BASE =
    "gm-btn relative inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none outline-none transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--gm-bg)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

/** 高度/圆角/字号取自唯一刻度表（gamma-control-scale.ts），这里只保留各档的左右内边距 */
const BUTTON_SIZE: Record<ControlSize, { box: string; square: string }> = {
    small: { box: controlBox("small", "px-3"), square: controlSquare("small") },
    middle: { box: controlBox("middle", "px-3.5"), square: controlSquare("middle") },
    large: { box: controlBox("large", "px-5"), square: controlSquare("large") },
};

function buttonVariant(type: ButtonType, danger: boolean) {
    if (danger) {
        if (type === "primary") return "border border-transparent bg-[var(--gm-danger)] text-white hover:brightness-110";
        if (type === "text") return "border border-transparent text-[var(--gm-danger)] hover:bg-[color-mix(in_srgb,var(--gm-danger)_10%,transparent)]";
        if (type === "link") return "border border-transparent text-[var(--gm-danger)] hover:opacity-80";
        return cn(
            "border bg-transparent text-[var(--gm-danger)] border-[color-mix(in_srgb,var(--gm-danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--gm-danger)_8%,transparent)] hover:border-[var(--gm-danger)]",
            type === "dashed" && "border-dashed",
        );
    }
    switch (type) {
        case "primary":
            // 1px 透明边框是占位（让各变体尺寸一致），但 background-origin 默认 padding-box、
            // background-repeat 默认 repeat，渐变会被平铺进那圈边框：左缘露出贴片尾色（青）、
            // 右缘露出贴片头色（蓝），两边各多出一条异色竖线。
            // 渲染起点改到 border-box 由 .gm-btn-primary 统一处理（见 gamma-tokens.css）。
            return "border border-transparent bg-[image:var(--gm-gradient)] text-white shadow-[var(--gm-glow-blue)] hover:shadow-[0_10px_30px_rgba(0,80,245,0.5)] hover:brightness-110";
        case "text":
            return "border border-transparent text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]";
        case "link":
            return "border border-transparent text-[var(--gm-blue-text)] hover:opacity-80";
        case "dashed":
            return "border border-dashed border-[var(--gm-border-strong)] bg-transparent text-[var(--gm-text)] hover:border-[var(--gm-accent)] hover:text-[var(--gm-accent)]";
        default:
            return "border border-[var(--gm-border-strong)] bg-[var(--gm-wash)] text-[var(--gm-text)] hover:border-[var(--gm-accent)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-accent)]";
    }
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
    type?: ButtonType;
    htmlType?: "button" | "submit" | "reset";
    size?: ControlSize;
    shape?: "default" | "circle" | "round";
    icon?: ReactNode;
    iconPlacement?: "start" | "end";
    loading?: boolean | { delay?: number };
    danger?: boolean;
    block?: boolean;
    href?: string;
    target?: string;
    rel?: string;
    download?: boolean | string;
    ref?: Ref<HTMLButtonElement & HTMLAnchorElement>;
}

/** 与 antd Button 同 API：type / size / shape / icon / loading / danger / block / href */
export function Button({
    type = "default",
    htmlType = "button",
    size = "middle",
    shape = "default",
    icon,
    iconPlacement = "start",
    loading = false,
    danger = false,
    block = false,
    href,
    target,
    rel,
    download,
    disabled,
    className,
    children,
    onClick,
    ref,
    ...rest
}: ButtonProps) {
    const mergedDisabled = useMergedDisabled(disabled);
    const isLoading = typeof loading === "object" ? true : loading;
    const hasChildren = Children.toArray(children).length > 0;
    const iconOnly = !hasChildren && Boolean(icon || isLoading);
    const sizing = BUTTON_SIZE[size];
    const iconNode = isLoading ? <Loader2 aria-hidden className="size-[1.1em] animate-spin" /> : icon;
    // 末尾补发 antd 旧类名：global-*.css 里大量存量规则按 .ant-btn / .ant-btn-primary 写，
    // 与 Modal/Drawer/Dropdown 保留 .ant-* 是同一个约定（也是既有 e2e 选择器的依赖）。
    const classes = cn(
        BUTTON_BASE,
        iconOnly ? sizing.square : sizing.box,
        (shape === "circle" || shape === "round") && "rounded-full",
        buttonVariant(type, danger),
        block && "flex w-full",
        isLoading && "cursor-progress",
        `gm-btn-${type}`,
        "ant-btn",
        `ant-btn-${type}`,
        iconOnly && "ant-btn-icon-only",
        mergedDisabled && "ant-btn-disabled",
        className,
    );
    const content = (
        <>
            {iconNode && iconPlacement !== "end" ? <span className="gm-btn-icon inline-flex shrink-0 items-center">{iconNode}</span> : null}
            {wrapText(children)}
            {iconNode && iconPlacement === "end" ? <span className="gm-btn-icon inline-flex shrink-0 items-center">{iconNode}</span> : null}
        </>
    );
    const handleClick = (event: MouseEvent<HTMLButtonElement & HTMLAnchorElement>) => {
        if (isLoading || mergedDisabled) {
            event.preventDefault();
            return;
        }
        onClick?.(event);
    };

    if (href !== undefined) {
        return (
            <a
                {...(rest as HTMLAttributes<HTMLAnchorElement>)}
                ref={ref}
                href={mergedDisabled ? undefined : href}
                target={target}
                rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
                download={download}
                aria-disabled={mergedDisabled || undefined}
                aria-busy={isLoading || undefined}
                onClick={handleClick}
                className={classes}
            >
                {content}
            </a>
        );
    }
    return (
        <button {...rest} ref={ref} type={htmlType} disabled={mergedDisabled} aria-busy={isLoading || undefined} onClick={handleClick} className={classes}>
            {content}
        </button>
    );
}

/* ===== Tag ===== */

/** antd 预设色 → gamma 色板；状态色走 --gm-success/warning/danger，其余用固定色相 */
const TAG_COLOR: Record<string, string> = {
    success: "var(--gm-success)",
    green: "var(--gm-success)",
    processing: "var(--gm-blue-text)",
    blue: "var(--gm-blue-text)",
    geekblue: "var(--gm-blue-text)",
    cyan: "var(--gm-accent)",
    warning: "var(--gm-warning)",
    orange: "var(--gm-warning)",
    gold: "var(--gm-warning)",
    yellow: "var(--gm-warning)",
    error: "var(--gm-danger)",
    red: "var(--gm-danger)",
    volcano: "var(--gm-danger)",
    magenta: "#e0479e",
    purple: "#8b5cf6",
    lime: "#65a30d",
};

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
    color?: string;
    icon?: ReactNode;
    bordered?: boolean;
}

/** 与 antd Tag 同 API：color 支持预设名、状态名和任意 CSS 颜色 */
export function Tag({ color, icon, bordered = true, className, style, children, ...rest }: TagProps) {
    const tone = color && color !== "default" ? (TAG_COLOR[color] ?? color) : undefined;
    const toneStyle: CSSProperties | undefined = tone ? { color: tone, backgroundColor: tint(tone, 12), borderColor: bordered ? tint(tone, 28) : "transparent" } : undefined;
    return (
        <span
            {...rest}
            style={{ ...toneStyle, ...style }}
            className={cn(
                "gm-tag inline-flex h-[22px] max-w-full items-center gap-1 rounded-full border px-2 align-middle text-xs leading-none whitespace-nowrap",
                !tone && cn("bg-[var(--gm-wash)] text-[var(--gm-text-2)]", bordered ? "border-[var(--gm-border)]" : "border-transparent"),
                className,
            )}
        >
            {icon ? <span className="inline-flex shrink-0 items-center [&_svg]:size-3">{icon}</span> : null}
            {wrapText(children)}
        </span>
    );
}

export interface CheckableTagProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onChange"> {
    checked?: boolean;
    onChange?: (checked: boolean) => void;
}

/** 与 antd Tag.CheckableTag 同 API：点击切换选中态的筛选标签 */
function CheckableTag({ checked = false, onChange, className, children, onClick, ...rest }: CheckableTagProps) {
    return (
        <span
            {...rest}
            role="checkbox"
            aria-checked={checked}
            onClick={(event) => {
                onChange?.(!checked);
                onClick?.(event);
            }}
            className={cn(
                "gm-tag-checkable ant-tag-checkable inline-flex h-[22px] max-w-full cursor-pointer items-center gap-1 rounded-full border px-2 align-middle text-xs leading-none whitespace-nowrap transition-colors",
                checked ? "border-[var(--gm-brand)] bg-[var(--gm-brand)]/12 text-[var(--gm-brand)]" : "border-[var(--gm-border)] bg-[var(--gm-wash)] text-[var(--gm-text-2)] hover:border-[var(--gm-brand)]/40",
                className,
            )}
        >
            {wrapText(children)}
        </span>
    );
}

Tag.CheckableTag = CheckableTag;

/* ===== Segmented ===== */

type SegmentedValue = string | number;
export type SegmentedOption<T extends SegmentedValue = SegmentedValue> = T | { value: T; label?: ReactNode; icon?: ReactNode; disabled?: boolean; title?: string; className?: string };

export interface SegmentedProps<T extends SegmentedValue = SegmentedValue> {
    options: readonly SegmentedOption<T>[];
    value?: T;
    defaultValue?: T;
    onChange?: (value: T) => void;
    block?: boolean;
    disabled?: boolean;
    size?: ControlSize;
    className?: string;
    id?: string;
    "aria-label"?: string;
}

/** 与 antd Segmented 同 API；选中块为品牌浅底，可受控（含 Form.Item 注入）也可非受控 */
export function Segmented<T extends SegmentedValue = SegmentedValue>({ options, value, defaultValue, onChange, block = false, disabled, size = "middle", className, id, "aria-label": ariaLabel }: SegmentedProps<T>) {
    const mergedDisabled = useMergedDisabled(disabled);
    const normalized = options.map((option) => (typeof option === "object" ? option : { value: option, label: String(option) }));
    const [inner, setInner] = useState<T | undefined>(defaultValue ?? normalized[0]?.value);
    const current = value !== undefined ? value : inner;
    const select = (next: T) => {
        if (next === current) return;
        setInner(next);
        onChange?.(next);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const enabled = normalized.filter((option) => !option.disabled);
        const index = enabled.findIndex((option) => option.value === current);
        const next = enabled[(index + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
        if (!next) return;
        event.preventDefault();
        select(next.value);
        event.currentTarget.querySelector<HTMLElement>(`[data-value="${String(next.value)}"]`)?.focus();
    };
    const itemHeight = controlItem(size, size === "large" ? "px-4" : size === "small" ? "px-2.5" : "px-3");
    return (
        <div
            id={id}
            role="radiogroup"
            aria-label={ariaLabel}
            aria-disabled={mergedDisabled || undefined}
            onKeyDown={onKeyDown}
            className={cn(
                "gm-segmented ant-segmented max-w-full gap-0.5 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] p-[3px] ring-1 ring-inset ring-[var(--gm-border)]",
                block ? "flex w-full" : "inline-flex",
                mergedDisabled && "opacity-50",
                className,
            )}
        >
            {normalized.map((option) => {
                const active = option.value === current;
                const itemDisabled = mergedDisabled || option.disabled;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-value={String(option.value)}
                        title={option.title}
                        tabIndex={active ? 0 : -1}
                        disabled={itemDisabled}
                        onClick={() => select(option.value)}
                        className={cn(
                            "gm-segmented-item inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[var(--gm-radius-sm)] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] disabled:cursor-not-allowed",
                            itemHeight,
                            block && "flex-1",
                            active
                                ? "gm-segmented-item-selected bg-[var(--gm-surface)] text-[var(--gm-text)] shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--gm-accent-ring)]"
                                : "text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] disabled:hover:bg-transparent disabled:opacity-50",
                            option.className,
                        )}
                    >
                        {option.icon ? <span className="inline-flex shrink-0 items-center [&_svg]:size-3.5">{option.icon}</span> : null}
                        <span className="gm-segmented-item-label min-w-0 truncate">{option.label ?? String(option.value)}</span>
                    </button>
                );
            })}
        </div>
    );
}

/* ===== Switch / Checkbox ===== */

export interface SwitchProps {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean, event: MouseEvent<HTMLButtonElement>) => void;
    onClick?: (checked: boolean, event: MouseEvent<HTMLButtonElement>) => void;
    loading?: boolean;
    disabled?: boolean;
    size?: "small" | "default";
    checkedChildren?: ReactNode;
    unCheckedChildren?: ReactNode;
    className?: string;
    id?: string;
    "aria-label"?: string;
}

/** 与 antd Switch 同 API；开启为品牌蓝 + 辉光 */
export function Switch({ checked, defaultChecked = false, onChange, onClick, loading = false, disabled, size = "default", checkedChildren, unCheckedChildren, className, id, "aria-label": ariaLabel }: SwitchProps) {
    const mergedDisabled = useMergedDisabled(disabled);
    const [inner, setInner] = useState(defaultChecked);
    const on = checked ?? inner;
    const small = size === "small";
    const label = on ? checkedChildren : unCheckedChildren;
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={ariaLabel}
            aria-busy={loading || undefined}
            disabled={mergedDisabled || loading}
            onClick={(event) => {
                const next = !on;
                setInner(next);
                onChange?.(next, event);
                onClick?.(next, event);
            }}
            className={cn(
                "gm-switch relative inline-flex shrink-0 items-center rounded-full p-0.5 align-middle transition-[background-color,box-shadow] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--gm-bg)] disabled:cursor-not-allowed disabled:opacity-50",
                small ? "h-4 min-w-7" : "h-[22px] min-w-11",
                on ? "gm-switch-checked bg-[var(--gm-blue)] shadow-[0_0_12px_rgba(0,80,245,0.45)]" : "bg-[var(--gm-surface-3)] ring-1 ring-inset ring-[var(--gm-border-strong)]",
                className,
            )}
        >
            {label ? <span className={cn("pointer-events-none whitespace-nowrap text-white", small ? "text-[10px]" : "text-xs", on ? "ps-1.5 pe-5" : "ps-5 pe-1.5 text-[var(--gm-text-2)]")}>{label}</span> : null}
            <span
                className={cn(
                    "absolute top-0.5 grid place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-[inset-inline-start] duration-300 ease-[var(--gm-ease,ease)]",
                    small ? "size-3" : "size-[18px]",
                    on ? (small ? "start-[calc(100%-14px)]" : "start-[calc(100%-20px)]") : "start-0.5",
                )}
            >
                {loading ? <Loader2 aria-hidden className={cn("animate-spin text-[var(--gm-blue)]", small ? "size-2" : "size-3")} /> : null}
            </span>
        </button>
    );
}

export interface CheckboxChangeEvent {
    target: { checked: boolean; value?: unknown };
    nativeEvent: Event;
    stopPropagation: () => void;
    preventDefault: () => void;
}

export interface CheckboxProps {
    checked?: boolean;
    defaultChecked?: boolean;
    indeterminate?: boolean;
    onChange?: (event: CheckboxChangeEvent) => void;
    disabled?: boolean;
    value?: unknown;
    /** 原生表单字段名：放在 <form> 里提交时带上它（antd 同名） */
    name?: string;
    required?: boolean;
    className?: string;
    id?: string;
    children?: ReactNode;
    "aria-label"?: string;
}

/** 与 antd Checkbox 同 API；onChange 回调 event.target.checked */
export function Checkbox({ checked, defaultChecked = false, indeterminate = false, onChange, disabled, value, name, required, className, id, children, "aria-label": ariaLabel }: CheckboxProps) {
    const mergedDisabled = useMergedDisabled(disabled);
    const [inner, setInner] = useState(defaultChecked);
    const on = checked ?? inner;
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setInner(event.target.checked);
        onChange?.({ target: { checked: event.target.checked, value }, nativeEvent: event.nativeEvent, stopPropagation: () => event.stopPropagation(), preventDefault: () => event.preventDefault() });
    };
    return (
        <label className={cn("gm-checkbox-wrapper group/cb inline-flex items-start gap-2 align-middle text-sm text-[var(--gm-text-2)]", mergedDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-[var(--gm-text)]", className)}>
            <input ref={inputRef} id={id} type="checkbox" name={name} required={required} className="peer sr-only" checked={on} disabled={mergedDisabled} aria-label={ariaLabel} aria-checked={indeterminate ? "mixed" : on} onChange={handleChange} />
            <span
                aria-hidden
                className={cn(
                    "gm-checkbox mt-[0.15em] grid size-4 shrink-0 place-items-center rounded-[5px] border transition-[background-color,border-color,box-shadow] duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--gm-accent)]",
                    on || indeterminate ? "gm-checkbox-checked border-[var(--gm-blue)] bg-[var(--gm-blue)] shadow-[0_0_8px_rgba(0,80,245,0.35)]" : "border-[var(--gm-border-strong)] bg-[var(--gm-surface)] group-hover/cb:border-[var(--gm-accent)]",
                )}
            >
                {indeterminate ? (
                    <span className="h-0.5 w-2 rounded-full bg-white" />
                ) : (
                    <svg viewBox="0 0 24 24" className={cn("size-3 transition-opacity duration-150", on ? "opacity-100" : "opacity-0")} fill="none" stroke="white" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                )}
            </span>
            {children !== undefined && children !== null ? <span className="min-w-0 leading-[1.4]">{children}</span> : null}
        </label>
    );
}

export interface CheckboxOption {
    label: ReactNode;
    value: string | number;
    disabled?: boolean;
}

export interface CheckboxGroupProps {
    options?: readonly (CheckboxOption | string | number)[];
    value?: readonly (string | number)[];
    defaultValue?: readonly (string | number)[];
    onChange?: (value: (string | number)[]) => void;
    disabled?: boolean;
    className?: string;
}

function normalizeCheckboxOption(option: CheckboxOption | string | number): CheckboxOption {
    return typeof option === "object" ? option : { label: String(option), value: option };
}

/** 与 antd Checkbox.Group 同 API；options 支持字符串/数字简写，onChange 回调新的 value 数组 */
function CheckboxGroup({ options = [], value, defaultValue, onChange, disabled, className }: CheckboxGroupProps) {
    const [inner, setInner] = useState<readonly (string | number)[]>(defaultValue ?? []);
    const checkedValues = value ?? inner;
    const checkedSet = new Set(checkedValues);

    const toggle = (optionValue: string | number, checked: boolean) => {
        const next = checked ? [...checkedValues, optionValue] : checkedValues.filter((item) => item !== optionValue);
        setInner(next);
        onChange?.(next);
    };

    return (
        <div className={cn("gm-checkbox-group flex flex-wrap gap-x-4 gap-y-2", className)}>
            {options.map((rawOption) => {
                const option = normalizeCheckboxOption(rawOption);
                return (
                    <Checkbox key={option.value} checked={checkedSet.has(option.value)} disabled={disabled || option.disabled} onChange={(event) => toggle(option.value, event.target.checked)}>
                        {option.label}
                    </Checkbox>
                );
            })}
        </div>
    );
}

Checkbox.Group = CheckboxGroup;

/* ===== Spin / Empty / Alert ===== */

const SPIN_SIZE = { small: "size-3.5 border-[1.5px]", default: "size-5 border-2", large: "size-8 border-[2.5px]" } as const;

function SpinRing({ size = "default" }: { size?: keyof typeof SPIN_SIZE }) {
    return <span aria-hidden className={cn("inline-block animate-spin rounded-full border-[var(--gm-accent-soft)] border-t-[var(--gm-accent)] [animation-duration:0.8s]", SPIN_SIZE[size])} />;
}

export interface SpinProps {
    spinning?: boolean;
    size?: keyof typeof SPIN_SIZE;
    description?: ReactNode;
    className?: string;
    children?: ReactNode;
}

/** 与 antd Spin 同 API：无 children 时是独立加载指示；有 children 时包住内容并在加载时盖一层 */
export function Spin({ spinning = true, size = "default", description, className, children }: SpinProps) {
    const indicator = (
        <span role="status" aria-live="polite" className="gm-spin inline-flex flex-col items-center justify-center gap-2 text-xs text-[var(--gm-text-3)]">
            <SpinRing size={size} />
            {description ? <span>{description}</span> : <span className="sr-only">加载中</span>}
        </span>
    );
    if (children === undefined) return spinning ? <span className={cn("gm-spin-spinning inline-flex", className)}>{indicator}</span> : null;
    return (
        <div className={cn("relative", className)} aria-busy={spinning || undefined}>
            <div className={cn("transition-opacity duration-200", spinning && "pointer-events-none opacity-45 select-none")}>{children}</div>
            {spinning ? <div className="gm-spin-spinning absolute inset-0 z-[4] flex max-h-[400px] items-center justify-center">{indicator}</div> : null}
        </div>
    );
}

export interface EmptyProps {
    description?: ReactNode;
    /** antd 的 PRESENTED_IMAGE_SIMPLE 或自定义节点；null 表示不要图标 */
    image?: ReactNode;
    className?: string;
    children?: ReactNode;
}

const EMPTY_SIMPLE = "gm-empty-simple";

/** 与 antd Empty 同 API；默认图换成品牌图标块 + 光晕 */
export function Empty({ description = "暂无数据", image, className, children }: EmptyProps) {
    const simple = image === EMPTY_SIMPLE;
    const icon =
        image === null || image === false ? null : image === undefined || simple ? (
            <span className={cn("relative grid place-items-center rounded-[10px] bg-[var(--gm-blue-soft)] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]", simple ? "size-8 [&_svg]:size-4" : "size-10 [&_svg]:size-5")}>
                <Inbox />
            </span>
        ) : (
            <span className="relative">{image}</span>
        );
    return (
        <div className={cn("gm-empty relative flex flex-col items-center justify-center gap-2 py-6 text-center", className)}>
            {icon ? <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--gm-blue)] opacity-10 blur-2xl" /> : null}
            {icon}
            {description ? <div className="relative text-xs leading-5 text-[var(--gm-text-3)]">{description}</div> : null}
            {children ? <div className="relative mt-2">{children}</div> : null}
        </div>
    );
}
Empty.PRESENTED_IMAGE_SIMPLE = EMPTY_SIMPLE as ReactNode;
Empty.PRESENTED_IMAGE_DEFAULT = undefined as ReactNode;

type AlertType = "success" | "info" | "warning" | "error";

const ALERT_TONE: Record<AlertType, { color: string; icon: ReactNode }> = {
    success: { color: "var(--gm-success)", icon: <CheckCircle2 /> },
    info: { color: "var(--gm-blue-text)", icon: <Info /> },
    warning: { color: "var(--gm-warning)", icon: <AlertTriangle /> },
    error: { color: "var(--gm-danger)", icon: <XCircle /> },
};

export interface AlertProps {
    type?: AlertType;
    /** antd v5 写法 */
    message?: ReactNode;
    /** antd v6 写法，与 message 等价 */
    title?: ReactNode;
    description?: ReactNode;
    showIcon?: boolean;
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
    style?: CSSProperties;
}

/** 与 antd Alert 同 API：左侧色条 + 浅色底，状态色走 gamma token */
export function Alert({ type = "info", message, title, description, showIcon = false, icon, action, className, style }: AlertProps) {
    const tone = ALERT_TONE[type];
    const heading = title ?? message;
    return (
        <div
            role="alert"
            style={{ borderColor: tint(tone.color, 30), backgroundColor: tint(tone.color, 8), ...style }}
            className={cn("gm-alert relative flex items-start gap-2.5 overflow-hidden rounded-[var(--gm-radius)] border px-3.5 py-2.5 text-[13px] leading-5 text-[var(--gm-text)]", description ? "py-3" : undefined, className)}
        >
            <span aria-hidden className="absolute inset-y-0 start-0 w-[3px]" style={{ backgroundColor: tone.color }} />
            {showIcon ? (
                <span aria-hidden className={cn("mt-px inline-flex shrink-0", description ? "[&_svg]:size-[18px]" : "[&_svg]:size-4")} style={{ color: tone.color }}>
                    {icon ?? tone.icon}
                </span>
            ) : null}
            <div className="min-w-0 flex-1">
                {heading ? <div className={cn(description && "font-medium")}>{heading}</div> : null}
                {description ? <div className={cn("text-[var(--gm-text-2)]", heading && "mt-0.5")}>{description}</div> : null}
            </div>
            {action ? <div className="shrink-0 self-center">{action}</div> : null}
        </div>
    );
}

/* ===== Pagination ===== */

/** 页码列表：当前页两侧各 window 页，首尾常驻，中间用省略 */
function pageItems(current: number, totalPages: number, window: number): (number | "prev-gap" | "next-gap")[] {
    if (totalPages <= window * 2 + 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const start = Math.max(2, current - window);
    const end = Math.min(totalPages - 1, current + window);
    const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    return [1, ...(start > 2 ? ["prev-gap" as const] : []), ...middle, ...(end < totalPages - 1 ? ["next-gap" as const] : []), totalPages];
}

export interface PaginationProps {
    current?: number;
    defaultCurrent?: number;
    pageSize?: number;
    defaultPageSize?: number;
    total?: number;
    onChange?: (page: number, pageSize: number) => void;
    onShowSizeChange?: (current: number, size: number) => void;
    showSizeChanger?: boolean;
    pageSizeOptions?: readonly (number | string)[];
    showTotal?: (total: number, range: [number, number]) => ReactNode;
    hideOnSinglePage?: boolean;
    showLessItems?: boolean;
    disabled?: boolean;
    size?: "small" | "default";
    /** antd 的窄屏收缩；这里窄屏下页码自动减少，保留同名 prop 以免改调用处 */
    responsive?: boolean;
    className?: string;
}

/** 与 antd Pagination 同 API：上一页 / 页码 / 下一页 / 每页条数 */
export function Pagination({
    current,
    defaultCurrent = 1,
    pageSize,
    defaultPageSize = 10,
    total = 0,
    onChange,
    onShowSizeChange,
    showSizeChanger,
    pageSizeOptions = [10, 20, 50, 100],
    showTotal,
    hideOnSinglePage = false,
    showLessItems = false,
    disabled,
    size = "default",
    className,
}: PaginationProps) {
    const mergedDisabled = useMergedDisabled(disabled);
    const [innerPage, setInnerPage] = useState(defaultCurrent);
    const [innerSize, setInnerSize] = useState(defaultPageSize);
    const page = current ?? innerPage;
    const perPage = pageSize ?? innerSize;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    // antd 默认：total 超过 50 才出现每页条数切换
    const sizeChanger = showSizeChanger ?? total > 50;
    if (hideOnSinglePage && totalPages <= 1) return null;

    const go = (next: number) => {
        const clamped = Math.min(Math.max(1, next), totalPages);
        if (clamped === page || mergedDisabled) return;
        setInnerPage(clamped);
        onChange?.(clamped, perPage);
    };
    const changeSize = (nextSize: number) => {
        // 与 antd 一致：换每页条数后把当前页夹回新范围内
        const nextPage = Math.min(page, Math.max(1, Math.ceil(total / nextSize)));
        setInnerSize(nextSize);
        setInnerPage(nextPage);
        onShowSizeChange?.(nextPage, nextSize);
        onChange?.(nextPage, nextSize);
    };

    const small = size === "small";
    const cell = cn(
        "grid shrink-0 place-items-center rounded-[var(--gm-radius-sm)] tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] disabled:cursor-not-allowed disabled:opacity-35",
        small ? "h-7 min-w-7 px-1 text-xs" : "h-8 min-w-8 px-1.5 text-[13px]",
    );
    const items = pageItems(page, totalPages, showLessItems ? 1 : 2);
    const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
    const rangeEnd = Math.min(total, page * perPage);
    const sizes = [...new Set([...pageSizeOptions.map(Number), perPage])].sort((a, b) => a - b);

    return (
        <nav aria-label="分页" className={cn("gm-pagination ant-pagination flex flex-wrap items-center gap-1", mergedDisabled && "opacity-50", className)}>
            {showTotal ? <span className="me-2 text-xs text-[var(--gm-text-3)]">{showTotal(total, [rangeStart, rangeEnd])}</span> : null}
            <span className="gm-pagination-prev inline-flex">
                <button type="button" aria-label="上一页" disabled={mergedDisabled || page <= 1} onClick={() => go(page - 1)} className={cn(cell, "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)]")}>
                    <ChevronLeft className="size-4" />
                </button>
            </span>
            {items.map((item) =>
                typeof item === "number" ? (
                    <button
                        key={item}
                        type="button"
                        aria-label={`第 ${item} 页`}
                        aria-current={item === page ? "page" : undefined}
                        disabled={mergedDisabled}
                        onClick={() => go(item)}
                        className={cn(
                            cell,
                            "gm-pagination-item",
                            item === page
                                ? "gm-pagination-item-active bg-[var(--gm-accent-soft)] font-medium text-[var(--gm-accent)] ring-1 ring-inset ring-[var(--gm-accent-ring)]"
                                : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]",
                        )}
                    >
                        {item}
                    </button>
                ) : (
                    <button
                        key={item}
                        type="button"
                        aria-label={item === "prev-gap" ? "向前 5 页" : "向后 5 页"}
                        disabled={mergedDisabled}
                        onClick={() => go(page + (item === "prev-gap" ? -5 : 5))}
                        className={cn(cell, "text-[var(--gm-text-3)] hover:text-[var(--gm-accent)]")}
                    >
                        …
                    </button>
                ),
            )}
            <span className="gm-pagination-next inline-flex">
                <button type="button" aria-label="下一页" disabled={mergedDisabled || page >= totalPages} onClick={() => go(page + 1)} className={cn(cell, "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)]")}>
                    <ChevronRight className="size-4" />
                </button>
            </span>
            {sizeChanger ? (
                <label className="ms-2 inline-flex items-center">
                    <span className="sr-only">每页条数</span>
                    <select
                        value={perPage}
                        disabled={mergedDisabled}
                        onChange={(event) => changeSize(Number(event.target.value))}
                        className={cn(
                            "gm-pagination-size cursor-pointer appearance-none rounded-[var(--gm-radius-sm)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface)] bg-[length:14px] bg-[right_6px_center] bg-no-repeat pe-6 ps-2.5 text-[var(--gm-text)] outline-none transition-colors hover:border-[var(--gm-accent)] focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                            "bg-[image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364718f' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
                            small ? "h-7 text-xs" : "h-8 text-[13px]",
                        )}
                    >
                        {sizes.map((option) => (
                            <option key={option} value={option}>
                                {option} 条/页
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}
        </nav>
    );
}
