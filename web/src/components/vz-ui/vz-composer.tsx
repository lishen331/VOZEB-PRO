"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { ImagePlus, Ratio, Sparkles, Wand2, X, Zap } from "lucide-react";

import { VzButton, VzIconButton } from "@/components/vz-ui/vz-button";
import { cn } from "@/lib/utils";

export const VZ_MAX_PROMPT_LENGTH = 2000;

export interface VzComposerProps {
    prompt: string;
    onPromptChange: (prompt: string) => void;
    onSubmit: () => void;
    cost: number;
    modelLabel: string;
    ratio: string;
    onCycleRatio: () => void;
    specLabel: string;
    onCycleSpec: () => void;
    referenceUrl: string | null;
    onReferenceChange: (file: File | null) => void;
    onPolish: () => void;
    placeholder?: string;
}

/**
 * 主创作输入框：大输入区 + 底部参数条 + 渐变生成按钮。
 * 受控组件，状态由调用方持有；Ctrl/⌘ + Enter 提交。
 */
export function VzComposer({
    prompt,
    onPromptChange,
    onSubmit,
    cost,
    modelLabel,
    ratio,
    onCycleRatio,
    specLabel,
    onCycleSpec,
    referenceUrl,
    onReferenceChange,
    onPolish,
    placeholder = "描述你想生成的画面，例如：雨夜霓虹街头，一位撑伞的少女回眸，电影感镜头…",
}: VzComposerProps) {
    const [focused, setFocused] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const canSubmit = prompt.trim().length > 0;

    return (
        <div className={cn("rounded-[var(--vz-radius-xl)] bg-[var(--vz-surface)] transition-shadow duration-200", focused ? "vz-gradient-border shadow-[0_0_0_6px_rgba(139,92,246,0.10),var(--vz-shadow)]" : "ring-1 ring-[var(--vz-border-strong)]")}>
            <div className="relative z-[1] p-4">
                <div className="flex gap-3">
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                            onReferenceChange(event.target.files?.[0] ?? null);
                            event.target.value = "";
                        }}
                    />
                    {referenceUrl ? (
                        <div className="group relative size-[72px] shrink-0 overflow-hidden rounded-[var(--vz-radius)] ring-1 ring-[rgba(139,92,246,0.5)]">
                            {/* eslint-disable-next-line @next/next/no-img-element -- 本地 blob 预览 */}
                            <img src={referenceUrl} alt="参考图" className="size-full object-cover" />
                            <button
                                type="button"
                                aria-label="移除参考图"
                                onClick={() => onReferenceChange(null)}
                                className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            aria-label="上传参考图"
                            onClick={() => fileRef.current?.click()}
                            className="grid size-[72px] shrink-0 place-items-center rounded-[var(--vz-radius)] border border-dashed border-[var(--vz-border-strong)] bg-white/[0.02] text-[var(--vz-text-3)] transition-colors hover:border-[var(--vz-brand)] hover:text-[#c4b5fd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]"
                        >
                            <span className="flex flex-col items-center gap-1 text-[11px]">
                                <ImagePlus className="size-5" />
                                参考图
                            </span>
                        </button>
                    )}
                    <label className="sr-only" htmlFor="vz-composer-prompt">
                        提示词
                    </label>
                    <textarea
                        id="vz-composer-prompt"
                        value={prompt}
                        maxLength={VZ_MAX_PROMPT_LENGTH}
                        onChange={(event) => onPromptChange(event.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canSubmit) {
                                event.preventDefault();
                                onSubmit();
                            }
                        }}
                        rows={3}
                        placeholder={placeholder}
                        className="min-h-[72px] flex-1 bg-transparent text-[15px] leading-relaxed text-[var(--vz-text)] outline-none placeholder:text-[var(--vz-text-3)]"
                    />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ParamPill icon={<Sparkles className="size-3.5 text-[#c4b5fd]" />}>{modelLabel}</ParamPill>
                    <ParamPill icon={<Ratio className="size-3.5" />} onClick={onCycleRatio} title="切换比例">
                        {ratio}
                    </ParamPill>
                    <ParamPill onClick={onCycleSpec} title="切换规格">
                        {specLabel}
                    </ParamPill>
                    <VzIconButton label="AI 润色提示词" size="sm" onClick={onPolish} disabled={!canSubmit}>
                        <Wand2 />
                    </VzIconButton>
                    <span className="ml-auto hidden text-xs text-[var(--vz-text-3)] sm:inline">Ctrl + Enter 生成</span>
                    <span className="text-xs tabular-nums text-[var(--vz-text-3)]">
                        {prompt.length}/{VZ_MAX_PROMPT_LENGTH}
                    </span>
                    <VzButton
                        disabled={!canSubmit}
                        onClick={onSubmit}
                        trailing={
                            <>
                                <Zap className="size-3 fill-current" />
                                {cost}
                            </>
                        }
                    >
                        立即生成
                    </VzButton>
                </div>
            </div>
        </div>
    );
}

function ParamPill({ icon, children, onClick, title }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; title?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 text-xs text-[var(--vz-text-2)] ring-1 ring-[var(--vz-border)] transition-colors hover:bg-white/[0.09] hover:text-[var(--vz-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]"
        >
            {icon}
            {children}
        </button>
    );
}
