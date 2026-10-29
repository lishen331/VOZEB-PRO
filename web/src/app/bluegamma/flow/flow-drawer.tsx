"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Lightbulb, Link2, Sparkles, X, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import { KIND_COST, KIND_LABEL, KIND_MODEL } from "@/app/bluegamma/flow/flow-layout";
import { FlowArtwork, KIND_ICON } from "@/app/bluegamma/flow/flow-artwork";
import type { FlowNodeState, FlowState } from "@/app/bluegamma/flow/flow-state";
import type { FlowStep, MajorFlow } from "@/app/bluegamma/flow/flow-types";
import { cn } from "@/lib/utils";

export const DRAWER_W = 380;

interface FlowDrawerProps {
    flow: MajorFlow;
    state: FlowState;
    step: FlowStep | null;
    node: FlowNodeState | null;
    canRun: boolean;
    onClose: () => void;
    onPrompt: (prompt: string) => void;
    onPreset: (index: number) => void;
    onRun: () => void;
    onNext: () => void;
}

/** 本步会自动带上的上游产出（对应连线） */
function RefStrip({ flow, state, step }: { flow: MajorFlow; state: FlowState; step: FlowStep }) {
    const refs = step.refs ?? [];
    if (refs.length === 0) return <p className="text-xs text-[var(--gm-text-3)]">这是第一步，不需要参考。</p>;
    return (
        <ul className="flex flex-wrap gap-2">
            {refs.map((ref) => {
                const refStep = flow.steps.find((item) => item.key === ref);
                const refNode = state.nodes.find((item) => item.key === ref);
                const ready = refNode?.status === "done";
                const Icon = refStep ? KIND_ICON[refStep.kind] : Link2;
                return (
                    <li key={ref} className={cn("flex items-center gap-2 rounded-[10px] py-1 pr-2.5 pl-1 text-xs ring-1", ready ? "bg-[var(--gm-wash)] ring-[var(--gm-border)]" : "ring-[var(--gm-border)] ring-dashed text-[var(--gm-text-3)]")}>
                        {ready && refStep && refStep.kind !== "text" ? (
                            <span className="size-7 overflow-hidden rounded-[7px]">
                                <FlowArtwork step={refStep} compact />
                            </span>
                        ) : (
                            <span className="grid size-7 place-items-center rounded-[7px] bg-[var(--gm-wash-strong)]">
                                <Icon className="size-3.5" />
                            </span>
                        )}
                        {refStep?.name}
                        {ready ? <Check className="size-3 text-[var(--gm-success)]" /> : <span>未完成</span>}
                    </li>
                );
            })}
        </ul>
    );
}

/** 模板库：每个模板一行，名称 + 提示词摘要，选中即填入描述 */
function PresetGrid({ step, active, onPick }: { step: FlowStep; active: number | null; onPick: (index: number) => void }) {
    return (
        <div className="grid grid-cols-1 gap-2">
            {step.presets.map((preset, index) => {
                const selected = active === index;
                return (
                    <button
                        key={preset.name}
                        type="button"
                        onClick={() => onPick(index)}
                        aria-pressed={selected}
                        className={cn(
                            "group relative overflow-hidden rounded-[10px] text-left ring-1 transition-[box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                            selected ? "bg-[var(--gm-accent-soft)] ring-[var(--gm-accent)]" : "bg-[var(--gm-wash)] ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)]",
                        )}
                    >
                        <span className="flex flex-col gap-0.5 px-3 py-2.5 pr-8">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                                <Sparkles className="size-3.5 text-[var(--gm-accent)]" />
                                {preset.name}
                            </span>
                            <span className="line-clamp-1 text-[11px] text-[var(--gm-text-3)]">{preset.prompt.replaceAll("{课题}", "…")}</span>
                        </span>
                        {selected ? (
                            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-[var(--gm-blue)] text-white">
                                <Check className="size-2.5" />
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
    return (
        <section className="flex flex-col gap-2.5">
            <h3 className="flex items-center text-[12px] font-medium text-[var(--gm-text-2)]">
                {title}
                {aside ? <span className="ml-auto font-normal text-[var(--gm-text-3)]">{aside}</span> : null}
            </h3>
            {children}
        </section>
    );
}

/** 右侧参数抽屉：步骤目标 → 参考 → 描述 → 模板库 → 底部模型 / 积分 / 生成 */
export function FlowDrawer({ flow, state, step, node, canRun, onClose, onPrompt, onPreset, onRun, onNext }: FlowDrawerProps) {
    const open = Boolean(step && node);
    const index = step ? flow.steps.findIndex((item) => item.key === step.key) : -1;
    const isLast = index === flow.steps.length - 1;
    const running = node?.status === "running";
    const done = node?.status === "done";

    return (
        <AnimatePresence>
            {open && step && node ? (
                <motion.aside
                    key="drawer"
                    aria-label={`${step.name}参数`}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.28, ease: GM_EASE }}
                    style={{ width: DRAWER_W }}
                    className="absolute top-[60px] right-3 bottom-3 z-30 flex flex-col overflow-hidden rounded-[var(--gm-radius-xl)] border border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] shadow-[var(--gm-shadow)]"
                >
                    <header className="flex items-start gap-3 border-b border-[var(--gm-border)] px-5 pt-4 pb-3.5">
                        <div className="min-w-0 flex-1">
                            <p className="font-mono text-[11px] text-[var(--gm-text-3)]">
                                STEP {String(index + 1).padStart(2, "0")} / {String(flow.steps.length).padStart(2, "0")} · {KIND_LABEL[step.kind]}
                            </p>
                            <h2 className="mt-0.5 text-base font-semibold">{step.name}</h2>
                            <p className="mt-1 text-xs text-[var(--gm-text-2)]">{step.goal}</p>
                        </div>
                        <button type="button" onClick={onClose} aria-label="关闭参数面板" className="grid size-8 place-items-center rounded-[8px] text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                            <X className="size-4" />
                        </button>
                    </header>

                    <div className="gm-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
                        <Section title="自动参考" aside="来自连线">
                            <RefStrip flow={flow} state={state} step={step} />
                        </Section>

                        <Section title="描述" aside={node.presetIndex === null ? "自定义" : "来自模板，可改"}>
                            <textarea
                                value={node.prompt}
                                onChange={(event) => onPrompt(event.target.value)}
                                rows={5}
                                aria-label={`${step.name}描述`}
                                className="gm-scroll w-full resize-none rounded-[12px] bg-[var(--gm-wash)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--gm-text)] ring-1 ring-[var(--gm-border)] outline-none placeholder:text-[var(--gm-text-3)] focus:ring-[var(--gm-accent)]"
                            />
                        </Section>

                        <Section title={step.kind === "text" ? "提示词模板" : "风格模板"} aside={`${step.presets.length} 个`}>
                            <PresetGrid step={step} active={node.presetIndex} onPick={onPreset} />
                        </Section>

                        {step.tip ? (
                            <p className="flex gap-2 rounded-[12px] bg-[var(--gm-accent-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--gm-text-2)]">
                                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-[var(--gm-accent)]" />
                                {step.tip}
                            </p>
                        ) : null}
                    </div>

                    <footer className="flex items-center gap-2 border-t border-[var(--gm-border)] px-4 py-3">
                        <span className="flex min-w-0 flex-1 flex-col text-[11px] leading-tight text-[var(--gm-text-3)]">
                            <span className="truncate text-[12px] text-[var(--gm-text-2)]">{KIND_MODEL[step.kind]}</span>
                            <span className="inline-flex items-center gap-0.5">
                                <Zap className="size-3 fill-current text-[var(--gm-accent)]" />
                                {KIND_COST[step.kind]} 积分
                            </span>
                        </span>
                        {done && !isLast ? (
                            <GammaButton size="sm" variant="soft" onClick={onRun}>
                                重新生成
                            </GammaButton>
                        ) : null}
                        {done && !isLast ? (
                            <GammaButton size="sm" trailingIcon={<ArrowRight className="size-4" />} onClick={onNext}>
                                下一步
                            </GammaButton>
                        ) : (
                            <GammaButton size="sm" loading={running} disabled={!canRun || running || !node.prompt.trim()} onClick={onRun}>
                                {running ? "生成中" : done ? "重新生成" : canRun ? "生成" : "先完成上一步"}
                            </GammaButton>
                        )}
                    </footer>
                </motion.aside>
            ) : null}
        </AnimatePresence>
    );
}
