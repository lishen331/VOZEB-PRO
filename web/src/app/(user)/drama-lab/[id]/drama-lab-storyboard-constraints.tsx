"use client";

import type { DramaStoryboardFrameMode } from "@/lib/drama-project-contract";
import type { DramaLabStoryboardSequenceMode } from "@/lib/drama-lab-storyboard-options";

export type StoryboardConstraintDraft = { shotCount: string; totalDuration: string; creationMode?: "classic" | "universal"; generateNarration?: boolean };

export type DramaLabStoryboardConstraintsProps = {
    value: StoryboardConstraintDraft;
    onChange: (value: StoryboardConstraintDraft) => void;
    disabled: boolean;
    storyboardFrameMode?: DramaStoryboardFrameMode;
    onStoryboardFrameModeChange?: (value: DramaStoryboardFrameMode) => void;
    sequenceMode?: DramaLabStoryboardSequenceMode;
    onSequenceModeChange?: (value: DramaLabStoryboardSequenceMode) => void;
    onExportXlsx?: () => void;
    onExportSrt?: () => void;
};

export function DramaLabStoryboardConstraints({ value, onChange, disabled, storyboardFrameMode = "single", onStoryboardFrameModeChange, sequenceMode = "single", onSequenceModeChange, onExportXlsx, onExportSrt }: DramaLabStoryboardConstraintsProps) {
    return (
        <div className="mb-4 space-y-3 rounded-lg border border-border p-3" aria-label="分镜生成配置">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3" aria-label="分镜数量与时长">
                {(
                    [
                        ["shotCount", "分镜数量", "分镜数量"],
                        ["totalDuration", "视频总时长", "视频总时长（秒）"],
                    ] as const
                ).map(([key, title, label]) => (
                    <div key={key} className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={`${title}配置`}>
                        <span>{label}</span>
                        <div className="inline-flex h-9 overflow-hidden rounded border border-input bg-background">
                            <button
                                type="button"
                                aria-label={`减少${title}`}
                                disabled={disabled || !value[key].trim()}
                                onClick={() => {
                                    const next = Number(value[key]) - 5;
                                    onChange({ ...value, [key]: next > 0 ? String(next) : "" });
                                }}
                                className="w-8 border-r border-input hover:bg-muted disabled:opacity-40"
                            >
                                −
                            </button>
                            <input
                                aria-label={label}
                                type="number"
                                step={key === "shotCount" ? "1" : "any"}
                                value={value[key]}
                                onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                                disabled={disabled}
                                placeholder="自动"
                                className="min-w-0 w-20 bg-transparent px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                                type="button"
                                aria-label={`增加${title}`}
                                disabled={disabled}
                                // L uses five-unit buttons; manual count entry still accepts every positive integer.
                                onClick={() => onChange({ ...value, [key]: String((Number(value[key]) || 0) + 5) })}
                                className="w-8 border-l border-input hover:bg-muted disabled:opacity-40"
                            >
                                +
                            </button>
                        </div>
                        <button
                            type="button"
                            aria-label={`${title}由 AI 决定`}
                            disabled={disabled || !value[key].trim()}
                            onClick={() => onChange({ ...value, [key]: "" })}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                            自动
                        </button>
                        <span className="text-xs text-muted-foreground">留空由 AI 决定</span>
                    </div>
                ))}
                {onSequenceModeChange && (
                    <label className="flex items-center gap-2 text-sm">
                        <span>序列图模式</span>
                        <select
                            aria-label="序列图模式"
                            value={sequenceMode}
                            disabled={disabled || storyboardFrameMode === "first_last"}
                            onChange={(event) => onSequenceModeChange(event.target.value as DramaLabStoryboardSequenceMode)}
                            className="h-9 w-28 rounded border border-input bg-background px-2"
                        >
                            <option value="single">单张</option>
                            <option value="quad_grid">四宫格</option>
                            <option value="nine_grid">九宫格</option>
                        </select>
                    </label>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-3" aria-label="分镜创作与旁白">
                {onStoryboardFrameModeChange && (
                    <label className="flex items-center gap-2 text-sm">
                        <input aria-label="首尾帧参考图" type="checkbox" checked={storyboardFrameMode === "first_last"} disabled={disabled} onChange={(event) => onStoryboardFrameModeChange(event.target.checked ? "first_last" : "single")} />
                        首尾帧参考图
                    </label>
                )}
                <fieldset className="flex items-center gap-3" disabled={disabled}>
                    <legend className="sr-only">分镜模式</legend>
                    <label className="flex items-center gap-1 text-sm">
                        <input type="radio" name="storyboard-creation-mode" checked={(value.creationMode || "classic") === "classic"} disabled={disabled} onChange={() => onChange({ ...value, creationMode: "classic" })} />
                        经典分镜
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                        <input type="radio" name="storyboard-creation-mode" checked={value.creationMode === "universal"} disabled={disabled} onChange={() => onChange({ ...value, creationMode: "universal" })} />
                        全能分镜
                    </label>
                </fieldset>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={value.generateNarration === true} disabled={disabled} onChange={(event) => onChange({ ...value, generateNarration: event.target.checked })} />
                    生成解说旁白
                </label>
                {onExportXlsx ? (
                    <button type="button" disabled={disabled} onClick={onExportXlsx} className="h-9 rounded border border-primary px-3 text-sm text-primary hover:bg-primary/5">
                        导出分镜表 Excel
                    </button>
                ) : null}
                {onExportSrt ? (
                    <button type="button" disabled={disabled} onClick={onExportSrt} className="h-9 rounded border border-primary px-3 text-sm text-primary hover:bg-primary/5">
                        导出解说 SRT
                    </button>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">本次提取目标；提交后随任务保存，重试沿用。数量允许 ±20%，总时长允许 ±10%。</p>
        </div>
    );
}
