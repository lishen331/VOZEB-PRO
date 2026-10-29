"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Lock, Play, Plus } from "lucide-react";

import { GammaSkeleton } from "@/components/gamma-ui/gamma-data";
import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import { FlowArtwork, KIND_ICON } from "@/app/bluegamma/flow/flow-artwork";
import { NODE_BODY_H, NODE_W, ROW_Y, nodeX } from "@/app/bluegamma/flow/flow-layout";
import type { FlowNodeState } from "@/app/bluegamma/flow/flow-state";
import type { FlowStep } from "@/app/bluegamma/flow/flow-types";
import { cn } from "@/lib/utils";

const STATUS_TEXT = { draft: "待生成", running: "生成中", done: "已完成", stale: "需更新" } as const;

interface FlowNodeProps {
    step: FlowStep;
    index: number;
    node?: FlowNodeState;
    selected: boolean;
    /** 是流程当前该做的那一步 */
    current: boolean;
    /** 上游未完成 */
    locked: boolean;
    onSelect: () => void;
    onCreate: () => void;
}

/** 未放上画布的步骤：虚线占位，告诉学生“下一步做什么” */
function GhostNode({ step, index, current, locked, onCreate }: Pick<FlowNodeProps, "step" | "index" | "current" | "locked" | "onCreate">) {
    const Icon = KIND_ICON[step.kind];
    return (
        <button
            type="button"
            onClick={onCreate}
            data-step={step.key}
            aria-label={`新建「${step.name}」节点`}
            style={{ left: nodeX(index), top: ROW_Y - 34, width: NODE_W }}
            className={cn("group absolute flex flex-col gap-2 text-left focus-visible:outline-none", current ? "opacity-100" : "opacity-55 hover:opacity-90 focus-visible:opacity-90")}
        >
            <span className="flex items-center gap-2 px-1 text-[13px] text-[var(--gm-text-3)]">
                <span className="font-mono text-[11px]">{String(index + 1).padStart(2, "0")}</span>
                {step.name}
            </span>
            <span
                style={{ height: NODE_BODY_H }}
                className={cn(
                    "grid w-full place-items-center rounded-[var(--gm-radius-lg)] border border-dashed transition-colors group-focus-visible:ring-2 group-focus-visible:ring-[var(--gm-accent)]",
                    current ? "border-[var(--gm-accent)] bg-[var(--gm-accent-soft)]" : "border-[var(--gm-border-strong)] bg-[var(--gm-wash)] group-hover:border-[var(--gm-accent-ring)]",
                )}
            >
                <span className="flex flex-col items-center gap-2 px-6 text-center">
                    <span className={cn("grid size-9 place-items-center rounded-full", current ? "bg-[var(--gm-blue)] text-white" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)]")}>
                        {current ? <Plus className="size-4" /> : <Icon className="size-4" />}
                    </span>
                    <span className="text-xs text-[var(--gm-text-2)]">{step.goal}</span>
                    {locked && !current ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--gm-text-3)]">
                            <Lock className="size-3" />
                            完成前面的步骤后可生成
                        </span>
                    ) : null}
                </span>
            </span>
        </button>
    );
}

/** 生成结果区：文本要点 / 图片 / 视频 / 音频波形 */
function NodeBody({ step, node }: { step: FlowStep; node: FlowNodeState }) {
    if (node.status === "running") {
        return (
            <div className="flex h-full flex-col gap-2 p-3">
                <GammaSkeleton className="h-full w-full rounded-[10px]" />
            </div>
        );
    }
    if (node.status === "draft") {
        const Icon = KIND_ICON[step.kind];
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--gm-text-3)]">
                <Icon className="size-6" />
                <span className="text-xs">在右侧选模板或写描述，然后点生成</span>
            </div>
        );
    }
    if (step.kind === "text") {
        return (
            <ul className="flex h-full flex-col gap-1.5 overflow-hidden p-3.5 text-[12px] leading-relaxed text-[var(--gm-text-2)]">
                {(node.lines ?? []).map((line) => (
                    <li key={line} className="flex gap-1.5">
                        <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--gm-accent)]" />
                        <span className="line-clamp-2">{line}</span>
                    </li>
                ))}
            </ul>
        );
    }
    if (step.kind === "audio") {
        return (
            <div className="flex h-full items-center gap-[3px] px-5">
                {Array.from({ length: 36 }, (_, bar) => (
                    <span key={bar} className="w-1 rounded-full bg-[var(--gm-accent)]" style={{ height: `${18 + Math.abs(Math.sin(bar * 1.7)) * 60}%`, opacity: 0.45 + (bar % 5) * 0.1 }} />
                ))}
            </div>
        );
    }
    return (
        <div className="relative h-full">
            <FlowArtwork step={step} label={node.resultLabel} />
            {step.kind === "video" ? (
                <span className="absolute inset-0 grid place-items-center">
                    <span className="grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
                        <Play className="size-4 fill-current" />
                    </span>
                </span>
            ) : null}
        </div>
    );
}

/** 画布上的一个步骤节点：标题行在卡片上方，卡片里是生成结果 */
export function FlowNode({ step, index, node, selected, current, locked, onSelect, onCreate }: FlowNodeProps) {
    const reduce = useReducedMotion();
    if (!node) return <GhostNode step={step} index={index} current={current} locked={locked} onCreate={onCreate} />;

    const Icon = KIND_ICON[step.kind];
    const done = node.status === "done";
    const stale = node.status === "stale";
    return (
        <motion.button
            type="button"
            onClick={onSelect}
            data-step={step.key}
            aria-pressed={selected}
            aria-label={`${step.name}，${STATUS_TEXT[node.status]}`}
            initial={reduce ? false : { opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: GM_EASE }}
            style={{ left: nodeX(index), top: ROW_Y - 34, width: NODE_W }}
            className="group absolute flex flex-col gap-2 text-left focus-visible:outline-none"
        >
            <span className="flex items-center gap-2 px-1 text-[13px]">
                <span className="font-mono text-[11px] text-[var(--gm-text-3)]">{String(index + 1).padStart(2, "0")}</span>
                <span className={cn("font-medium", selected ? "text-[var(--gm-text)]" : "text-[var(--gm-text-2)]")}>{step.name}</span>
                <Icon className="size-3.5 text-[var(--gm-text-3)]" />
                <span className="ml-auto inline-flex items-center gap-1 text-[11px]">
                    {done ? (
                        <>
                            <Check className="size-3 text-[var(--gm-success)]" />
                            <span className="text-[var(--gm-text-3)]">v{node.version}</span>
                        </>
                    ) : stale ? (
                        <span className="inline-flex items-center gap-1 text-[var(--gm-warning)]">
                            <AlertTriangle className="size-3" />
                            需更新
                        </span>
                    ) : (
                        <span className={node.status === "running" ? "text-[var(--gm-accent)]" : "text-[var(--gm-text-3)]"}>{STATUS_TEXT[node.status]}</span>
                    )}
                </span>
            </span>
            <span
                style={{ height: NODE_BODY_H }}
                className={cn(
                    "relative block w-full overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 transition-[box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-[var(--gm-accent)]",
                    selected ? "shadow-[0_0_0_4px_var(--gm-accent-soft),var(--gm-shadow)] ring-[var(--gm-accent)]" : stale ? "ring-[var(--gm-warning)]/60" : "ring-[var(--gm-border-strong)] group-hover:shadow-[var(--gm-shadow)]",
                    current && node.status === "draft" && !selected && "ring-[var(--gm-accent)]",
                )}
            >
                <NodeBody step={step} node={node} />
                {node.status === "running" ? <span aria-hidden className="gm-flow absolute inset-x-0 bottom-0 h-0.5" /> : null}
            </span>
        </motion.button>
    );
}
