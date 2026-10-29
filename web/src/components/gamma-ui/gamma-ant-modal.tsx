"use client";

/*
 * gamma-ui 的 antd 弹层兼容层：Modal、Drawer。基于 radix Dialog（焦点陷阱、Esc、滚动锁定、Portal）。
 * props 与 antd 同名同义；结构类名同时保留 antd 的 ant-modal-* / ant-drawer-*，
 * 现有 e2e 选择器（.ant-modal-body / .ant-modal-footer / .ant-modal-close）和全局样式不用改。
 * 静态方法（Modal.confirm 等）与 App.useApp().modal 仍走 antd，不在这里实现。画布不使用本文件。
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Modal as AntModal } from "antd";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button, type ButtonProps } from "@/components/gamma-ui/gamma-ant";
import { cn } from "@/lib/utils";

type SlotStyles = { body?: CSSProperties; container?: CSSProperties; header?: CSSProperties; footer?: CSSProperties; mask?: CSSProperties };

/** 关闭后延迟卸载内容（与 antd destroyOnHidden 一致，等退场动画结束） */
const EXIT_MS = 200;

/**
 * antd 的挂载语义：首次打开前不渲染（forceRender 例外）；打开过之后关闭时保留 DOM（隐藏），
 * 除非 destroyOnHidden。返回「当前是否要强制挂载（关闭态也保留）」。
 */
function useKeepMounted(open: boolean, destroyOnHidden: boolean, forceRender: boolean) {
    const [opened, setOpened] = useState(open || forceRender);
    if (open && !opened) setOpened(true);
    return !destroyOnHidden && opened;
}

function useAfterOpenChange(open: boolean, afterOpenChange?: (open: boolean) => void, afterClose?: () => void) {
    const first = useRef(true);
    useEffect(() => {
        if (first.current) {
            first.current = false;
            if (!open) return;
        }
        const timer = window.setTimeout(() => {
            afterOpenChange?.(open);
            if (!open) afterClose?.();
        }, EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [open, afterOpenChange, afterClose]);
}

/**
 * 弹层里仍有 antd 的 Select / DatePicker / Dropdown 等，它们的下拉浮层 Portal 到 body，
 * 在 radix 看来是「外部」：点下拉选项会被当成点遮罩而关闭对话框。这些浮层不算外部。
 */
const POPUP_LAYER =
    ".ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-popover, .ant-tooltip, .ant-cascader-dropdown, .ant-image-preview-root, .ant-modal-root, .ant-message, .ant-notification, .gm-popconfirm, .gm-tooltip, [data-radix-popper-content-wrapper]";

function isInsidePopupLayer(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest(POPUP_LAYER));
}

/* ===== Modal ===== */

export interface ModalProps {
    open?: boolean;
    title?: ReactNode;
    onOk?: (event: React.MouseEvent<HTMLButtonElement>) => unknown;
    onCancel?: () => void;
    okText?: ReactNode;
    cancelText?: ReactNode;
    okButtonProps?: Pick<ButtonProps, "danger" | "disabled" | "loading" | "icon" | "className">;
    cancelButtonProps?: Pick<ButtonProps, "disabled" | "className">;
    confirmLoading?: boolean;
    /** null / false 不显示底栏；节点则替换默认按钮 */
    footer?: ReactNode | null | false;
    width?: number | string;
    centered?: boolean;
    /** antd v6 也接受 { "aria-label" } 自定义关闭按钮的读屏文案 */
    closable?: boolean | { "aria-label"?: string };
    keyboard?: boolean;
    maskClosable?: boolean;
    /** antd v6：mask={{ closable }} 控制点遮罩是否关闭 */
    mask?: boolean | { closable?: boolean };
    destroyOnHidden?: boolean;
    forceRender?: boolean;
    styles?: SlotStyles;
    style?: CSSProperties;
    /** 加到外层遮罩包裹层，供页面级样式覆盖（如滚动行为） */
    rootClassName?: string;
    afterOpenChange?: (open: boolean) => void;
    afterClose?: () => void;
    children?: ReactNode;
    "data-asset-create-single-page"?: string | boolean;
}

/** 与 antd Modal 同 API：默认底栏为「取消 / 确定」；onCancel 处理 Esc、遮罩与关闭按钮 */
function ModalBase({
    open = false,
    title,
    onOk,
    onCancel,
    okText = "确定",
    cancelText = "取消",
    okButtonProps,
    cancelButtonProps,
    confirmLoading = false,
    footer,
    width = 520,
    centered = false,
    closable = true,
    keyboard = true,
    maskClosable = true,
    mask = true,
    destroyOnHidden = false,
    forceRender = false,
    styles,
    style,
    rootClassName,
    afterOpenChange,
    afterClose,
    children,
    ...rest
}: ModalProps) {
    useAfterOpenChange(open, afterOpenChange, afterClose);
    const showMask = mask !== false;
    const closeOnMask = typeof mask === "object" ? mask.closable !== false : maskClosable;
    const defaultFooter = (
        <>
            <Button {...cancelButtonProps} onClick={() => onCancel?.()}>
                {cancelText}
            </Button>
            <Button
                type="primary"
                danger={okButtonProps?.danger}
                disabled={okButtonProps?.disabled}
                icon={okButtonProps?.icon}
                className={okButtonProps?.className}
                loading={confirmLoading || okButtonProps?.loading}
                onClick={(event) => void onOk?.(event)}
            >
                {okText}
            </Button>
        </>
    );
    const resolvedFooter = footer === undefined ? defaultFooter : footer;
    const keepMounted = useKeepMounted(open, destroyOnHidden, forceRender);
    return (
        <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? undefined : onCancel?.())}>
            <DialogPrimitive.Portal forceMount={keepMounted ? true : undefined}>
                {showMask ? (
                    <DialogPrimitive.Overlay
                        forceMount={keepMounted ? true : undefined}
                        style={styles?.mask}
                        className="ant-modal-mask fixed inset-0 z-[1000] bg-[var(--gm-scrim)] backdrop-blur-[2px] data-[state=closed]:pointer-events-none data-[state=closed]:hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
                    />
                ) : null}
                <div
                    className={cn("ant-modal-wrap pointer-events-none fixed inset-0 z-[1000] flex justify-center overflow-y-auto p-3 sm:p-6", centered ? "items-center" : "items-start pt-[min(100px,8vh)]", !open && keepMounted && "hidden", rootClassName)}
                >
                    <DialogPrimitive.Content
                        forceMount={keepMounted ? true : undefined}
                        aria-describedby={undefined}
                        onEscapeKeyDown={(event) => {
                            if (!keyboard) event.preventDefault();
                        }}
                        onPointerDownOutside={(event) => {
                            if (!closeOnMask || isInsidePopupLayer(event.target)) event.preventDefault();
                        }}
                        onInteractOutside={(event) => {
                            if (!closeOnMask || isInsidePopupLayer(event.target)) event.preventDefault();
                        }}
                        onFocusOutside={(event) => {
                            if (isInsidePopupLayer(event.target)) event.preventDefault();
                        }}
                        {...rest}
                        style={{ width, maxWidth: "calc(100vw - 24px)", ...style, ...styles?.container }}
                        className="ant-modal gm-modal pointer-events-auto relative isolate flex data-[state=closed]:hidden max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] text-[var(--gm-text)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]"
                    >
                        <span aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-40 w-3/4 -translate-x-1/2 rounded-full bg-[var(--gm-blue)] opacity-[var(--gm-aurora-opacity)] blur-3xl" />
                        <div className="ant-modal-content flex min-h-0 flex-1 flex-col">
                            <div className={cn("ant-modal-header flex shrink-0 items-start gap-3 px-5 pt-4", title ? "pb-3" : "pb-0")} style={styles?.header}>
                                <DialogPrimitive.Title className={cn("ant-modal-title min-w-0 flex-1 text-base font-semibold", !title && "sr-only")}>{title || "对话框"}</DialogPrimitive.Title>
                                {closable ? (
                                    <DialogPrimitive.Close
                                        aria-label={typeof closable === "object" ? closable["aria-label"] || "关闭" : "关闭"}
                                        className="ant-modal-close -mt-0.5 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                                    >
                                        <X className="size-4" />
                                    </DialogPrimitive.Close>
                                ) : null}
                            </div>
                            <div className="ant-modal-body gm-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4" style={styles?.body}>
                                {open || keepMounted ? children : null}
                            </div>
                            {resolvedFooter ? (
                                <div className="ant-modal-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--gm-border)] bg-[var(--gm-wash)] px-5 py-3" style={styles?.footer}>
                                    {resolvedFooter}
                                </div>
                            ) : null}
                        </div>
                    </DialogPrimitive.Content>
                </div>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

/**
 * Modal 本体换成 gamma；Modal.confirm / warning 等命令式静态方法仍委托 antd
 * （它们由 App / ConfigProvider 的 antd 主题统一换肤），调用处不用改。
 */
export const Modal = Object.assign(ModalBase, {
    confirm: AntModal.confirm,
    info: AntModal.info,
    success: AntModal.success,
    error: AntModal.error,
    warning: AntModal.warning,
    useModal: AntModal.useModal,
});

/* ===== Drawer ===== */

export interface DrawerProps {
    open?: boolean;
    title?: ReactNode;
    onClose?: () => void;
    placement?: "right" | "left" | "top" | "bottom";
    /** antd v6：宽（左右）或高（上下）；数字为 px，或 "default" / "large" 预设 */
    size?: number | string;
    /** 旧写法，等同 size */
    width?: number | string;
    extra?: ReactNode;
    footer?: ReactNode;
    closable?: boolean;
    mask?: boolean | { closable?: boolean };
    destroyOnHidden?: boolean;
    loading?: boolean;
    styles?: SlotStyles & { wrapper?: CSSProperties; section?: CSSProperties };
    className?: string;
    rootClassName?: string;
    afterOpenChange?: (open: boolean) => void;
    children?: ReactNode;
    "aria-label"?: string;
}

const DRAWER_SIDE = {
    right: "inset-y-0 right-0 h-full border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
    left: "inset-y-0 left-0 h-full border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
    top: "inset-x-0 top-0 w-full border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
    bottom: "inset-x-0 bottom-0 w-full border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
} as const;

/** 与 antd Drawer 同 API：侧边滑出的玻璃面板；标题栏含 extra 与关闭按钮 */
export function Drawer({
    open = false,
    title,
    onClose,
    placement = "right",
    size,
    width,
    extra,
    footer,
    closable = true,
    mask = true,
    destroyOnHidden = false,
    loading = false,
    styles,
    className,
    rootClassName,
    afterOpenChange,
    children,
    "aria-label": ariaLabel,
}: DrawerProps) {
    useAfterOpenChange(open, afterOpenChange);
    const horizontal = placement === "left" || placement === "right";
    // antd 预设：default 378px / large 736px；其余数字或 CSS 长度原样使用
    const preset = size === "large" ? 736 : size === "default" ? 378 : size;
    const extent = preset ?? width ?? 378;
    const closeOnMask = typeof mask === "object" ? mask.closable !== false : true;
    const keepMounted = useKeepMounted(open, destroyOnHidden, false);
    const sizeStyle: CSSProperties = horizontal ? { width: extent, maxWidth: "100vw" } : { height: extent, maxHeight: "100dvh" };
    return (
        <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? undefined : onClose?.())}>
            <DialogPrimitive.Portal forceMount={keepMounted ? true : undefined}>
                {mask !== false ? (
                    <DialogPrimitive.Overlay
                        forceMount={keepMounted ? true : undefined}
                        style={styles?.mask}
                        className="ant-drawer-mask fixed inset-0 z-[1000] bg-[var(--gm-scrim)] backdrop-blur-[2px] data-[state=closed]:pointer-events-none data-[state=closed]:hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
                    />
                ) : null}
                <DialogPrimitive.Content
                    forceMount={keepMounted ? true : undefined}
                    aria-describedby={undefined}
                    aria-label={ariaLabel}
                    onPointerDownOutside={(event) => {
                        if (!closeOnMask || isInsidePopupLayer(event.target)) event.preventDefault();
                    }}
                    onInteractOutside={(event) => {
                        if (!closeOnMask || isInsidePopupLayer(event.target)) event.preventDefault();
                    }}
                    onFocusOutside={(event) => {
                        if (isInsidePopupLayer(event.target)) event.preventDefault();
                    }}
                    style={{ ...sizeStyle, ...styles?.wrapper }}
                    className={cn(
                        "ant-drawer gm-drawer fixed z-[1000] flex flex-col border-[var(--gm-border-strong)] bg-[var(--gm-bg-elevated)] text-[var(--gm-text)] shadow-[var(--gm-shadow)] outline-none data-[state=closed]:hidden data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:duration-300",
                        DRAWER_SIDE[placement],
                        rootClassName,
                    )}
                >
                    <div className={cn("ant-drawer-content flex min-h-0 flex-1 flex-col", className)} style={styles?.section}>
                        <div className="ant-drawer-header flex shrink-0 items-center gap-3 border-b border-[var(--gm-border)] px-5 py-3.5" style={styles?.header}>
                            <DialogPrimitive.Title className={cn("ant-drawer-title min-w-0 flex-1 truncate text-base font-semibold", !title && "sr-only")}>{title || ariaLabel || "侧边面板"}</DialogPrimitive.Title>
                            {extra ? <div className="ant-drawer-extra shrink-0">{extra}</div> : null}
                            {closable ? (
                                <DialogPrimitive.Close
                                    aria-label="关闭"
                                    className="ant-drawer-close grid size-8 shrink-0 place-items-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                                >
                                    <X className="size-4" />
                                </DialogPrimitive.Close>
                            ) : null}
                        </div>
                        <div className="ant-drawer-body gm-scroll min-h-0 flex-1 overflow-y-auto p-5" style={styles?.body}>
                            {loading ? (
                                <div className="grid h-40 place-items-center text-[var(--gm-text-3)]">
                                    <Loader2 className="size-5 animate-spin" />
                                </div>
                            ) : open || keepMounted ? (
                                children
                            ) : null}
                        </div>
                        {footer ? (
                            <div className="ant-drawer-footer shrink-0 border-t border-[var(--gm-border)] px-5 py-3" style={styles?.footer}>
                                {footer}
                            </div>
                        ) : null}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
