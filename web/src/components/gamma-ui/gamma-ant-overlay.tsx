"use client";

/*
 * gamma-ui 的 antd 浮层/导航兼容层：Tooltip、Popover、Popconfirm、Dropdown、Tabs。props 与 antd 同名同义。
 * Tooltip 基于 radix（Portal + 碰撞翻转），禁用态子元素外包 span 以便仍能触发提示（与 antd 一致）。
 * Dropdown 基于 radix DropdownMenu，保留 .ant-dropdown* 类名兼容既有 e2e/CSS 选择器。
 * 画布及其共享组件不使用本文件。
 */

import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode, Ref } from "react";
import { Children, cloneElement, isValidElement, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive, Popover as PopoverPrimitive, Slot, Tooltip as TooltipPrimitive } from "radix-ui";

import { Button, type ButtonProps } from "@/components/gamma-ui/gamma-ant";
import { cn } from "@/lib/utils";

/* ===== Tooltip ===== */

type Placement = "top" | "topLeft" | "topRight" | "bottom" | "bottomLeft" | "bottomRight" | "left" | "leftTop" | "leftBottom" | "right" | "rightTop" | "rightBottom";

function toRadix(placement: Placement): { side: "top" | "bottom" | "left" | "right"; align: "start" | "center" | "end" } {
    const side = placement.startsWith("top") ? "top" : placement.startsWith("bottom") ? "bottom" : placement.startsWith("left") ? "left" : "right";
    const rest = placement.slice(side.length);
    const align = rest === "Left" || rest === "Top" ? "start" : rest === "Right" || rest === "Bottom" ? "end" : "center";
    return { side, align };
}

export interface TooltipProps extends Omit<HTMLAttributes<HTMLElement>, "title" | "children"> {
    title?: ReactNode;
    placement?: Placement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    mouseEnterDelay?: number;
    children: ReactNode;
    ref?: Ref<HTMLElement>;
}

/**
 * 与 antd Tooltip 同 API：title 为空时只渲染子元素。
 * 外层（如 Popconfirm 的 asChild 触发器）注入的 props / ref 透传到实际触发元素，嵌套使用不丢事件。
 */
export function Tooltip({ title, placement = "top", open, onOpenChange, mouseEnterDelay = 0.1, children, className, ref, ...forwarded }: TooltipProps) {
    const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<{ disabled?: boolean; className?: string }>) : null;
    const hasForwarded = Object.keys(forwarded).length > 0 || ref !== undefined;
    const passThrough =
        only && hasForwarded ? (
            <Slot.Root {...forwarded} ref={ref}>
                {only}
            </Slot.Root>
        ) : (
            (only ?? children)
        );
    if (title === undefined || title === null || title === "" || title === false) return <>{passThrough}</>;
    const { side, align } = toRadix(placement);
    // 禁用的按钮不派发 pointer 事件，外包一层 span 接管悬停（antd 同样处理）
    const trigger =
        only && !only.props.disabled ? (
            passThrough
        ) : (
            <span {...forwarded} ref={ref as Ref<HTMLSpanElement>} className={cn("inline-flex", only?.props.disabled && "cursor-not-allowed")}>
                {only ? cloneElement(only, { className: cn(only.props.className, "pointer-events-none") }) : children}
            </span>
        );
    return (
        <TooltipPrimitive.Provider delayDuration={mouseEnterDelay * 1000} skipDelayDuration={200}>
            <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
                <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
                <TooltipPrimitive.Portal>
                    <TooltipPrimitive.Content
                        side={side}
                        align={align}
                        sideOffset={6}
                        collisionPadding={8}
                        className={cn(
                            "gm-tooltip z-[1100] max-w-[min(320px,calc(100vw-24px))] rounded-[8px] bg-[var(--gm-surface-light,#eef4ff)] px-2.5 py-1.5 text-xs leading-5 font-medium break-words text-[var(--gm-inverse-text,#0b1530)] shadow-[0_8px_24px_rgba(0,0,0,0.28)]",
                            "origin-[var(--radix-tooltip-content-transform-origin)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                            className,
                        )}
                    >
                        {title}
                    </TooltipPrimitive.Content>
                </TooltipPrimitive.Portal>
            </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>
    );
}

/* ===== Popover ===== */

export interface PopoverProps {
    trigger?: "click" | [];
    placement?: Placement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    arrow?: boolean;
    autoAdjustOverflow?: boolean | { adjustX?: 0 | 1; adjustY?: 0 | 1 };
    destroyOnHidden?: boolean;
    styles?: { container?: CSSProperties };
    content: ReactNode;
    children: ReactNode;
}

/**
 * 与 antd Popover 同 API 的受控/非受控浮层：trigger="click" 时点击子元素开合；trigger=[] 时完全由 open 控制，
 * 子元素点击不触发开合（用于输入框里的 @提及 选择器等场景）。styles.container 透传到内容容器的 style。
 * autoAdjustOverflow 的方向细节交给 radix 的 collisionPadding/avoidCollisions 处理，不单独实现 adjustX/adjustY。
 */
export function Popover({ trigger = "click", placement = "bottom", open, onOpenChange, arrow = true, autoAdjustOverflow = true, styles, content, children }: PopoverProps) {
    const { side, align } = toRadix(placement);
    const manualTrigger = Array.isArray(trigger);
    return (
        <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <PopoverPrimitive.Trigger asChild onClick={manualTrigger ? (event) => event.preventDefault() : undefined}>
                {children}
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    side={side}
                    align={align}
                    sideOffset={arrow ? 10 : 6}
                    collisionPadding={8}
                    avoidCollisions={autoAdjustOverflow !== false}
                    style={styles?.container}
                    className={cn(
                        "gm-popover ant-popover z-[1050] rounded-[var(--gm-radius)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface-2)] text-[var(--gm-text)] shadow-[var(--gm-shadow)] outline-none",
                        "origin-[var(--radix-popover-content-transform-origin)] data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                    )}
                >
                    {content}
                    {arrow ? <PopoverPrimitive.Arrow className="fill-[var(--gm-surface-2)]" width={14} height={7} /> : null}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

/* ===== Popconfirm ===== */

export interface PopconfirmProps {
    title: ReactNode;
    description?: ReactNode;
    onConfirm?: () => unknown;
    onCancel?: () => void;
    okText?: ReactNode;
    cancelText?: ReactNode;
    okButtonProps?: Pick<ButtonProps, "danger" | "disabled" | "loading">;
    disabled?: boolean;
    placement?: Placement;
    children: ReactNode;
}

/**
 * 与 antd Popconfirm 同 API：点击子元素弹出确认气泡；onConfirm 返回 Promise 时按钮转 loading，结束后关闭。
 * disabled 时直接渲染子元素（与 antd 一致不弹出）。
 */
export function Popconfirm({ title, description, onConfirm, onCancel, okText = "确定", cancelText = "取消", okButtonProps, disabled = false, placement = "top", children }: PopconfirmProps) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    if (disabled) return <>{children}</>;
    const { side, align } = toRadix(placement);
    const confirm = async () => {
        const result = onConfirm?.();
        if (result instanceof Promise) {
            setPending(true);
            try {
                await result;
            } finally {
                setPending(false);
            }
        }
        setOpen(false);
    };
    return (
        <PopoverPrimitive.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
            <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    side={side}
                    align={align}
                    sideOffset={8}
                    collisionPadding={10}
                    role="alertdialog"
                    onClick={(event) => event.stopPropagation()}
                    className={cn(
                        "gm-popconfirm z-[1050] w-max max-w-[min(320px,calc(100vw-24px))] rounded-[var(--gm-radius)] border border-[var(--gm-border-strong)] bg-[color-mix(in_srgb,var(--gm-surface-2)_88%,transparent)] p-3.5 text-[var(--gm-text)] shadow-[var(--gm-shadow,0_16px_40px_rgba(0,0,0,0.35))] backdrop-blur-xl backdrop-saturate-150 outline-none",
                        "origin-[var(--radix-popover-content-transform-origin)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                    )}
                >
                    <div className="flex gap-2.5">
                        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--gm-warning)]" />
                        <div className="min-w-0">
                            <div className="text-sm font-medium leading-5">{title}</div>
                            {description ? <div className="mt-1 text-xs leading-5 text-[var(--gm-text-2)]">{description}</div> : null}
                        </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <Button
                            size="small"
                            disabled={pending}
                            onClick={() => {
                                onCancel?.();
                                setOpen(false);
                            }}
                        >
                            {cancelText}
                        </Button>
                        <Button size="small" type="primary" danger={okButtonProps?.danger} disabled={okButtonProps?.disabled} loading={pending || okButtonProps?.loading} onClick={() => void confirm()}>
                            {okText}
                        </Button>
                    </div>
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

/* ===== Dropdown ===== */

export interface DropdownMenuItem {
    key?: string;
    label?: ReactNode;
    icon?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    type?: "divider";
}

export interface DropdownMenuConfig {
    items: DropdownMenuItem[];
    selectable?: boolean;
    selectedKeys?: string[];
    onClick?: (info: { key: string }) => void;
}

export interface DropdownProps {
    menu: DropdownMenuConfig;
    trigger?: Array<"click" | "hover">;
    placement?: Placement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    rootClassName?: string;
    getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
    children: ReactNode;
}

/**
 * 与 antd Dropdown 同 API 的子集：menu={{ items, selectable, selectedKeys, onClick }}，trigger 默认 click。
 * items 支持 key/label/icon/danger/disabled 与 { type: "divider" }；不支持子菜单与 type: "group"（项目内未使用）。
 * getPopupContainer 未实现（radix Portal 固定挂 body，站内调用处都不依赖自定义容器的实际效果）。
 */
export function Dropdown({ menu, trigger = ["click"], placement = "bottomLeft", open, onOpenChange, rootClassName, children }: DropdownProps) {
    const { side, align } = toRadix(placement);
    const hover = trigger.includes("hover") && !trigger.includes("click");
    return (
        <DropdownMenuPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
            <DropdownMenuPrimitive.Trigger asChild onPointerDown={hover ? (event) => event.preventDefault() : undefined}>
                {children}
            </DropdownMenuPrimitive.Trigger>
            <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content
                    side={side}
                    align={align}
                    sideOffset={6}
                    collisionPadding={8}
                    className={cn(
                        "gm-dropdown ant-dropdown ant-dropdown-menu z-[1050] min-w-36 rounded-[var(--gm-radius)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface-2)] p-1 text-[var(--gm-text)] shadow-[var(--gm-shadow)] outline-none",
                        "origin-[var(--radix-dropdown-menu-content-transform-origin)] data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                        rootClassName,
                    )}
                >
                    {menu.items.map((item, index) =>
                        item.type === "divider" ? (
                            <DropdownMenuPrimitive.Separator key={`divider-${index}`} className="ant-dropdown-menu-item-divider my-1 h-px bg-[var(--gm-border)]" />
                        ) : (
                            <DropdownMenuPrimitive.Item
                                key={item.key ?? `item-${index}`}
                                disabled={item.disabled}
                                onSelect={() => item.key !== undefined && menu.onClick?.({ key: item.key })}
                                className={cn(
                                    "ant-dropdown-menu-item flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--gm-radius-sm)] px-2.5 text-sm outline-none transition select-none",
                                    "data-[highlighted]:bg-[var(--gm-wash)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
                                    item.danger ? "text-[var(--gm-danger)]" : undefined,
                                    menu.selectable && item.key !== undefined && menu.selectedKeys?.includes(item.key) ? "bg-[var(--gm-wash)]" : undefined,
                                )}
                            >
                                {item.icon ? <span className="inline-flex shrink-0 [&_svg]:size-4">{item.icon}</span> : null}
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            </DropdownMenuPrimitive.Item>
                        ),
                    )}
                </DropdownMenuPrimitive.Content>
            </DropdownMenuPrimitive.Portal>
        </DropdownMenuPrimitive.Root>
    );
}

/* ===== Tabs ===== */

export interface TabItem {
    key: string;
    label: ReactNode;
    children?: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
    forceRender?: boolean;
}

export interface TabsProps {
    items?: TabItem[];
    activeKey?: string;
    defaultActiveKey?: string;
    onChange?: (key: string) => void;
    size?: "small" | "middle" | "large";
    tabBarGutter?: number;
    tabBarExtraContent?: ReactNode;
    destroyOnHidden?: boolean;
    animated?: boolean | { inkBar?: boolean; tabPane?: boolean };
    className?: string;
}

/**
 * 与 antd Tabs 同 API：下划线式标签栏 + 面板。结构类名对应 antd（gm-tabs-nav / gm-tabs-tab / gm-tabs-content），
 * 默认只渲染当前面板；destroyOnHidden=false 时访问过的面板保留在 DOM（与 antd 默认一致）。
 */
export function Tabs({ items = [], activeKey, defaultActiveKey, onChange, size = "middle", tabBarGutter, tabBarExtraContent, destroyOnHidden = false, className }: TabsProps) {
    const baseId = useId();
    const [inner, setInner] = useState(defaultActiveKey ?? items[0]?.key);
    const current = activeKey ?? inner;
    const [visited, setVisited] = useState<Set<string>>(() => new Set(current ? [current] : []));
    if (current && !visited.has(current)) setVisited(new Set([...visited, current]));

    const select = (key: string) => {
        if (key === current) return;
        setInner(key);
        onChange?.(key);
    };
    const enabled = items.filter((item) => !item.disabled);
    const move = (offset: number) => {
        const index = enabled.findIndex((item) => item.key === current);
        const next = enabled[(index + offset + enabled.length) % enabled.length];
        if (!next) return;
        select(next.key);
        document.getElementById(`${baseId}-tab-${next.key}`)?.focus();
    };
    const tabText = size === "small" ? "py-2 text-[13px]" : size === "large" ? "py-3 text-[15px]" : "py-2.5 text-sm";

    return (
        <div className={cn("gm-tabs flex min-w-0 flex-col", className)}>
            <div className="gm-tabs-nav relative mb-4 flex items-center gap-3 border-b border-[var(--gm-border)]">
                <div
                    role="tablist"
                    className="gm-tabs-nav-list flex min-w-0 flex-1 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{ columnGap: tabBarGutter ?? 28 }}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowRight") move(1);
                        else if (event.key === "ArrowLeft") move(-1);
                    }}
                >
                    {items.map((item) => {
                        const active = item.key === current;
                        return (
                            <button
                                key={item.key}
                                id={`${baseId}-tab-${item.key}`}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                aria-controls={`${baseId}-panel-${item.key}`}
                                tabIndex={active ? 0 : -1}
                                disabled={item.disabled}
                                onClick={() => select(item.key)}
                                className={cn(
                                    "gm-tabs-tab relative inline-flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:text-[var(--gm-accent)] disabled:cursor-not-allowed disabled:opacity-40",
                                    tabText,
                                    active ? "gm-tabs-tab-active text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:text-[var(--gm-text)]",
                                )}
                            >
                                {item.icon ? <span className="inline-flex shrink-0 [&_svg]:size-4">{item.icon}</span> : null}
                                <span className="gm-tabs-tab-btn min-w-0">{item.label}</span>
                                <span
                                    aria-hidden
                                    className={cn(
                                        "gm-tabs-ink-bar absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--gm-accent)] shadow-[0_0_10px_var(--gm-accent-ring)] transition-[opacity,transform] duration-300",
                                        active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0",
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>
                {tabBarExtraContent ? <div className="gm-tabs-extra-content shrink-0 pb-1.5">{tabBarExtraContent}</div> : null}
            </div>
            <div className="gm-tabs-content min-h-0 flex-1">
                {items.map((item) => {
                    const active = item.key === current;
                    const keep = active || item.forceRender || (!destroyOnHidden && visited.has(item.key));
                    if (!keep || item.children === undefined) return null;
                    return (
                        <div key={item.key} id={`${baseId}-panel-${item.key}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${item.key}`} hidden={!active} className="gm-tabs-tabpane h-full min-h-0">
                            {item.children}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
