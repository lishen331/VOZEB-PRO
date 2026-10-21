"use client";

import { AnimatePresence, motion } from "motion/react";
import { Download, Share2, Trophy } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import { FlowArtwork, KIND_ICON } from "@/app/bluegamma/flow/flow-artwork";
import { nodeOf, type FlowState } from "@/app/bluegamma/flow/flow-state";
import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";

/** 全部步骤完成后从底部升起的成果汇总：按步骤排一排缩略图，可导出作品集 / 发布到广场 */
export function FlowResultTray({ flow, state, open, onPick }: { flow: MajorFlow; state: FlowState; open: boolean; onPick: (key: string) => void }) {
    return (
        <AnimatePresence>
            {open ? (
                <motion.section
                    key="tray"
                    aria-label="成果汇总"
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    transition={{ duration: 0.4, ease: GM_EASE }}
                    className="gm-glass absolute inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-[var(--gm-radius-xl)] p-3 pr-4"
                >
                    <div className="flex shrink-0 items-center gap-3 pl-1">
                        <span className="grid size-10 place-items-center rounded-full bg-[image:var(--gm-gradient)] text-white">
                            <Trophy className="size-5" />
                        </span>
                        <div className="leading-tight">
                            <p className="text-sm font-semibold">整套方案完成</p>
                            <p className="mt-0.5 max-w-56 truncate text-[11px] text-[var(--gm-text-3)]">{state.brief}</p>
                        </div>
                    </div>
                    <ol className="gm-scroll flex min-w-0 gap-2 overflow-x-auto">
                        {flow.steps.map((step, index) => {
                            const node = nodeOf(state, step.key);
                            const Icon = KIND_ICON[step.kind];
                            return (
                                <li key={step.key}>
                                    <button type="button" onClick={() => onPick(step.key)} className="group flex w-[76px] flex-col gap-1 text-left" aria-label={`查看${step.name}`}>
                                        <span className="relative block aspect-[4/3] overflow-hidden rounded-[8px] bg-[var(--gm-wash)] ring-1 ring-[var(--gm-border)] transition-shadow group-hover:ring-[var(--gm-accent)]">
                                            {node && step.kind !== "text" ? (
                                                <FlowArtwork step={step} compact />
                                            ) : (
                                                <span className="grid h-full place-items-center text-[var(--gm-text-3)]">
                                                    <Icon className="size-4" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="truncate text-[11px] text-[var(--gm-text-2)]">
                                            {index + 1}. {step.name}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    <div className="flex shrink-0 flex-col gap-1.5">
                        <GammaButton size="sm" icon={<Download className="size-4" />}>
                            导出作品集
                        </GammaButton>
                        <GammaButton size="sm" variant="soft" icon={<Share2 className="size-4" />}>
                            发布到广场
                        </GammaButton>
                    </div>
                </motion.section>
            ) : null}
        </AnimatePresence>
    );
}
