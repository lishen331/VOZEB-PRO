"use client";

/*
 * gamma-ui 的 antd 展示类兼容层：Space、Card、Progress、Divider、Avatar、Skeleton、Steps、Timeline、
 * Collapse、Typography、Radio、Slider、List。props 与 antd 同名同义，只覆盖页面实际用到的部分
 * （统计见 过程文件/bluegamma-rollout/survey-props.mjs）。画布及其共享组件不使用本文件。
 */

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Children, createContext, useContext, useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/* ===== Space ===== */

const SPACE_GAP = { small: 8, middle: 16, large: 24 } as const;
type SpaceSize = keyof typeof SPACE_GAP | number;
const gapPx = (size: SpaceSize) => (typeof size === "number" ? size : SPACE_GAP[size]);

export interface SpaceProps {
    size?: SpaceSize | [SpaceSize, SpaceSize];
    direction?: "horizontal" | "vertical";
    wrap?: boolean;
    align?: "start" | "end" | "center" | "baseline";
    className?: string;
    style?: CSSProperties;
    onClick?: (event: MouseEvent<HTMLDivElement>) => void;
    children?: ReactNode;
}

/** 与 antd Space 同 API：子元素间距；空子元素不占位 */
export function Space({ size = "small", direction = "horizontal", wrap = false, align, className, style, onClick, children }: SpaceProps) {
    const [column, row] = Array.isArray(size) ? size : [size, size];
    const vertical = direction === "vertical";
    // Children.toArray 已去掉 null / undefined / boolean；空字符串不占位
    const items = Children.toArray(children).filter((child) => child !== "");
    return (
        <div
            onClick={onClick}
            className={cn("gm-space inline-flex", vertical ? "flex-col" : "items-center", wrap && "flex-wrap", align && { start: "items-start", end: "items-end", center: "items-center", baseline: "items-baseline" }[align], className)}
            style={{ columnGap: gapPx(column), rowGap: gapPx(row), ...style }}
        >
            {items}
        </div>
    );
}

/* ===== Card ===== */

export interface CardProps {
    title?: ReactNode;
    extra?: ReactNode;
    size?: "default" | "small";
    loading?: boolean;
    bordered?: boolean;
    /** 鼠标悬停时抬升阴影，用于图片卡等可点击卡片 */
    hoverable?: boolean;
    /** 顶部媒体区（图片/视频等），渲染在标题栏之上 */
    cover?: ReactNode;
    styles?: { body?: CSSProperties };
    className?: string;
    children?: ReactNode;
}

/** 与 antd Card 同 API：标题栏（title + extra）+ 内容；loading 时内容换成骨架 */
export function Card({ title, extra, size = "default", loading = false, bordered = true, hoverable = false, cover, styles, className, children }: CardProps) {
    const small = size === "small";
    return (
        <section
            className={cn("gm-card overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] text-[var(--gm-text)]", bordered && "ring-1 ring-[var(--gm-border)]", hoverable && "transition-shadow hover:shadow-[var(--gm-shadow-md)]", className)}
        >
            {cover}
            {title || extra ? (
                <header className={cn("flex min-h-0 items-center justify-between gap-3 border-b border-[var(--gm-border)]", small ? "px-3 py-2" : "px-5 py-3")}>
                    <div className={cn("min-w-0 truncate font-semibold", small ? "text-[13px]" : "text-sm")}>{title}</div>
                    {extra ? <div className="shrink-0">{extra}</div> : null}
                </header>
            ) : null}
            <div style={styles?.body} className={small ? "p-3" : "p-5"}>
                {loading ? <Skeleton active paragraph={{ rows: 3 }} /> : children}
            </div>
        </section>
    );
}

/* ===== Skeleton ===== */

export function Skeleton({ active = false, paragraph }: { active?: boolean; paragraph?: { rows?: number } }) {
    const rows = paragraph?.rows ?? 3;
    return (
        <div aria-hidden className="gm-skeleton flex flex-col gap-2.5">
            <span className={cn("h-4 w-2/5 rounded-full bg-[var(--gm-wash-strong)]", active && "animate-pulse")} />
            {Array.from({ length: rows }, (_, index) => (
                <span key={index} className={cn("h-3 rounded-full bg-[var(--gm-wash-strong)]", active && "animate-pulse", index === rows - 1 ? "w-3/5" : "w-full")} />
            ))}
        </div>
    );
}

/* ===== Progress / Divider / Avatar ===== */

export interface ProgressProps {
    percent?: number;
    status?: "normal" | "active" | "success" | "exception";
    showInfo?: boolean;
    size?: "default" | "small";
    className?: string;
}

/** 与 antd Progress（line）同 API：品牌渐变进度条；exception 红、success 绿 */
export function Progress({ percent = 0, status = "normal", showInfo = true, size = "default", className }: ProgressProps) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const fill = status === "exception" ? "bg-[var(--gm-danger)]" : status === "success" || value >= 100 ? "bg-[var(--gm-success)]" : "bg-[image:var(--gm-gradient)]";
    return (
        <div className={cn("gm-progress flex items-center gap-2", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
            <span className={cn("relative min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]", size === "small" ? "h-1.5" : "h-2")}>
                <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out", fill, status === "active" && "animate-pulse")} style={{ width: `${value}%` }} />
            </span>
            {showInfo ? <span className="shrink-0 text-xs text-[var(--gm-text-2)] tabular-nums">{value}%</span> : null}
        </div>
    );
}

export function Divider({ orientation = "horizontal", className }: { orientation?: "horizontal" | "vertical"; className?: string }) {
    if (orientation === "vertical") return <span role="separator" aria-orientation="vertical" className={cn("gm-divider mx-2 inline-block h-[0.9em] w-px self-center bg-[var(--gm-border-strong)]", className)} />;
    return <hr className={cn("gm-divider my-4 border-0 border-t border-[var(--gm-border)]", className)} />;
}

export function Avatar({ size = 32, src, icon, className }: { size?: number; src?: string; icon?: ReactNode; className?: string }) {
    const [failed, setFailed] = useState(false);
    return (
        <span className={cn("gm-avatar inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)]", className)} style={{ width: size, height: size }}>
            {src && !failed ? (
                // eslint-disable-next-line @next/next/no-img-element -- 用户头像来自对象存储，尺寸固定
                <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
            ) : (
                icon
            )}
        </span>
    );
}

/* ===== Steps / Timeline / Collapse ===== */

export function Steps({ current = 0, items, className }: { current?: number; items: readonly { title: ReactNode; description?: ReactNode }[]; className?: string }) {
    return (
        <ol className={cn("gm-steps flex items-center gap-3", className)}>
            {items.map((item, index) => {
                const done = index < current;
                const active = index === current;
                return (
                    <li key={index} className="flex min-w-0 flex-1 items-center gap-2.5 last:flex-none" aria-current={active ? "step" : undefined}>
                        <span
                            className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                                done ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]" : active ? "bg-[image:var(--gm-gradient)] text-white shadow-[var(--gm-glow-blue)]" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)]",
                            )}
                        >
                            {done ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span className={cn("shrink-0 text-[13px]", active ? "font-medium text-[var(--gm-text)]" : "text-[var(--gm-text-2)]")}>{item.title}</span>
                        {index < items.length - 1 ? <span aria-hidden className={cn("h-px min-w-6 flex-1", done ? "bg-[var(--gm-accent)]" : "bg-[var(--gm-border-strong)]")} /> : null}
                    </li>
                );
            })}
        </ol>
    );
}

export function Timeline({ items }: { items: readonly { content?: ReactNode; children?: ReactNode; color?: string }[] }) {
    return (
        <ol className="gm-timeline relative ms-1.5 border-s border-[var(--gm-border-strong)]">
            {items.map((item, index) => (
                <li key={index} className="relative ps-5 pb-6 last:pb-0">
                    <span aria-hidden className={cn("absolute top-1.5 -start-[5px] size-2.5 rounded-full ring-4 ring-[var(--gm-surface)]", index === 0 ? "bg-[image:var(--gm-gradient)]" : "bg-[var(--gm-border-strong)]")} />
                    {item.content ?? item.children}
                </li>
            ))}
        </ol>
    );
}

export interface CollapseItem {
    key: string;
    label: ReactNode;
    children?: ReactNode;
}

/** 与 antd Collapse 同 API（items 形式、非受控）：多个面板可同时展开 */
export function Collapse({ items, bordered = true, className, defaultActiveKey }: { items: readonly CollapseItem[]; bordered?: boolean; className?: string; defaultActiveKey?: string | string[] }) {
    const baseId = useId();
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(Array.isArray(defaultActiveKey) ? defaultActiveKey : defaultActiveKey ? [defaultActiveKey] : []));
    const toggle = (key: string) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    return (
        <div className={cn("gm-collapse divide-y divide-[var(--gm-border)] overflow-hidden rounded-[var(--gm-radius-lg)]", bordered && "ring-1 ring-[var(--gm-border)]", className)}>
            {items.map((item) => {
                const expanded = open.has(item.key);
                return (
                    <div key={item.key} className="gm-collapse-item">
                        <button
                            type="button"
                            id={`${baseId}-${item.key}-header`}
                            aria-expanded={expanded}
                            aria-controls={`${baseId}-${item.key}-panel`}
                            onClick={() => toggle(item.key)}
                            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--gm-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-inset"
                        >
                            <ChevronDown className={cn("size-4 shrink-0 text-[var(--gm-text-3)] transition-transform duration-200", !expanded && "-rotate-90")} />
                            <span className="min-w-0 flex-1">{item.label}</span>
                        </button>
                        <div id={`${baseId}-${item.key}-panel`} role="region" aria-labelledby={`${baseId}-${item.key}-header`} hidden={!expanded} className="px-4 pt-1 pb-4">
                            {expanded ? item.children : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ===== Typography ===== */

const TEXT_TONE = { secondary: "text-[var(--gm-text-2)]", success: "text-[var(--gm-success)]", warning: "text-[var(--gm-warning)]", danger: "text-[var(--gm-danger)]" } as const;

function TypographyText({ type, strong, ellipsis, className, children }: { type?: keyof typeof TEXT_TONE; strong?: boolean; ellipsis?: boolean; className?: string; children?: ReactNode }) {
    return <span className={cn("gm-text", type && TEXT_TONE[type], strong && "font-semibold", ellipsis && "truncate", className)}>{children}</span>;
}

function TypographyParagraph({ className, children }: { className?: string; children?: ReactNode }) {
    return <p className={cn("gm-paragraph mb-3 text-sm leading-relaxed text-[var(--gm-text)]", className)}>{children}</p>;
}

const TITLE_SIZE = { 1: "text-3xl", 2: "text-2xl", 3: "text-xl", 4: "text-lg", 5: "text-base" } as const;

function TypographyTitle({ level = 1, className, children }: { level?: keyof typeof TITLE_SIZE; className?: string; children?: ReactNode }) {
    const Heading = `h${level}` as "h1";
    return <Heading className={cn("gm-title mb-3 font-semibold text-[var(--gm-text)]", TITLE_SIZE[level], className)}>{children}</Heading>;
}

export const Typography = { Text: TypographyText, Paragraph: TypographyParagraph, Title: TypographyTitle };

/* ===== Radio ===== */

interface RadioContextValue {
    name: string;
    value: unknown;
    onSelect: (value: unknown) => void;
    button: boolean;
    disabled: boolean;
}

const RadioContext = createContext<RadioContextValue | null>(null);

/** antd 的 onChange 事件形状：event.target.value */
export type RadioChangeEvent<T = string> = { target: { value: T; checked: boolean } };

function RadioGroup<T>({
    value,
    onChange,
    optionType,
    buttonStyle,
    disabled = false,
    className,
    children,
}: {
    value?: T;
    onChange?: (event: RadioChangeEvent<T>) => void;
    optionType?: "default" | "button";
    buttonStyle?: "outline" | "solid";
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
}) {
    const name = useId();
    const button = optionType === "button";
    return (
        <RadioContext.Provider value={{ name, value, button, disabled, onSelect: (next) => onChange?.({ target: { value: next as T, checked: true } }) }}>
            <div role="radiogroup" className={cn("gm-radio-group", "ant-radio-group", button ? "inline-flex rounded-[var(--gm-radius)] bg-[var(--gm-wash)] p-0.5 ring-1 ring-[var(--gm-border)]" : "flex flex-wrap gap-x-5 gap-y-2", className)}>
                {children}
            </div>
        </RadioContext.Provider>
    );
}

function RadioItem({ value, className, children, disabled, forceButton = false }: { value: unknown; className?: string; children?: ReactNode; disabled?: boolean; forceButton?: boolean }) {
    const group = useContext(RadioContext);
    const checked = group?.value === value;
    const button = forceButton || group?.button;
    // 单个 Radio 传入的 disabled 优先，否则继承 Group 的
    const mergedDisabled = disabled ?? group?.disabled ?? false;
    const input = <input type="radio" name={group?.name} checked={checked} disabled={mergedDisabled} onChange={() => group?.onSelect(value)} className="peer sr-only" />;
    if (button) {
        return (
            <label
                className={cn(
                    "relative inline-flex h-8 items-center rounded-[var(--gm-radius-sm)] px-3 text-[13px] transition-colors",
                    mergedDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                    checked ? "bg-[var(--gm-surface)] font-medium text-[var(--gm-text)] shadow-sm" : "text-[var(--gm-text-2)]",
                    !mergedDisabled && !checked && "hover:text-[var(--gm-text)]",
                    "peer-focus-visible:ring-2",
                    className,
                )}
            >
                {input}
                {children}
            </label>
        );
    }
    return (
        <label
            className={cn(
                "gm-radio group/radio inline-flex items-start gap-2 text-sm text-[var(--gm-text)]",
                mergedDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                checked && "gm-radio-checked",
                className,
            )}
        >
            {input}
            <span
                aria-hidden
                className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--gm-accent)]",
                    checked ? "border-[var(--gm-accent)]" : "border-[var(--gm-border-strong)]",
                    !mergedDisabled && !checked && "group-hover/radio:border-[var(--gm-accent)]",
                )}
            >
                {checked ? <span className="size-2 rounded-full bg-[var(--gm-accent)]" /> : null}
            </span>
            <span className="min-w-0">{children}</span>
        </label>
    );
}

export const Radio = Object.assign(RadioItem, {
    Group: RadioGroup,
    Button: (props: { value: unknown; className?: string; children?: ReactNode; disabled?: boolean }) => <RadioItem {...props} forceButton />,
});

/* ===== Slider ===== */

/** 与 antd Slider（单值）同 API；复用 gamma-tokens.css 的 .gm-range 品牌滑块样式 */
export function Slider({ min = 0, max = 100, step = 1, value, onChange, ariaLabelForHandle, className }: { min?: number; max?: number; step?: number; value?: number; onChange?: (value: number) => void; ariaLabelForHandle?: string; className?: string }) {
    const current = value ?? min;
    const percent = max > min ? ((current - min) / (max - min)) * 100 : 0;
    return (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={current}
            aria-label={ariaLabelForHandle}
            onChange={(event) => onChange?.(Number(event.target.value))}
            className={cn("gm-range w-full", className)}
            style={{ "--gm-range-fill": `${percent}%` } as CSSProperties}
        />
    );
}

/* ===== List ===== */

function ListItemMeta({ avatar, title, description }: { avatar?: ReactNode; title?: ReactNode; description?: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-1 items-start gap-3">
            {avatar ? <div className="shrink-0">{avatar}</div> : null}
            <div className="min-w-0">
                {title ? <div className="truncate text-sm font-medium text-[var(--gm-text)]">{title}</div> : null}
                {description ? <div className="mt-0.5 truncate text-xs text-[var(--gm-text-3)]">{description}</div> : null}
            </div>
        </div>
    );
}

function ListItem({ actions, children }: { actions?: ReactNode[]; children?: ReactNode }) {
    return (
        <li className="flex items-center gap-3 py-3">
            {children}
            {actions?.length ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </li>
    );
}

function ListBase<T>({ dataSource, renderItem }: { dataSource: readonly T[]; renderItem: (item: T, index: number) => ReactNode }) {
    return <ul className="gm-list divide-y divide-[var(--gm-border)]">{dataSource.map((item, index) => renderItem(item, index))}</ul>;
}

export const List = Object.assign(ListBase, { Item: Object.assign(ListItem, { Meta: ListItemMeta }) });
