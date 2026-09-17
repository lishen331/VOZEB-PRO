"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BriefcaseBusiness, ChevronRight, CircleCheck, CircleX, Clock3, Globe2, Image as ImageIcon, Layers, ListChecks, Maximize2, Minimize2, Music2, Palette, RefreshCw, Star, Video } from "lucide-react";
import { Button, Modal } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { useCanvasColorTheme } from "@/stores/use-theme-store";
import { CanvasResourceMentionText, CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasPanoramaViewer } from "./canvas-panorama-viewer";
import { CanvasNodeType, type CanvasGroupMemberSnapshot, type CanvasNodeData } from "../types";
import { canvasImagePreviewWidthForTier, canvasImageZoomTier } from "../utils/canvas-image-preview-scale";
import { canvasGroupColumns, canvasGroupRows } from "../utils/canvas-storyboard-group";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

export type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    scale?: number;
    /** Ratcheted zoom tier used for image resolution. Falls back to `scale`. */
    previewScale?: number;
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onImageDimensions?: (nodeId: string, naturalWidth: number, naturalHeight: number) => void;
};

export function NodeContent(props: NodeContentRendererProps) {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    // A group is a container, not a generation target — it must never fall into
    // the status branches below even if a stray status lands on its metadata.
    if (props.node.type === CanvasNodeType.Group) return <GroupNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;
    if (props.node.metadata?.status === "needs_review") return <ReviewContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;
    if (props.node.metadata?.status === "cancelled") return <CancelledContent theme={props.theme} />;

    const Renderer = nodeContentRenderers[props.node.type];
    return Renderer ? <Renderer {...props} /> : <UnknownNodeContent theme={props.theme} />;
}

export const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Panorama]: PanoramaNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Brief]: BriefNodeContent,
    [CanvasNodeType.Task]: TaskNodeContent,
    [CanvasNodeType.BrandKit]: BrandKitNodeContent,
    [CanvasNodeType.Group]: GroupNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

export function BriefNodeContent({ node, theme }: NodeContentRendererProps) {
    const brief = node.metadata?.agentBrief;
    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-5" style={{ color: theme.node.text }}>
            <div className="flex items-center gap-2 text-xs font-semibold">
                <BriefcaseBusiness className="size-4" style={{ color: theme.node.activeStroke }} />
                创作目标
            </div>
            <p className="text-sm leading-6">{brief?.objective || "等待 Agent 整理创作目标"}</p>
            {brief?.audience ? (
                <div className="text-xs" style={{ color: theme.node.placeholder }}>
                    受众：{brief.audience}
                </div>
            ) : null}
            {brief?.usage ? (
                <div className="text-xs" style={{ color: theme.node.placeholder }}>
                    场景：{brief.usage}
                </div>
            ) : null}
            {brief?.coreMessage ? (
                <p className="text-xs leading-5" style={{ color: theme.node.placeholder }}>
                    核心信息：{brief.coreMessage}
                </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
                {brief?.deliverables?.map((item, index) => (
                    <span key={`${item.title}-${index}`} className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: theme.node.subtleBorder, background: theme.node.subtleSurface, color: theme.node.subtleText }}>
                        {item.title}
                        {item.count && item.count > 1 ? ` ×${item.count}` : ""}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function TaskNodeContent({ node, theme }: NodeContentRendererProps) {
    const status = node.metadata?.agentTaskStatus || "pending";
    const statusTheme = taskStatusTheme(status, theme);
    return (
        <div className="flex h-full min-h-0 flex-col p-5" style={{ color: theme.node.text }}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-4 flex items-center justify-between">
                    <ListChecks className="size-5" style={{ color: theme.node.activeStroke }} />
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ background: statusTheme.surface, borderColor: statusTheme.border, color: statusTheme.text }}>
                        <span className="size-1.5 rounded-full" style={{ background: statusTheme.text }} aria-hidden="true" />
                        {TASK_STATUS_LABELS[status]}
                    </span>
                </div>
                <p className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-6" onWheel={(event) => event.stopPropagation()}>
                    {node.metadata?.prompt || node.metadata?.content || node.title}
                </p>
            </div>
            <div className="mt-3 flex shrink-0 items-center justify-between text-xs" style={{ color: theme.node.placeholder }}>
                <span>{node.metadata?.agentTaskType || "任务"}</span>
                <span className="flex items-center gap-1">
                    <CircleCheck className="size-3.5" />
                    尝试 {node.metadata?.agentTaskAttempts || 0}/2
                </span>
            </div>
        </div>
    );
}

export function BrandKitNodeContent({ node, theme }: NodeContentRendererProps) {
    const kit = node.metadata?.brandKit;
    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-5" style={{ color: theme.node.text }}>
            <div className="flex items-center gap-2 text-xs font-semibold">
                <Palette className="size-4" style={{ color: theme.node.activeStroke }} />
                灵感与视觉方向
            </div>
            <p className="text-sm leading-6">{kit?.summary || "等待补充品牌与视觉方向"}</p>
            {kit?.composition ? (
                <p className="text-xs leading-5" style={{ color: theme.node.placeholder }}>
                    构图：{kit.composition}
                </p>
            ) : null}
            {kit?.lighting ? (
                <p className="text-xs leading-5" style={{ color: theme.node.placeholder }}>
                    光线：{kit.lighting}
                </p>
            ) : null}
            <div className="flex gap-2">
                {kit?.colors?.map((color) => (
                    <span key={color} className="size-7 rounded-full border" style={{ background: color, borderColor: theme.node.stroke }} title={color} />
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                {(kit?.keywords || kit?.visualKeywords)?.map((word) => (
                    <span key={word} className="rounded-md border px-2 py-1 text-xs" style={{ background: theme.node.subtleSurface, borderColor: theme.node.subtleBorder, color: theme.node.subtleText }}>
                        {word}
                    </span>
                ))}
            </div>
            {kit?.avoid?.length ? (
                <p className="text-xs leading-5" style={{ color: theme.node.placeholder }}>
                    避免：{kit.avoid.join("；")}
                </p>
            ) : null}
        </div>
    );
}

export function GroupNodeContent({ node, theme, previewScale, scale }: NodeContentRendererProps) {
    const snapshots = node.metadata?.groupMemberSnapshots || [];
    const memberIds = node.metadata?.groupMemberIds || [];
    const cells = memberIds.length ? memberIds.map((id) => snapshots.find((item) => item.id === id) || { id, content: "", width: 0, height: 0 }) : snapshots;
    const columns = canvasGroupColumns(cells.length);
    const rows = canvasGroupRows(cells.length);
    const cellWidth = Math.max(1, Math.round((node.width - CANVAS_GROUP_CELL_INSET) / columns));
    const previewWidth = canvasImagePreviewWidthForTier(cellWidth, canvasImageZoomTier(previewScale ?? scale ?? 1));

    return (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex shrink-0 items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${theme.node.stroke}` }}>
                <Layers className="size-3.5 shrink-0" style={{ color: theme.node.activeStroke }} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.metadata?.groupLabel || node.title || "分镜组"}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: theme.node.subtleSurface, color: theme.node.subtleText }}>
                    {cells.length} 张
                </span>
            </div>
            {cells.length ? (
                <div className="grid min-h-0 flex-1 gap-1 p-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
                    {cells.map((cell, index) => (
                        <div key={cell.id} className="relative overflow-hidden rounded-lg" style={{ background: theme.node.subtleSurface }}>
                            {cell.content ? (
                                <img src={imagePreviewUrl(cell.content, previewWidth)} alt="" draggable={false} loading="eager" decoding="async" className="pointer-events-none size-full select-none object-cover" />
                            ) : (
                                <span className="grid size-full place-items-center" style={{ color: theme.node.placeholder }}>
                                    <ImageIcon className="size-4" aria-hidden />
                                </span>
                            )}
                            <span className="absolute left-1 top-1 rounded px-1 text-[9px] font-semibold leading-4 text-white" style={{ background: "rgba(15,23,42,.55)" }}>
                                {index + 1}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center text-xs" style={{ color: theme.node.placeholder }}>
                    空分镜组
                </div>
            )}
        </div>
    );
}

/** Grid padding (2*8) plus inter-cell gaps budgeted at the widest supported column count. */
const CANVAS_GROUP_CELL_INSET = 24;

export function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.activeStroke }}>
            <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            <span className="text-[10px] tracking-[0.2em]">生成中</span>
        </div>
    );
}

export function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden px-5 py-4 text-center">
            <div className="max-h-[60%] max-w-[260px] overflow-y-auto text-xs leading-5" style={{ color: theme.node.danger }}>
                {node.metadata?.errorDetails || "生成失败"}
            </div>
            <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: theme.node.dangerSurface, borderColor: theme.node.dangerBorder, color: theme.node.danger }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </button>
        </div>
    );
}

export function ReviewContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden px-5 py-4 text-center">
            <Clock3 className="size-6 shrink-0" style={{ color: theme.node.warningText }} />
            <div className="max-h-[55%] max-w-[280px] overflow-y-auto text-xs leading-5" style={{ color: theme.node.text }}>
                <div className="font-medium" style={{ color: theme.node.warningText }}>
                    等待状态确认
                </div>
                <div className="mt-1">{node.metadata?.errorDetails || "任务结果尚未确认，系统不会重复提交。"}</div>
            </div>
            <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition hover:brightness-95"
                style={{ background: theme.node.warningSurface, borderColor: theme.node.warningBorder, color: theme.node.warningText }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                检查状态
            </button>
        </div>
    );
}

export function CancelledContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 py-4 text-center" style={{ color: theme.node.placeholder }}>
            <CircleX className="size-6" />
            <span className="text-xs">任务已取消</span>
        </div>
    );
}

export function UnknownNodeContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: theme.node.placeholder }}>
            未知节点
        </div>
    );
}

export function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onGenerateImage }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const [expanded, setExpanded] = useState(false);
    const expandedEditorRef = useRef<HTMLTextAreaElement | null>(null);
    const content = node.metadata?.content || "";
    const characterCount = content.replace(/\s/g, "").length;
    const textStyle = {
        fontSize: `${fontSize}px`,
        lineHeight: `${Math.round(fontSize * 1.65)}px`,
        color: theme.node.text,
        boxSizing: "border-box",
    } as React.CSSProperties;
    const textClassName = "thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono outline-none select-text appearance-none";
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    const toolbarButtonClassName = "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100";
    const toolbarButtonStyle = { background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text };

    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
                <button
                    type="button"
                    className={toolbarButtonClassName}
                    style={toolbarButtonStyle}
                    onClick={(event) => {
                        event.stopPropagation();
                        setExpanded(true);
                    }}
                    onMouseDown={stop}
                    onPointerDown={stop}
                    title="放大阅读 / 编辑"
                    aria-label="放大阅读或编辑文字"
                >
                    <Maximize2 className="size-3.5" />
                    放大
                </button>
                <button
                    type="button"
                    className={toolbarButtonClassName}
                    style={toolbarButtonStyle}
                    onClick={(event) => {
                        event.stopPropagation();
                        onGenerateImage?.(node);
                    }}
                    onMouseDown={stop}
                    onPointerDown={stop}
                    title="用文本生图"
                    aria-label="用文本生图"
                >
                    <ImageIcon className="size-3.5" />
                    生图
                </button>
            </div>
            {isEditingContent ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    className={`${textClassName} resize-none`}
                    style={textStyle}
                    value={content}
                    references={mentionReferences}
                    highlightLabels
                    onChange={(value) => onContentChange(node.id, value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div className={textClassName} style={textStyle} onWheel={(event) => event.stopPropagation()}>
                    {content ? <CanvasResourceMentionText value={content} references={mentionReferences} /> : <span style={{ color: theme.node.placeholder }}>点击编辑文字</span>}
                </div>
            )}

            <div className="contents" onClick={stop} onDoubleClick={stop} onMouseDown={stop} onPointerDown={stop} onWheel={stop} onContextMenu={stop}>
                <Modal
                    className="canvas-prompt-editor-modal"
                    open={expanded}
                    title="编辑文字"
                    centered
                    destroyOnHidden
                    mask={{ closable: false }}
                    width="min(860px, calc(100vw - 24px))"
                    onCancel={() => setExpanded(false)}
                    afterOpenChange={(open) => {
                        if (!open) return;
                        requestAnimationFrame(() => {
                            const textarea = expandedEditorRef.current;
                            textarea?.focus();
                            textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
                        });
                    }}
                    styles={{
                        container: { background: theme.node.panel, border: `1px solid ${theme.toolbar.border}`, color: theme.node.text },
                        header: { background: theme.node.panel, marginBottom: 0, paddingBottom: 8 },
                        title: { color: theme.node.text },
                        body: { background: theme.node.panel, padding: "4px 12px 12px" },
                    }}
                    footer={null}
                >
                    <div className="min-w-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke }}>
                        <CanvasResourceMentionTextarea
                            ref={expandedEditorRef}
                            autoFocus={expanded}
                            value={content}
                            references={mentionReferences}
                            highlightLabels
                            onChange={(value) => onContentChange(node.id, value)}
                            aria-label="文字编辑器"
                            className="thin-scrollbar h-[min(62vh,34rem)] min-h-64 w-full resize-none overflow-y-auto overscroll-contain border-0 px-4 py-3 outline-none"
                            style={{ background: theme.node.fill, color: theme.node.text, fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px` }}
                            placeholder="请输入文字内容"
                        />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: theme.node.placeholder }}>
                            字数 {characterCount}
                        </span>
                        <Button icon={<Minimize2 className="size-4" />} onClick={() => setExpanded(false)} aria-label="收起">
                            收起
                        </Button>
                    </div>
                </Modal>
            </div>
        </div>
    );
}

export function ResourceLabelBadge({ reference }: { reference: CanvasResourceReference }) {
    return (
        <span className={`pointer-events-none absolute right-2 top-0 z-[80] -translate-y-[calc(100%+6px)] rounded-md px-1.5 py-0.5 text-[10px] font-medium ${reference.active ? "bg-[#2f80ff] text-white shadow-sm" : "bg-black/35 text-white/75"}`}>
            {reference.label}
        </span>
    );
}

export function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <LoadingContent theme={props.theme} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />
            ) : props.node.metadata?.status === "cancelled" ? (
                <CancelledContent theme={props.theme} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} snapshots={props.node.metadata?.batchMemberSnapshots} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!props.node.metadata?.content) return <EmptyImageContent {...props} />;
    return (
        <ImageContent
            node={props.node}
            scale={props.scale}
            previewScale={props.previewScale}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
            onImageDimensions={props.onImageDimensions}
        />
    );
}

export function EmptyImageContent({ node, theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch }: NodeContentRendererProps) {
    const content = (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center rounded-2xl border" style={{ background: theme.node.subtleSurface, borderColor: theme.node.subtleBorder, color: theme.node.subtleText }}>
                <ImageIcon className="size-6 opacity-30" />
            </div>
            <span className="text-[10px] tracking-[0.18em] opacity-50">空图片节点</span>
        </div>
    );
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} snapshots={node.metadata?.batchMemberSnapshots} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

// 只有真正进入视口才挂载 <video>，离开视口整体卸载以释放解码器和缓冲区。
// 100+ 图片 / 50+ 视频同屏时，浏览器同时活跃的 media element 有硬上限
// (Chrome 约 75-100)，裸挂所有视频节点会撞到这个上限造成静默失效或卡顿。
function useElementOnScreen(ref: React.RefObject<Element | null>, rootMargin = "300px") {
    const [onScreen, setOnScreen] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, rootMargin]);
    return onScreen;
}

export function VideoNodeContent({ node, theme }: NodeContentRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onScreen = useElementOnScreen(containerRef);
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
                <Video className="size-7 opacity-35" />
                <span className="text-sm">空视频节点</span>
            </div>
        );
    return (
        <div ref={containerRef} className="h-full w-full">
            {onScreen ? (
                <video src={node.metadata.content} controls muted playsInline preload="metadata" className="h-full w-full rounded-[18px] bg-black object-contain" data-canvas-video data-canvas-no-zoom />
            ) : (
                <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-black/90">
                    <Video className="size-7 opacity-40" style={{ color: theme.node.placeholder }} />
                </div>
            )}
        </div>
    );
}

export function PanoramaNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Globe2 className="size-7 opacity-35" />
                <span className="text-sm">空全景节点</span>
                <span className="text-[10px] opacity-55">360° · 2:1</span>
            </div>
        );
    return <CanvasPanoramaViewer src={node.metadata.content} alt={node.title || "全景图"} />;
}

export function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">空音频节点</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{node.title || "音频"}</span>
            </div>
            <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

export function ImageContent({
    node,
    scale = 1,
    previewScale,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
    onImageDimensions,
}: {
    node: CanvasNodeData;
    scale?: number;
    previewScale?: number;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onImageDimensions?: (nodeId: string, naturalWidth: number, naturalHeight: number) => void;
}) {
    const colorTheme = useCanvasColorTheme().theme;
    const theme = canvasThemes[colorTheme];
    const isBatchChild = Boolean(node.metadata?.batchRootId);
    const imageRef = useRef<HTMLImageElement>(null);
    const previewWidth = canvasImagePreviewWidthForTier(node.width, canvasImageZoomTier(previewScale ?? scale), node.metadata?.naturalWidth);
    const reportDimensions = useCallback(
        (image: HTMLImageElement) => {
            if (node.metadata?.naturalWidth && node.metadata?.naturalHeight) return;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) onImageDimensions?.(node.id, image.naturalWidth, image.naturalHeight);
        },
        [node.id, node.metadata?.naturalHeight, node.metadata?.naturalWidth, onImageDimensions],
    );

    useEffect(() => {
        const image = imageRef.current;
        if (image?.complete) reportDimensions(image);
    }, [node.metadata?.content, reportDimensions]);

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} snapshots={node.metadata?.batchMemberSnapshots} onToggleBatch={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-3xl" style={{ background: theme.node.fill }}>
                <img
                    ref={imageRef}
                    src={imagePreviewUrl(node.metadata!.content!, previewWidth)}
                    alt={node.title}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    onLoad={(event) => reportDimensions(event.currentTarget)}
                    onDragStart={(event) => event.preventDefault()}
                    className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                />
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none opacity-85">{batchCount}</span>
                    <ChevronRight className={`size-3.5 transition-transform ${batchExpanded ? "rotate-90" : ""}`} style={{ color: theme.node.muted }} />
                </button>
            ) : null}
            {isBatchChild ? (
                node.metadata?.isBatchPrimary ? (
                    <div
                        className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.placeholder }}
                        aria-disabled="true"
                    >
                        <Star className="size-3.5 fill-[#2f80ff] text-[#2f80ff]" />
                        当前主图
                    </div>
                ) : (
                    <button
                        type="button"
                        className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onSetBatchPrimary?.();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <Star className="size-3.5 text-[#2f80ff]" />
                        设为主图
                    </button>
                )
            ) : null}
        </BatchFrame>
    );
}

export function canvasImagePreviewWidth(nodeWidth: number, scale: number, naturalWidth?: number) {
    return canvasImagePreviewWidthForTier(nodeWidth, canvasImageZoomTier(scale), naturalWidth);
}

export function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <span className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </span>
        </div>
    );
}

export function BatchFrame({
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    snapshots = [],
    onToggleBatch,
    children,
}: {
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    snapshots?: CanvasGroupMemberSnapshot[];
    onToggleBatch?: () => void;
    children: ReactNode;
}) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const [hovered, setHovered] = useState(false);
    const isBatchRoot = batchCount > 1;
    // Behind-card previews: prefer real child thumbnails, fall back to blank cards while they load.
    const behindCards = snapshots.length ? snapshots.slice(0, 5) : Array.from({ length: Math.min(batchCount - 1, 5) }, () => null);
    const fanned = hovered && !batchExpanded;
    return (
        <div
            className="group/batch relative h-full w-full overflow-visible"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onDoubleClick={
                isBatchRoot
                    ? (event) => {
                          event.stopPropagation();
                          onToggleBatch?.();
                      }
                    : undefined
            }
        >
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {behindCards.map((snapshot, index) => {
                        const spread = behindCards.length > 1 ? index / (behindCards.length - 1) - 0.5 : 0;
                        const restTransform = batchOpening || batchRecovering ? `translate(${8 + index * 6}px, ${26 + index * 20}px) scale(.98)` : `translate(${6 + index * 5}px, ${18 + index * 16}px)`;
                        const fannedTransform = `translate(${spread * (58 + behindCards.length * 12)}px, ${34 + index * 6}px) rotate(${spread * 16}deg)`;
                        return (
                            <div
                                key={snapshot?.id || index}
                                className="absolute overflow-hidden rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300"
                                style={{
                                    inset: 0,
                                    background: snapshot?.content ? theme.node.fill : `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                    borderColor: theme.node.stroke,
                                    opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                    transform: fanned ? fannedTransform : restTransform,
                                    transformOrigin: "top center",
                                    zIndex: -index - 1,
                                }}
                            >
                                {snapshot?.content ? <img src={imagePreviewUrl(snapshot.content, 320)} alt="" draggable={false} loading="lazy" decoding="async" className="pointer-events-none size-full select-none object-cover" /> : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}
            {children}
        </div>
    );
}
export function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div data-canvas-resize-corner={corner} className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

export function ConnectionHandleDot({ side, visible, onConnectStart }: { side: "left" | "right"; visible: boolean; onConnectStart: (event: React.MouseEvent | React.PointerEvent) => void }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];

    return (
        <div
            data-canvas-handle={side === "left" ? "target" : "source"}
            aria-label={side === "left" ? "输入连接点" : "输出连接点"}
            className={`absolute top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${
                side === "left" ? "-left-6" : "-right-6"
            } ${visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            onMouseDown={onConnectStart}
            onPointerDown={(event) => {
                if (event.pointerType !== "mouse") onConnectStart(event);
            }}
            style={{ touchAction: "none" }}
        >
            <div className="size-3 rounded-full border-2 transition-all hover:scale-125" style={{ background: theme.node.panel, borderColor: theme.node.muted }} />
        </div>
    );
}

const TASK_STATUS_LABELS = {
    ready: "等待执行",
    pending: "等待执行",
    running: "执行中",
    paused: "已暂停",
    waiting_user: "等待确认",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
} as const;

function taskStatusTheme(status: keyof typeof TASK_STATUS_LABELS, theme: NodeContentRendererProps["theme"]) {
    if (status === "running") return { surface: theme.node.infoSurface, border: theme.node.infoBorder, text: theme.node.infoText };
    if (status === "completed") return { surface: theme.node.successSurface, border: theme.node.successBorder, text: theme.node.successText };
    if (status === "paused" || status === "waiting_user") return { surface: theme.node.warningSurface, border: theme.node.warningBorder, text: theme.node.warningText };
    if (status === "failed") return { surface: theme.node.dangerSurface, border: theme.node.dangerBorder, text: theme.node.danger };
    return { surface: theme.node.subtleSurface, border: theme.node.subtleBorder, text: theme.node.subtleText };
}
