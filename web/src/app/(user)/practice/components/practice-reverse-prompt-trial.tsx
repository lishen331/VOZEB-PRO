"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { pollPracticeImageToolTask, PracticeImageToolTaskFailed, type PracticeImageToolResult, type PracticeImageToolTask } from "./practice-image-tool-task";

type Submission = { prompt: string; clientRequestId: string };

export function PracticeReversePromptTrial({ initialPrompt, blocked, onBusyChange }: { initialPrompt: string; blocked: boolean; onBusyChange: (busy: boolean) => void }) {
    const [draft, setDraft] = useState(initialPrompt);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [task, setTask] = useState<PracticeImageToolTask | null>(null);
    const [uncertain, setUncertain] = useState<Submission | null>(null);
    const [result, setResult] = useState<PracticeImageToolResult | null>(null);
    const [resultPrompt, setResultPrompt] = useState("");
    const running = useRef<AbortController | null>(null);
    const submittedPrompt = useRef("");

    useEffect(() => () => running.current?.abort(), []);

    const run = async () => {
        if (blocked || running.current || (!task && !uncertain && !draft.trim())) return;
        const controller = new AbortController();
        running.current = controller;
        setBusy(true);
        onBusyChange(true);
        setError("");
        try {
            let active = task;
            if (!active) {
                const submission = uncertain || { prompt: draft.trim(), clientRequestId: crypto.randomUUID() };
                // If transport fails, recover with the same request ID and exact body instead of creating another task.
                setUncertain(submission);
                const response = await fetch("/api/practice/image-tools", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ toolId: "reverse-prompt", action: "try-generate", ...submission }),
                    signal: controller.signal,
                });
                const payload = (await response.json().catch(() => ({}))) as { task?: PracticeImageToolTask; error?: string };
                if (!response.ok || payload.task?.type !== "image" || !payload.task.id) {
                    if (response.status >= 400 && response.status < 500 && response.status !== 409) setUncertain(null);
                    throw new Error(payload.error || "未能确认是否提交成功，请继续确认原请求");
                }
                active = payload.task;
                submittedPrompt.current = submission.prompt;
                setTask(active);
                setUncertain(null);
            }
            const completed = await pollPracticeImageToolTask(active, controller.signal);
            if (controller.signal.aborted) return;
            setResult(completed);
            setResultPrompt(submittedPrompt.current);
            setTask(null);
        } catch (cause) {
            if (controller.signal.aborted) return;
            if (cause instanceof PracticeImageToolTaskFailed) setTask(null);
            setError(cause instanceof Error ? cause.message : "试生成失败，请重试");
        } finally {
            running.current = null;
            if (!controller.signal.aborted) {
                setBusy(false);
                onBusyChange(false);
            }
        }
    };

    const image = result?.image;
    return (
        <section aria-labelledby="practice-trial-title" className="min-w-0 space-y-4 rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 sm:p-5">
            <div className="space-y-1">
                <h2 id="practice-trial-title" className="font-semibold">
                    提示词试生成
                </h2>
                <p className="text-xs leading-5 text-[var(--gm-text-3)]">试着只改一个地方，再和左边原图对照。仅使用文字，不传原图。</p>
            </div>
            <label className="block space-y-2 text-sm">
                <span className="font-medium">试生成提示词</span>
                <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={blocked || busy}
                    placeholder="分析完成后自动填入，也可以自行修改"
                    maxLength={20_000}
                    className="min-h-36 w-full rounded-xl border border-[var(--gm-border)] bg-[var(--gm-wash)]/30 p-3 text-sm leading-6 disabled:opacity-60"
                />
            </label>
            <div className="space-y-2">
                <GammaButton variant="primary" disabled={blocked || busy || (!task && !uncertain && !draft.trim())} loading={busy} onClick={() => void run()} icon={<Sparkles className="size-4" />}>
                    {busy ? "正在试生成…" : task ? "查询原任务" : uncertain ? "继续确认原请求" : "生成一张"}
                </GammaButton>
                <p className="text-xs leading-5 text-[var(--gm-text-3)]">仅在点击后提交，使用无限练习生图模型池并按现有规则计费。</p>
                {error ? (
                    <p role="alert" className="break-words text-sm text-[var(--gm-danger)]">
                        {error}
                    </p>
                ) : null}
                {task && !busy ? <p className="break-all text-xs text-[var(--gm-text-3)]">任务编号：{task.id}</p> : null}
                {uncertain && !busy ? <p className="text-xs text-[var(--gm-text-3)]">继续确认将使用上次提交的文字和请求编号，不会改用当前草稿。</p> : null}
            </div>
            {image ? (
                <figure className="space-y-2 rounded-xl border border-[var(--gm-border)] p-2">
                    <img src={imagePreviewUrl(image.serverUrl || image.url, 960)} alt="提示词试生成结果" className="mx-auto max-h-[42vh] max-w-full rounded-lg object-contain" />
                    <figcaption className="text-xs text-[var(--gm-text-3)]">
                        {busy || task || uncertain || draft.trim() !== resultPrompt ? "上一次试生成结果" : "本次试生成结果"}
                        {result.model ? ` · ${result.model}` : ""}
                    </figcaption>
                    <details className="text-xs text-[var(--gm-text-3)]">
                        <summary className="cursor-pointer">查看这张图使用的提示词</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">{resultPrompt}</p>
                    </details>
                </figure>
            ) : (
                <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-[var(--gm-border)] p-3 text-center text-sm text-[var(--gm-text-3)]">{busy ? "正在等待生成图" : "生成图会显示在这里"}</div>
            )}
        </section>
    );
}
