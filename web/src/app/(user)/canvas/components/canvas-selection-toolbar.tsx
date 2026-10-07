"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "antd";
import { Camera, ChevronDown, Columns3, Copy, Download, FolderPlus, LayoutGrid, Layers, Loader2, Play, Rows3, Trash2, Ungroup } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasColorTheme } from "@/stores/use-theme-store";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasNodeData, type ViewportTransform } from "../types";
import { CANVAS_CONTAINER_COLORS, type CanvasContainerArrangement } from "../utils/canvas-container-group";
import { CANVAS_GROUP_MIN_MEMBERS } from "../utils/canvas-storyboard-group";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

export type CanvasSelectionToolbarProps = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
    /** Multi-select actions (2+ plain nodes). */
    onSaveAssets: () => void;
    onDuplicateSelection: () => void;
    onGroupSelection: () => void;
    /** 生成组 actions (exactly one Container selected). */
    onRunContainer: (containerId: string) => void;
    onDissolveContainer: (containerId: string) => void;
    onArrangeContainer: (containerId: string, arrangement: CanvasContainerArrangement) => void;
    onSetContainerColor: (containerId: string, color: string | undefined) => void;
    onConvertContainerToStoryboard: (containerId: string) => void;
    onDownloadContainer: (containerId: string) => void;
    downloadPending?: boolean;
    onDeleteSelection: () => void;
};

type SelectionMode = "multi" | "container";
type OpenMenu = "color" | "arrange" | null;

const ARRANGEMENTS: { id: CanvasContainerArrangement; label: string; icon: ReactNode }[] = [
    { id: "grid", label: "宫格排列", icon: <LayoutGrid className="size-4" /> },
    { id: "row", label: "横向排列", icon: <Columns3 className="size-4" /> },
    { id: "column", label: "纵向排列", icon: <Rows3 className="size-4" /> },
];

/**
 * Action strip anchored to the top-left of the current selection, like the
 * reference canvas. Screen-space sibling of the surface so the buttons keep a
 * constant on-screen size at any zoom; positioned with the --canvas-pan-* /
 * --canvas-zoom variables canvas-surface publishes every gesture frame.
 */
export function CanvasSelectionToolbar(props: CanvasSelectionToolbarProps) {
    const { nodes, selectedNodeIds, viewport } = props;
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [metrics, setMetrics] = useState({ width: 0, viewportWidth: 0 });
    const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

    const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
    const containerNode = selectedNodes.length === 1 && selectedNodes[0].type === CanvasNodeType.Container ? selectedNodes[0] : null;
    const mode: SelectionMode | null = containerNode ? "container" : selectedNodes.length >= 2 ? "multi" : null;
    const containerId = containerNode?.id;

    useEffect(() => {
        const toolbar = toolbarRef.current;
        if (!toolbar || typeof window === "undefined") return;
        const sync = () => setMetrics({ width: toolbar.offsetWidth, viewportWidth: window.innerWidth });
        sync();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
        observer?.observe(toolbar);
        window.addEventListener("resize", sync);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", sync);
        };
    }, [mode]);

    useEffect(() => setOpenMenu(null), [containerId, mode]);

    useEffect(() => {
        if (!openMenu) return;
        const close = (event: PointerEvent) => {
            if (!toolbarRef.current?.contains(event.target as Node)) setOpenMenu(null);
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [openMenu]);

    if (!mode) return null;

    const left = Math.min(...selectedNodes.map((node) => node.position.x));
    const top = Math.min(...selectedNodes.map((node) => node.position.y));
    const anchorLeft = `calc(var(--canvas-pan-x, ${viewport.x}px) + ${left} * var(--canvas-zoom, ${viewport.k}) * 1px)`;
    const anchorTop = `calc(var(--canvas-pan-y, ${viewport.y}px) + ${top} * var(--canvas-zoom, ${viewport.k}) * 1px - 16px)`;
    const safeWidth = Math.min(metrics.width || 0, Math.max(0, metrics.viewportWidth - 24));
    const toolbarLeft = metrics.viewportWidth && safeWidth ? `clamp(12px, ${anchorLeft}, ${metrics.viewportWidth - safeWidth - 12}px)` : anchorLeft;

    return (
        <div
            ref={toolbarRef}
            data-canvas-selection-toolbar
            data-canvas-selection-mode={mode}
            className="canvas-selection-toolbar absolute z-[70] flex h-12 items-center gap-0.5 rounded-2xl border px-2 shadow-[0_10px_30px_rgba(15,23,42,.22)]"
            style={{ left: toolbarLeft, top: anchorTop, transform: "translate(0, -100%)", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {mode === "container" && containerNode ? <ContainerTools {...props} container={containerNode} theme={theme} openMenu={openMenu} setOpenMenu={setOpenMenu} /> : <MultiTools {...props} theme={theme} />}
        </div>
    );
}

type ContainerToolsProps = CanvasSelectionToolbarProps & { container: CanvasNodeData; theme: CanvasTheme; openMenu: OpenMenu; setOpenMenu: (menu: OpenMenu) => void };

function ContainerTools({ container, nodes, theme, openMenu, setOpenMenu, downloadPending, ...actions }: ContainerToolsProps) {
    const id = container.id;
    const imageCount = nodes.filter((node) => node.metadata?.containerId === id && isCanvasImageNodeType(node.type) && !node.metadata?.groupId).length;
    const canConvert = imageCount >= CANVAS_GROUP_MIN_MEMBERS;
    const currentColor = container.metadata?.containerColor;
    const toggle = (menu: OpenMenu) => setOpenMenu(openMenu === menu ? null : menu);

    return (
        <>
            <div className="relative">
                <ToolButton label="组颜色" theme={theme} active={openMenu === "color"} onClick={() => toggle("color")}>
                    <span className="size-5 rounded-full border" style={{ background: currentColor || theme.node.muted, borderColor: theme.toolbar.border }} />
                </ToolButton>
                {openMenu === "color" ? (
                    <MenuPanel theme={theme}>
                        <div className="flex items-center gap-1.5 p-1">
                            {CANVAS_CONTAINER_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={`组颜色 ${color}`}
                                    aria-pressed={currentColor === color}
                                    className="size-6 rounded-full border-2 transition hover:scale-110"
                                    style={{ background: color, borderColor: currentColor === color ? theme.toolbar.item : "transparent" }}
                                    onClick={() => {
                                        actions.onSetContainerColor(id, color);
                                        setOpenMenu(null);
                                    }}
                                />
                            ))}
                            <button
                                type="button"
                                className="ml-1 rounded-md px-2 py-1 text-xs"
                                style={{ color: theme.toolbar.item }}
                                onClick={() => {
                                    actions.onSetContainerColor(id, undefined);
                                    setOpenMenu(null);
                                }}
                            >
                                默认
                            </button>
                        </div>
                    </MenuPanel>
                ) : null}
            </div>
            <div className="relative">
                <ToolButton label="排列方式" theme={theme} active={openMenu === "arrange"} onClick={() => toggle("arrange")}>
                    <LayoutGrid className="size-5" />
                    <ChevronDown className="size-3.5 opacity-70" />
                </ToolButton>
                {openMenu === "arrange" ? (
                    <MenuPanel theme={theme}>
                        {ARRANGEMENTS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition hover:bg-white/10"
                                style={{ color: theme.toolbar.item }}
                                onClick={() => {
                                    actions.onArrangeContainer(id, item.id);
                                    setOpenMenu(null);
                                }}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </MenuPanel>
                ) : null}
            </div>
            <Divider theme={theme} />
            <ToolButton label="整组执行" showLabel theme={theme} onClick={() => actions.onRunContainer(id)}>
                <Play className="size-5" />
            </ToolButton>
            <ToolButton label={canConvert ? "转分镜组" : `至少 ${CANVAS_GROUP_MIN_MEMBERS} 张图片才能转分镜组`} text="转分镜组" showLabel disabled={!canConvert} theme={theme} onClick={() => actions.onConvertContainerToStoryboard(id)}>
                <Camera className="size-5" />
            </ToolButton>
            <ToolButton label="解组" showLabel theme={theme} onClick={() => actions.onDissolveContainer(id)}>
                <Ungroup className="size-5" />
            </ToolButton>
            <Divider theme={theme} />
            <ToolButton label="下载组内图片和视频" disabled={downloadPending} theme={theme} onClick={() => actions.onDownloadContainer(id)}>
                {downloadPending ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
            </ToolButton>
            <ToolButton label="删除" danger theme={theme} onClick={actions.onDeleteSelection}>
                <Trash2 className="size-5" />
            </ToolButton>
        </>
    );
}

function MultiTools({ theme, onSaveAssets, onDuplicateSelection, onGroupSelection, onDeleteSelection }: CanvasSelectionToolbarProps & { theme: CanvasTheme }) {
    return (
        <>
            <ToolButton label="保存到资产" showLabel theme={theme} onClick={onSaveAssets}>
                <FolderPlus className="size-5" />
            </ToolButton>
            <ToolButton label="创建副本" showLabel theme={theme} onClick={onDuplicateSelection}>
                <Copy className="size-5" />
            </ToolButton>
            <ToolButton label="打组" showLabel theme={theme} onClick={onGroupSelection}>
                <Layers className="size-5" />
            </ToolButton>
            <Divider theme={theme} />
            <ToolButton label="删除" danger theme={theme} onClick={onDeleteSelection}>
                <Trash2 className="size-5" />
            </ToolButton>
        </>
    );
}

type ToolButtonProps = { label: string; text?: string; showLabel?: boolean; danger?: boolean; disabled?: boolean; active?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode };

function ToolButton({ label, text, showLabel = false, danger = false, disabled = false, active = false, theme, onClick, children }: ToolButtonProps) {
    const color = danger ? "#ef4444" : theme.toolbar.item;
    return (
        <Tooltip title={showLabel && !disabled ? null : label} placement="top" mouseEnterDelay={0.2}>
            <button
                type="button"
                aria-label={text || label}
                disabled={disabled}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                style={{ color, background: active ? "rgba(255,255,255,.1)" : undefined }}
                onClick={onClick}
            >
                {children}
                {showLabel ? <span className="whitespace-nowrap">{text || label}</span> : null}
            </button>
        </Tooltip>
    );
}

function MenuPanel({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <div className="absolute left-0 top-full mt-2 min-w-36 rounded-xl border p-1 shadow-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
            {children}
        </div>
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <span className="mx-1.5 h-6 w-px shrink-0" style={{ background: theme.toolbar.border }} />;
}
