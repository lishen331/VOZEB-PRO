"use client";

export type StoryboardConstraintDraft = { shotCount: string; totalDuration: string };

export function DramaLabStoryboardConstraints({ value, onChange, disabled }: { value: StoryboardConstraintDraft; onChange: (value: StoryboardConstraintDraft) => void; disabled: boolean }) {
    return (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-border p-3">
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
            <p className="self-end text-xs text-muted-foreground">本次提取目标；提交后随任务保存，重试沿用。数量允许 ±20%，总时长允许 ±10%。</p>
        </div>
    );
}
