"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Wand2, X, Zap } from "lucide-react";

import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaChip, GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { GammaMajorTabs } from "@/components/gamma-ui/gamma-major-tabs";
import { GammaMorphIcon } from "@/components/gamma-ui/gamma-morph-icon";
import { GAMMA_RATIOS, SUBJECT_ACCENT, type GammaRatio, type GammaSubject } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

export const GAMMA_MAX_PROMPT = 1000;
/** 动态产出（视频/动画/短片/漫游）额外消耗 */
const MOTION_OUTPUT_SURCHARGE = 20;
/** 带参考图额外消耗 */
const REFERENCE_SURCHARGE = 4;

export interface GammaComposerSubmit {
    subject: GammaSubject;
    output: string;
    style: string;
    ratio: GammaRatio;
    prompt: string;
    cost: number;
    hasReference: boolean;
}

export function gammaOutputCost(subject: GammaSubject, output: string, hasReference = false) {
    return subject.cost + (/视频|动画|短片|漫游/.test(output) ? MOTION_OUTPUT_SURCHARGE : 0) + (hasReference ? REFERENCE_SURCHARGE : 0);
}

/**
 * 主创作输入（对标可灵）：专业方向 → 产出形态 / 风格 / 比例 → 描述 + 参考图，一屏完成。
 * 切换专业时顶部光晕跟随专业色，产出与风格自动换成该专业的预设。
 */
export function GammaComposer({
    subject,
    onSubjectChange,
    points,
    onSubmit,
    initialPrompt,
}: {
    subject: GammaSubject;
    onSubjectChange: (slug: string) => void;
    points: number;
    onSubmit: (payload: GammaComposerSubmit) => void;
    initialPrompt?: { text: string; seq: number };
}) {
    const [output, setOutput] = useState(subject.outputs[0]);
    const [style, setStyle] = useState(subject.styles[0]);
    const [ratio, setRatio] = useState<GammaRatio>("16:9");
    const [prompt, setPrompt] = useState("");
    const [reference, setReference] = useState<string | null>(null);
    const [seenSeq, setSeenSeq] = useState(0);
    const [focused, setFocused] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // 外部「做同款」写入提示词：按序号只消费一次（渲染期同步，避免 effect 里 setState）
    if (initialPrompt && initialPrompt.seq !== seenSeq) {
        setSeenSeq(initialPrompt.seq);
        setPrompt(initialPrompt.text);
    }

    useEffect(() => () => (reference ? URL.revokeObjectURL(reference) : undefined), [reference]);

    const accent = SUBJECT_ACCENT[subject.accent];
    const activeOutput = subject.outputs.includes(output) ? output : subject.outputs[0];
    const activeStyle = subject.styles.includes(style) ? style : subject.styles[0];
    const hasReference = Boolean(reference);
    const cost = gammaOutputCost(subject, activeOutput, hasReference);
    const trimmed = prompt.trim();
    const insufficient = points < cost;
    const canSubmit = trimmed.length > 0 && !insufficient;

    const submit = () => {
        if (!canSubmit) return;
        onSubmit({ subject, output: activeOutput, style: activeStyle, ratio, prompt: trimmed, cost, hasReference });
        setPrompt("");
    };

    return (
        <div className="flex flex-col gap-3">
            <GammaMajorTabs value={subject.slug} onChange={onSubjectChange} />
            <div
                className={cn(
                    "relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] ring-1 transition-shadow duration-300",
                    focused ? "gm-gradient-ring shadow-[0_0_0_4px_var(--gm-accent-soft),0_20px_50px_rgba(0,80,245,0.2)] ring-transparent" : "ring-[var(--gm-border)]",
                )}
            >
                <motion.div
                    aria-hidden
                    key={subject.slug}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    transition={{ duration: 0.6 }}
                    className="pointer-events-none absolute -top-28 left-10 h-52 w-[60%] rounded-full blur-3xl"
                    style={{ background: accent.glow }}
                />
                <div className="relative flex flex-col gap-4 p-5">
                    <div className="flex gap-4">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                setReference(file ? URL.createObjectURL(file) : null);
                                event.target.value = "";
                            }}
                        />
                        {reference ? (
                            <div className="group relative size-[84px] shrink-0 overflow-hidden rounded-[var(--gm-radius)] ring-1 ring-[var(--gm-accent-ring)]">
                                {/* eslint-disable-next-line @next/next/no-img-element -- 本地 blob 预览 */}
                                <img src={reference} alt="参考图" className="size-full object-cover" />
                                <button
                                    type="button"
                                    aria-label="移除参考图"
                                    onClick={() => setReference(null)}
                                    className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-[rgba(4,6,12,0.7)] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                >
                                    <X className="size-3" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                aria-label="上传参考图"
                                className="grid size-[84px] shrink-0 place-items-center rounded-[var(--gm-radius)] border border-dashed border-[var(--gm-border-strong)] text-[var(--gm-text-3)] transition-colors hover:border-[var(--gm-accent)] hover:bg-[var(--gm-accent-soft)] hover:text-[var(--gm-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                            >
                                <span className="flex flex-col items-center gap-1 text-[11px]">
                                    <ImagePlus className="size-5" />
                                    参考图
                                </span>
                            </button>
                        )}
                        <label htmlFor="gm-composer-prompt" className="sr-only">
                            描述你想生成的{subject.name}作品
                        </label>
                        <textarea
                            id="gm-composer-prompt"
                            value={prompt}
                            maxLength={GAMMA_MAX_PROMPT}
                            onChange={(event) => setPrompt(event.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                    event.preventDefault();
                                    submit();
                                }
                            }}
                            rows={3}
                            placeholder={`描述你的${subject.name}作品，例如：${subject.example}`}
                            className="min-h-[84px] flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <GammaTabs label="产出形态" size="sm" options={subject.outputs.map((value) => ({ value, label: value }))} value={activeOutput} onChange={setOutput} />
                        <span aria-hidden className="h-5 w-px bg-[var(--gm-border-strong)]" />
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="风格">
                            {subject.styles.map((value) => (
                                <GammaChip key={value} active={value === activeStyle} onClick={() => setStyle(value)}>
                                    {value}
                                </GammaChip>
                            ))}
                        </div>
                        <span aria-hidden className="h-5 w-px bg-[var(--gm-border-strong)]" />
                        <GammaTabs label="画面比例" size="sm" options={GAMMA_RATIOS.map((value) => ({ value, label: value }))} value={ratio} onChange={setRatio} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--gm-border)] pt-4">
                        <GammaIconButton label="帮我写" onClick={() => setPrompt(subject.example)}>
                            <Wand2 />
                        </GammaIconButton>
                        <span className="font-mono text-[11px] tracking-wide text-[var(--gm-text-3)] uppercase">
                            {subject.nameEn} · {activeOutput} · {activeStyle} · {ratio}
                        </span>
                        <div className="ml-auto flex items-center gap-3">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.span
                                    key={insufficient ? "low" : "ok"}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={cn("text-xs tabular-nums", insufficient ? "text-[var(--gm-danger)]" : "text-[var(--gm-text-3)]")}
                                >
                                    {insufficient ? "积分不足" : `Ctrl + Enter · ${prompt.length}/${GAMMA_MAX_PROMPT}`}
                                </motion.span>
                            </AnimatePresence>
                            <GammaButton
                                size="lg"
                                shine={canSubmit}
                                disabled={!canSubmit}
                                onClick={submit}
                                ariaLabel={`开始生成，消耗 ${cost} 积分`}
                                icon={<GammaMorphIcon name={trimmed ? "arrowRight" : "sparkle"} size={18} />}
                                badge={
                                    <>
                                        <Zap className="size-3 fill-current" />
                                        {cost}
                                    </>
                                }
                            >
                                开始生成
                            </GammaButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
