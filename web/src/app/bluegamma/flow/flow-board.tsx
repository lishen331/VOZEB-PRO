"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import { NODE_BODY_H, NODE_W, ROW_Y, canvasWidth, edgePath, nodeX } from "@/app/bluegamma/flow/flow-layout";
import { FlowNode } from "@/app/bluegamma/flow/flow-node";
import { canGenerate, nodeOf, type FlowState } from "@/app/bluegamma/flow/flow-state";
import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const CANVAS_H = 640;

export interface FlowBoardHandle {
    /** 把某一步移到可视区中间（右侧抽屉打开时留出抽屉宽度） */
    focusStep: (key: string) => void;
}

interface FlowBoardProps {
    flow: MajorFlow;
    state: FlowState;
    currentKey: string | null;
    /** 右侧被抽屉占掉的宽度 */
    rightInset: number;
    onSelect: (key: string) => void;
    onCreate: (key: string) => void;
    onBlank: () => void;
    ref?: Ref<FlowBoardHandle>;
}

/** 连线：上游完成才实线亮起；目标在跑时流动 */
function FlowEdges({ flow, state }: { flow: MajorFlow; state: FlowState }) {
    return (
        <svg aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={canvasWidth(flow)} height={CANVAS_H}>
            <defs>
                <linearGradient id="flow-edge" x1="0" x2="1">
                    <stop offset="0%" stopColor="#0050f5" />
                    <stop offset="100%" stopColor="#28ebfa" />
                </linearGradient>
            </defs>
            {flow.steps.flatMap((step, toIndex) =>
                (step.refs ?? []).map((ref) => {
                    const fromIndex = flow.steps.findIndex((item) => item.key === ref);
                    const from = nodeOf(state, ref);
                    const to = nodeOf(state, step.key);
                    const live = from?.status === "done" && Boolean(to);
                    return (
                        <path
                            key={`${ref}-${step.key}`}
                            d={edgePath(fromIndex, toIndex)}
                            fill="none"
                            stroke={live ? "url(#flow-edge)" : "var(--gm-border-strong)"}
                            strokeWidth={live ? 2 : 1.25}
                            strokeDasharray={live ? (to?.status === "running" ? "6 6" : undefined) : "4 6"}
                            className={cn("transition-[stroke] duration-500", to?.status === "running" && "gm-edge-flow")}
                            opacity={toIndex - fromIndex > 1 && !live ? 0.5 : 1}
                        />
                    );
                }),
            )}
            {flow.steps.map((step, index) => (
                <circle key={step.key} cx={nodeX(index)} cy={ROW_Y + NODE_BODY_H / 2} r={3.5} fill="var(--gm-bg)" stroke="var(--gm-border-strong)" />
            ))}
        </svg>
    );
}

/** 平移 + 缩放：拖空白处平移，Ctrl/⌘ + 滚轮缩放，普通滚轮横向平移 */
function useViewport() {
    const [view, setView] = useState({ x: 0, y: 0, zoom: 0.85 });
    const drag = useRef<{ startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
    const zoomBy = useCallback((factor: number) => setView((current) => ({ ...current, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor)) })), []);
    return { view, setView, drag, zoomBy };
}

export function FlowBoard({ flow, state, currentKey, rightInset, onSelect, onCreate, onBlank, ref }: FlowBoardProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const { view, setView, drag, zoomBy } = useViewport();

    const focusStep = useCallback(
        (key: string) => {
            const element = viewportRef.current;
            const index = flow.steps.findIndex((step) => step.key === key);
            if (!element || index < 0) return;
            setView((current) => {
                const visibleW = element.clientWidth - rightInset;
                const centerX = nodeX(index) + NODE_W / 2;
                const centerY = ROW_Y + NODE_BODY_H / 2 - 20;
                return { ...current, x: visibleW / 2 - centerX * current.zoom, y: element.clientHeight / 2 - centerY * current.zoom };
            });
        },
        [flow.steps, rightInset, setView],
    );
    useImperativeHandle(ref, () => ({ focusStep }), [focusStep]);

    /** 初次进入：整条流程缩放到可视区 */
    const fitAll = useCallback(() => {
        const element = viewportRef.current;
        if (!element) return;
        const zoom = Math.min(1, Math.max(MIN_ZOOM, (element.clientWidth - rightInset - 48) / canvasWidth(flow)));
        setView({ zoom, x: (element.clientWidth - rightInset - canvasWidth(flow) * zoom) / 2, y: element.clientHeight / 2 - (ROW_Y + NODE_BODY_H / 2) * zoom });
    }, [flow, rightInset, setView]);
    useEffect(() => {
        fitAll();
        // 只在切换专业时重新铺满，抽屉开关不重置视角
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flow.slug]);

    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
                return;
            }
            setView((current) => ({ ...current, x: current.x - (event.shiftKey ? event.deltaY : event.deltaX || event.deltaY), y: current.y - (event.shiftKey ? 0 : event.deltaX ? event.deltaY : 0) }));
        };
        element.addEventListener("wheel", handleWheel, { passive: false });
        return () => element.removeEventListener("wheel", handleWheel);
    }, [setView, zoomBy]);

    return (
        <div
            ref={viewportRef}
            role="application"
            aria-label="创作画布"
            className="gm-flow-dots relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
            onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                drag.current = { startX: event.clientX, startY: event.clientY, x: view.x, y: view.y, moved: false };
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
                const start = drag.current;
                if (!start) return;
                const dx = event.clientX - start.startX;
                const dy = event.clientY - start.startY;
                if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
                setView((current) => ({ ...current, x: start.x + dx, y: start.y + dy }));
            }}
            onPointerUp={() => {
                if (drag.current && !drag.current.moved) onBlank();
                drag.current = null;
            }}
            style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px` }}
        >
            <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, width: canvasWidth(flow), height: CANVAS_H }}>
                <FlowEdges flow={flow} state={state} />
                {flow.steps.map((step, index) => (
                    <FlowNode
                        key={step.key}
                        step={step}
                        index={index}
                        node={nodeOf(state, step.key)}
                        selected={state.selectedKey === step.key}
                        current={currentKey === step.key}
                        locked={!canGenerate(flow, state, step.key)}
                        onSelect={() => onSelect(step.key)}
                        onCreate={() => onCreate(step.key)}
                    />
                ))}
            </div>

            <div className="gm-glass absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-full p-1">
                <button type="button" aria-label="缩小" onClick={() => zoomBy(1 / 1.15)} className="grid size-7 place-items-center rounded-full text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                    <Minus className="size-3.5" />
                </button>
                <span className="w-11 text-center font-mono text-[11px] text-[var(--gm-text-2)] tabular-nums">{Math.round(view.zoom * 100)}%</span>
                <button type="button" aria-label="放大" onClick={() => zoomBy(1.15)} className="grid size-7 place-items-center rounded-full text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                    <Plus className="size-3.5" />
                </button>
                <span className="mx-0.5 h-4 w-px bg-[var(--gm-border)]" />
                <button type="button" aria-label="铺满整条流程" onClick={fitAll} className="grid size-7 place-items-center rounded-full text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                    <Maximize2 className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
