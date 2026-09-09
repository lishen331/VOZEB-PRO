"use client";

export type StoryboardConstraintDraft = { shotCount: string; totalDuration: string; creationMode?: "classic" | "universal"; generateNarration?: boolean; sequenceMode?: "single" | "quad_grid" | "nine_grid" };

export function DramaLabStoryboardConstraints({ value, onChange, disabled }: { value: StoryboardConstraintDraft; onChange: (value: StoryboardConstraintDraft) => void; disabled: boolean }) {
    return (
        <div className="mb-4 space-y-3 rounded-lg border border-border p-3" aria-label="分镜生成配置">
            <div className="flex flex-wrap gap-4">
                <label className="grid gap-1 text-sm">
                    <span>分镜数量</span>
                    <input
                        aria-label="分镜数量"
                        type="number"
                        step="1"
                        value={value.shotCount}
                        onChange={(event) => onChange({ ...value, shotCount: event.target.value })}
                        disabled={disabled}
                        placeholder="留空由 AI 决定"
                        className="h-9 w-44 rounded border border-input bg-background px-2"
                    />
                </label>
                <label className="grid gap-1 text-sm">
                    <span>视频总时长（秒）</span>
                    <input
                        aria-label="视频总时长（秒）"
                        type="number"
                        step="any"
                        value={value.totalDuration}
                        onChange={(event) => onChange({ ...value, totalDuration: event.target.value })}
                        disabled={disabled}
                        placeholder="留空由 AI 决定"
                        className="h-9 w-44 rounded border border-input bg-background px-2"
                    />
                </label>
                <fieldset className="flex items-end gap-3" disabled={disabled}>
                    <legend className="mb-1 text-sm">分镜模式</legend>
                    <label className="flex items-center gap-1 text-sm">
                        <input type="radio" name="storyboard-creation-mode" checked={(value.creationMode || "classic") === "classic"} onChange={() => onChange({ ...value, creationMode: "classic" })} />
                        经典分镜
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                        <input type="radio" name="storyboard-creation-mode" checked={value.creationMode === "universal"} onChange={() => onChange({ ...value, creationMode: "universal" })} />
                        全能分镜
                    </label>
                </fieldset>
                <label className="flex items-center gap-2 self-end text-sm">
                    <input type="checkbox" checked={value.generateNarration === true} disabled={disabled} onChange={(event) => onChange({ ...value, generateNarration: event.target.checked })} />
                    生成解说旁白
                </label>
                <label className="grid gap-1 text-sm">
                    <span>序列图模式</span>
                    <select
                        aria-label="序列图模式"
                        value={value.sequenceMode || "single"}
                        disabled={disabled}
                        onChange={(event) => onChange({ ...value, sequenceMode: event.target.value as StoryboardConstraintDraft["sequenceMode"] })}
                        className="h-9 w-32 rounded border border-input bg-background px-2"
                    >
                        <option value="single">单张</option>
                        <option value="quad_grid">四宫格</option>
                        <option value="nine_grid">九宫格</option>
                    </select>
                </label>
                <p className="self-end text-xs text-muted-foreground">本次提取目标；提交后随任务保存，重试沿用。数量允许 ±20%，总时长允许 ±10%。</p>
            </div>
        </div>
    );
}
