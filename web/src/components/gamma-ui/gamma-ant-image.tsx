"use client";

/*
 * gamma-ui 的 antd Image 兼容层：Image、Image.PreviewGroup。基于 radix Dialog 做点击放大预览。
 * props 与 antd 同名同义，只实现站内实际用到的子集（src/alt/className/rootClassName/
 * classNames.root|image|popup.root/styles.popup.{root,mask,body}/style/width/height/
 * preview（含 getContainer）/fallback/onLoad/onError）。
 * PreviewGroup 内多张图共享一个预览层，点其中任意一张都在同一个 lightbox 里切换上一张/下一张。
 * 无限画布的路由树本身不使用本文件；画布依赖的共享组件可以用，但要用 preview.getContainer / styles.popup
 * 覆盖画布的挂载点和样式（canvas-isolation.test.ts 只守护画布路由自身的 import，不禁止共享组件依赖 gamma-ui）。
 */

import type { CSSProperties, ReactNode } from "react";
import { createContext, useContext, useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

type ImageClassNames = { root?: string; image?: string; popup?: { root?: string } };
type ImagePopupStyles = { root?: CSSProperties; mask?: CSSProperties; body?: CSSProperties };

export interface ImagePreviewConfig {
    src?: string;
    mask?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    getContainer?: () => HTMLElement;
    cover?: ReactNode;
}

export interface ImageProps {
    src?: string;
    alt?: string;
    className?: string;
    rootClassName?: string;
    classNames?: ImageClassNames;
    /** 等价 antd styles.popup.{root,mask,body}：透传到 lightbox 的外层/遮罩/内容容器 */
    styles?: { popup?: ImagePopupStyles };
    style?: CSSProperties;
    width?: number | string;
    height?: number | string;
    preview?: boolean | ImagePreviewConfig;
    fallback?: string;
    onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
    onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

type GroupItem = { id: string; src: string; alt?: string };

interface GroupContextValue {
    register: (item: GroupItem) => () => void;
    open: (id: string) => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);
/** 多张图共享一个 lightbox，可在其中左右切换 */
export function PreviewGroup({ children }: { children?: ReactNode }) {
    const [items, setItems] = useState<GroupItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const register = (item: GroupItem) => {
        setItems((current) => (current.some((existing) => existing.id === item.id) ? current.map((existing) => (existing.id === item.id ? item : existing)) : [...current, item]));
        return () => setItems((current) => current.filter((existing) => existing.id !== item.id));
    };

    const activeIndex = items.findIndex((item) => item.id === activeId);
    const active = activeIndex >= 0 ? items[activeIndex] : null;

    const value: GroupContextValue = { register, open: setActiveId };

    return (
        <GroupContext.Provider value={value}>
            {children}
            <ImageLightbox
                src={active?.src ?? null}
                alt={active?.alt}
                onClose={() => setActiveId(null)}
                onPrev={activeIndex > 0 ? () => setActiveId(items[activeIndex - 1].id) : undefined}
                onNext={activeIndex >= 0 && activeIndex < items.length - 1 ? () => setActiveId(items[activeIndex + 1].id) : undefined}
            />
        </GroupContext.Provider>
    );
}
function ImageLightbox({
    src,
    alt,
    onClose,
    onPrev,
    onNext,
    containerClassName,
    getContainer,
    popupStyles,
}: {
    src: string | null;
    alt?: string;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    containerClassName?: string;
    getContainer?: () => HTMLElement;
    popupStyles?: ImagePopupStyles;
}) {
    return (
        <DialogPrimitive.Root open={src !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogPrimitive.Portal container={typeof document === "undefined" ? undefined : getContainer?.()}>
                <DialogPrimitive.Overlay style={popupStyles?.mask} className="ant-image-preview-mask fixed inset-0 z-[1100] bg-black/85 backdrop-blur-md data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                <DialogPrimitive.Content
                    aria-describedby={undefined}
                    style={popupStyles?.root}
                    className={cn("ant-image-preview-root fixed inset-0 z-[1100] grid place-items-center p-8 outline-none data-[state=closed]:hidden", containerClassName)}
                    onClick={onClose}
                >
                    <DialogPrimitive.Title className="sr-only">{alt || "图片预览"}</DialogPrimitive.Title>
                    <div style={popupStyles?.body}>
                        {src ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 预览层直接展示原图，非 next/image 可优化场景
                            <img src={src} alt={alt || ""} className="max-h-[86vh] max-w-[90vw] object-contain" onClick={(event) => event.stopPropagation()} />
                        ) : null}
                    </div>
                    {onPrev ? (
                        <button type="button" aria-label="上一张" onClick={(event) => (event.stopPropagation(), onPrev())} className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75">
                            <ChevronLeft className="size-5" />
                        </button>
                    ) : null}
                    {onNext ? (
                        <button type="button" aria-label="下一张" onClick={(event) => (event.stopPropagation(), onNext())} className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75">
                            <ChevronRight className="size-5" />
                        </button>
                    ) : null}
                    <DialogPrimitive.Close aria-label="关闭预览" onClick={onClose} className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75">
                        <X className="size-4" />
                    </DialogPrimitive.Close>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
function ImageBase({ src, alt, className, rootClassName, classNames, styles, style, width, height, preview = true, fallback, onLoad, onError }: ImageProps) {
    const id = useId();
    const group = useContext(GroupContext);
    const previewConfig = typeof preview === "object" ? preview : undefined;
    const canPreview = preview !== false;
    const previewSrc = previewConfig?.src ?? src;
    const [standaloneOpen, setStandaloneOpen] = useState(false);
    const [errored, setErrored] = useState(false);

    const registeredSrc = previewSrc;
    useEffect(() => {
        if (!group || !canPreview || !registeredSrc) return undefined;
        return group.register({ id, src: registeredSrc, alt });
    }, [group, canPreview, registeredSrc, alt, id]);

    const controlledOpen = previewConfig?.open;
    const isStandaloneLightboxOpen = controlledOpen ?? standaloneOpen;

    const handleActivate = () => {
        if (!canPreview) return;
        if (group) {
            group.open(id);
            return;
        }
        if (previewConfig?.onOpenChange) previewConfig.onOpenChange(true);
        else setStandaloneOpen(true);
    };

    const handleClose = () => {
        if (previewConfig?.onOpenChange) previewConfig.onOpenChange(false);
        else setStandaloneOpen(false);
    };

    return (
        <div className={cn("ant-image relative", rootClassName, classNames?.root)} style={style}>
            <img
                src={errored && fallback ? fallback : src}
                alt={alt || ""}
                width={width}
                height={height}
                className={cn("ant-image-img", canPreview && "cursor-zoom-in", className, classNames?.image)}
                onLoad={onLoad}
                onError={(event) => {
                    if (fallback) setErrored(true);
                    onError?.(event);
                }}
                onClick={handleActivate}
            />
            {canPreview && previewConfig?.cover ? (
                <div className="ant-image-mask absolute inset-0 grid cursor-zoom-in place-items-center bg-black/35 opacity-0 transition-opacity hover:opacity-100" onClick={handleActivate}>
                    {previewConfig.cover}
                </div>
            ) : null}
            {!group ? (
                <ImageLightbox
                    src={isStandaloneLightboxOpen ? previewSrc ?? null : null}
                    alt={alt}
                    onClose={handleClose}
                    containerClassName={classNames?.popup?.root}
                    getContainer={previewConfig?.getContainer}
                    popupStyles={styles?.popup}
                />
            ) : null}
        </div>
    );
}

export const Image = Object.assign(ImageBase, { PreviewGroup });

