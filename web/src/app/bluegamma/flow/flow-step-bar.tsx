"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

import { nodeOf, type FlowState } from "@/app/bluegamma/flow/flow-state";
import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";
import { cn } from "@/lib/utils";

/**
 * 顶部步骤条（对应参考站「市场调研 | 灵感设计 | …」）：点一下就在画布上新建/定位该步骤。
 * 完成的步骤带勾，当前步骤有滑动高亮，未解锁的步骤也能点（新建后会提示先完成上游）。
 */
export function FlowStepBar({ flow, state, currentKey, onPick }: { flow: MajorFlow; state: FlowState; currentKey: string | null; onPick: (key: string) => void }) {
    const reduce = useReducedMotion();
    const activeKey = state.selectedKey ?? currentKey;
    return (
        <nav aria-label="创作步骤" className="gm-glass gm-scroll flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1">
            {flow.steps.map((step, index) => {
                const status = nodeOf(state, step.key)?.status;
                const active = step.key === activeKey;
                const done = status === "done";
                return (
                    <button
                        key={step.key}
                        type="button"
                        onClick={() => onPick(step.key)}
                        aria-current={active ? "step" : undefined}
                        className={cn(
                            "relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                            active ? "text-[var(--gm-text)]" : "text-[var(--gm-text-2)] hover:text-[var(--gm-text)]",
                        )}
                    >
                        {active ? (
                            <motion.span
                                layoutId="flow-step-active"
                                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                                className="absolute inset-0 rounded-full bg-[var(--gm-wash-strong)] ring-1 ring-[var(--gm-border-strong)]"
                            />
                        ) : null}
                        <span
                            className={cn(
                                "relative grid size-4 place-items-center rounded-full font-mono text-[10px]",
                                done ? "bg-[var(--gm-success)] text-white" : status === "stale" ? "bg-[var(--gm-warning)] text-black" : active ? "bg-[var(--gm-blue)] text-white" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)]",
                            )}
                        >
                            {done ? <Check className="size-2.5" /> : index + 1}
                        </span>
                        <span className="relative">{step.name}</span>
                    </button>
                );
            })}
        </nav>
    );
}
