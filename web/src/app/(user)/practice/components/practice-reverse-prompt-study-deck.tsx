"use client";

import { ChevronLeft, ChevronRight, LoaderCircle, RotateCcw, WandSparkles } from "lucide-react";
import { useState } from "react";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { PRACTICE_REVERSE_PROMPT_SECTIONS, type parsePracticeReversePrompt } from "@/lib/practice-reverse-prompt";

type Props = {
    analysis: ReturnType<typeof parsePracticeReversePrompt> | null;
    busy: boolean;
    model?: string;
    taskId?: string;
    diagnostic?: Record<string, unknown>;
    blocked: boolean;
    onCopy: (value: string) => void;
    onAnalyze: () => void;
};

export function PracticeReversePromptStudyDeck({ analysis, busy, model, taskId, diagnostic, blocked, onCopy, onAnalyze }: Props) {
    const [index, setIndex] = useState(0);
    const [showFull, setShowFull] = useState(false);
    const cards = PRACTICE_REVERSE_PROMPT_SECTIONS.filter(({ id }) => analysis?.sections.some((section) => section.id === id));
    const card = cards[index];
    const content = analysis?.sections.find((section) => section.id === card?.id);

    return (
        <section aria-labelledby="practice-study-deck-title" className="flex h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 sm:p-5 xl:h-auto">
            <div className="mb-3 flex shrink-0 items-center gap-2">
                <WandSparkles className="size-4 text-[var(--gm-accent)]" />
                <h2 id="practice-study-deck-title" className="font-semibold">
                    提示词拆解
                </h2>
            </div>
            {!analysis ? (
                <div className="grid min-h-0 flex-1 place-items-center text-center text-sm text-[var(--gm-text-3)]">
                    {busy ? (
                        <span className="flex items-center gap-2">
                            <LoaderCircle className="size-4 animate-spin" />
                            正在分析图片…
                        </span>
                    ) : (
                        "完成左侧设置后开始练习，结果会先保留在当前页面"
                    )}
                </div>
            ) : (
                <>
                    <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-1 text-xs">
                        <p className="text-[var(--gm-text-3)]">这是根据画面推断的写法，不是原始提示词。</p>
                        {analysis.fullPrompt ? (
                            <GammaButton size="sm" variant="outline" onClick={() => setShowFull(!showFull)}>
                                {showFull ? "返回拆解卡" : "查看完整提示词"}
                            </GammaButton>
                        ) : null}
                    </div>
                    <div
                        role="region"
                        aria-label="拆解卡正文"
                        tabIndex={0}
                        key={showFull ? "full" : card?.id || "empty"}
                        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain rounded-xl border border-[var(--gm-border)] bg-[var(--gm-wash)]/30 p-3 text-sm [overflow-wrap:anywhere]"
                    >
                        {showFull || (!content && analysis.fullPrompt) ? (
                            <>
                                <h3 className="font-semibold">完整生图提示词</h3>
                                <p className="whitespace-pre-wrap leading-6">{analysis.fullPrompt}</p>
                            </>
                        ) : content ? (
                            <>
                                <h3 className="font-semibold">{card.label}</h3>
                                <dl className="space-y-3 leading-6">
                                    <div>
                                        <dt className="text-xs text-[var(--gm-text-3)]">图里看到了什么</dt>
                                        <dd className="whitespace-pre-wrap">{content.observation || "未能确定"}</dd>
                                    </div>
                                    <div className="rounded-lg bg-[var(--gm-wash)] p-3">
                                        <dt className="text-xs text-[var(--gm-text-3)]">提示词可以怎么写</dt>
                                        <dd className="whitespace-pre-wrap">{content.phrase || "暂无建议"}</dd>
                                    </div>
                                </dl>
                            </>
                        ) : (
                            <p className="text-[var(--gm-text-3)]">模型未返回可用的拆解或提示词，请重新分析。</p>
                        )}
                        {taskId || model || diagnostic ? (
                            <details className="text-xs text-[var(--gm-text-3)]">
                                <summary className="cursor-pointer">诊断信息</summary>
                                {taskId ? (
                                    <p>
                                        任务 ID：<code>{taskId}</code>
                                    </p>
                                ) : null}
                                {model ? <p>执行：{model}</p> : null}
                                {diagnostic ? <pre className="whitespace-pre-wrap">{JSON.stringify(diagnostic, null, 2)}</pre> : null}
                            </details>
                        ) : null}
                    </div>
                    {cards.length > 1 && !showFull ? (
                        <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
                            <GammaButton size="sm" variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)} icon={<ChevronLeft className="size-4" />}>
                                上一张
                            </GammaButton>
                            <span aria-live="polite" className="text-xs tabular-nums text-[var(--gm-text-3)]">
                                {index + 1} / {cards.length}
                            </span>
                            <GammaButton size="sm" variant="outline" disabled={index === cards.length - 1} onClick={() => setIndex(index + 1)} trailingIcon={<ChevronRight className="size-4" />}>
                                下一张
                            </GammaButton>
                        </div>
                    ) : null}
                    <div className="mt-2 flex shrink-0 flex-wrap gap-2 border-t border-[var(--gm-border)] pt-2">
                        <GammaButton size="sm" variant="outline" disabled={!analysis.fullPrompt} onClick={() => onCopy(analysis.fullPrompt)}>
                            复制提示词
                        </GammaButton>
                        <GammaButton size="sm" variant="outline" disabled={blocked} onClick={onAnalyze} icon={<RotateCcw className="size-4" />}>
                            修改要求后重新分析
                        </GammaButton>
                    </div>
                </>
            )}
        </section>
    );
}
