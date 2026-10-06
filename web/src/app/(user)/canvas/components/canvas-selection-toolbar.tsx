"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "antd";
import { Copy, FolderPlus, Layers, Play, Trash2, Ungroup } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasColorTheme } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "../types";

export type CanvasSelectionToolbarProps = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
    /** Multi-select actions (2+ plain nodes). */
    onSaveAssets: () => void;
    onDuplicateSelection: () => void;
    onGroupSelection: () => void;
    /** 生成组 actions (exactly one Container selected). */
    onRunContainer: () => void;
    onDissolveContainer: () => void;
    onDeleteSelection: () => void;
};

type SelectionMode = "multi" | "container";

/**
 * Action strip anchored to the top-left of the current selection, like the
 * reference canvas. Deliberately a screen-space sibling of the surface (not a
 * world-layer child) so the buttons keep a constant on-screen size at any zoom.
 *
 * Position is expressed in CSS with the --canvas-pan-* / --canvas-zoom variables
 * that canvas-surface publishes imperatively every gesture frame. Reading the
 * `viewport` prop instead would make the strip lag a whole gesture behind, the
 * same reason the node hover toolbar does it this way.
 */
export function CanvasSelectionToolbar({ nodes, selectedNodeIds, viewport, onSaveAssets, onDuplicateSelection, onGroupSelection, onRunContainer, onDissolveContainer, onDeleteSelection }: CanvasSelectionToolbarProps) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [metrics, setMetrics] = useState({ width: 0, viewportWidth: 0 });

    const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
    const containerNode = selectedNodes.length === 1 && selectedNodes[0].type === CanvasNodeType.Container ? selectedNodes[0] : null;
    const mode: SelectionMode | null = containerNode ? "container" : selectedNodes.length >= 2 ? "multi" : null;

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

    if (!mode) return null;

    // Selection bounding box in world units. The strip hangs off its top-left
    // corner, so it tracks whichever members the user has currently boxed.
    const left = Math.min(...selectedNodes.map((node) => node.position.x));
    const top = Math.min(...selectedNodes.map((node) => node.position.y));
    const anchorLeft = `calc(var(--canvas-pan-x, ${viewport.x}px) + ${left} * var(--canvas-zoom, ${viewport.k}) * 1px)`;
    const anchorTop = `calc(var(--canvas-pan-y, ${viewport.y}px) + ${top} * var(--canvas-zoom, ${viewport.k}) * 1px - 14px)`;
    const safeWidth = Math.min(metrics.width || 0, Math.max(0, metrics.viewportWidth - 24));
    // Clamp in CSS so it re-evaluates mid-gesture along with the anchor above;
    // the bounds still come from the real measured width, which only JS knows.
    const toolbarLeft = metrics.viewportWidth && safeWidth ? `clamp(12px, ${anchorLeft}, ${metrics.viewportWidth - safeWidth - 12}px)` : anchorLeft;

    const multiTools: SelectionTool[] = [
        { id: "save-assets", label: "保存到资产", icon: <FolderPlus className="size-3.5" />, onClick: onSaveAssets },
        { id: "duplicate", label: "创建副本", icon: <Copy className="size-3.5" />, onClick: onDuplicateSelection },
        { id: "group", label: "打组", icon: <Layers className="size-3.5" />, onClick: onGroupSelection },
    ];
    const containerTools: SelectionTool[] = [
        { id: "run-container", label: "整组执行", icon: <Play className="size-3.5" />, onClick: onRunContainer },
        { id: "dissolve-container", label: "解组", icon: <Ungroup className="size-3.5" />, onClick: onDissolveContainer },
    ];
    const tools = mode === "container" ? containerTools : multiTools;

    return (
        <div
            ref={toolbarRef}
            data-canvas-selection-toolbar
            data-canvas-selection-mode={mode}
            className="canvas-selection-toolbar absolute z-[70] flex h-9 max-w-[calc(100vw-24px)] items-center overflow-x-auto rounded-lg border shadow-[0_7px_22px_rgba(15,23,42,.14)]"
            style={{ left: toolbarLeft, top: anchorTop, transform: "translate(0, -100%)", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {tools.map((tool) => (
                <SelectionToolButton key={tool.id} {...tool} theme={theme} />
            ))}
            <span className="mx-1 h-5 w-px shrink-0" style={{ background: theme.toolbar.border }} />
            <SelectionToolButton id="delete-selection" label="删除" icon={<Trash2 className="size-3.5" />} onClick={onDeleteSelection} danger theme={theme} />
        </div>
    );
}

type SelectionTool = {
    id: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    danger?: boolean;
};

function SelectionToolButton({ label, icon, onClick, danger = false, theme }: SelectionTool & { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <Tooltip title={label} placement="top" mouseEnterDelay={0.2}>
            <button type="button" aria-label={label} className="group flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium transition" style={{ color: danger ? "#ef4444" : theme.toolbar.item }} onClick={onClick}>
                {icon}
                <span className="whitespace-nowrap">{label}</span>
            </button>
        </Tooltip>
    );
}
