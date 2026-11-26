"use client";

import Link from "next/link";
import { ArrowLeft, History, ImagePlus, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { centeredOutpainting, emptyOutpaintingPadding, outpaintingGeometry, outpaintingLesson, OUTPAINTING_RATIOS, type OutpaintingPadding, type OutpaintingRatio, type OutpaintingRecord, type OutpaintingSelection } from "@/lib/practice-outpainting";
import { createLibraryAsset } from "@/services/api/library-assets";
import { listPracticeOutpainting, submitPracticeOutpainting } from "@/services/api/practice-outpainting";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { parseServerMediaUrl } from "@/services/server-media-storage";
import { PracticeAssetPicker } from "../components/practice-asset-picker";
import { pollPracticeImageToolTask, PracticeImageToolTaskFailed, type PracticeImageToolTask } from "../components/practice-image-tool-task";

const handles = [
    ["左上", "left", "top"],
    ["上", null, "top"],
    ["右上", "right", "top"],
    ["右", "right", null],
    ["右下", "right", "bottom"],
    ["下", null, "bottom"],
    ["左下", "left", "bottom"],
    ["左", "left", null],
] as const;
const panel = "min-w-0 rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 sm:p-5";
const selectClass = "w-full rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] p-2.5 text-sm";
const initialSelection = (): OutpaintingSelection => ({ padding: emptyOutpaintingPadding(), ratio: "original", resolution: "2k" });
const ratioLabel = (ratio: OutpaintingRatio) => (ratio === "free" ? "自由比例" : ratio === "original" ? "原图比例" : ratio);
type Source = Pick<UploadedImage, "url" | "width" | "height">;
type Drag = { pointer: number; x: number; y: number; scale: number; padding: OutpaintingPadding; horizontal: "left" | "right" | null; vertical: "top" | "bottom" | null };
type Submission = { key: string; requestId: string; task?: PracticeImageToolTask };

export default function OutpaintingWorkbench() {
    const { message } = App.useApp();
    const [source, setSource] = useState<Source>();
    const [selection, setSelection] = useState(initialSelection);
    const [result, setResult] = useState<OutpaintingRecord>();
    const [history, setHistory] = useState<OutpaintingRecord[]>([]);
    const [historyStatus, setHistoryStatus] = useState("正在读取历史…");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const [saved, setSaved] = useState<Set<string>>(() => new Set());
    const [saving, setSaving] = useState(false);
    const file = useRef<HTMLInputElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const drag = useRef<Drag | null>(null);
    const submission = useRef<Submission | null>(null);
    const generation = useRef<AbortController | null>(null);
    const [viewport, setViewport] = useState({ width: 1, height: 1 });
    const { padding, ratio, resolution } = selection;
    const geometry = source && outpaintingGeometry(source.width, source.height, selection);
    const frameW = source ? source.width + padding.left + padding.right : 0;
    const frameH = source ? source.height + padding.top + padding.bottom : 0;
    const scale = source ? (drag.current?.scale ?? Math.max(0.001, Math.min((viewport.width - 34) / frameW, (viewport.height - 66) / frameH, (viewport.width * 0.7) / source.width, (viewport.height * 0.66) / source.height))) : 1;
    const snapshot = result || (source && geometry ? { selection, width: source.width, height: source.height } : undefined);
    const lesson = snapshot && outpaintingLesson(snapshot.selection, snapshot.width, snapshot.height);

    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
        if (stage.current) observer.observe(stage.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        void listPracticeOutpainting(controller.signal)
            .then((records) => {
                setHistory((current) => [...current, ...records.filter((record) => !current.some((item) => item.id === record.id))]);
                setHistoryStatus("暂无历史记录");
            })
            .catch(() => {
                if (!controller.signal.aborted) setHistoryStatus("暂时无法读取扩图历史");
            });
        return () => {
            controller.abort();
            generation.current?.abort();
        };
    }, []);

    function selectSource(image: Source) {
        if (!image.width || !image.height) {
            setError("无法读取原图尺寸，请重新上传");
            return;
        }
        setSource(image);
        setSelection(initialSelection());
        setResult(undefined);
        setError("");
        setShowOriginal(false);
    }
    async function upload(file?: File) {
        if (!file || uploading || busy) return;
        setUploading(true);
        setError("");
        try {
            selectSource(await uploadImage(file));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "图片上传失败");
        } finally {
            setUploading(false);
        }
    }
    function updateSelection(next: OutpaintingSelection) {
        setSelection(next);
        setResult(undefined);
        setError("");
    }
    function changeRatio(next: OutpaintingRatio) {
        if (!source) return;
        updateSelection({ ...selection, ratio: next, padding: next === "free" ? padding : centeredOutpainting(source.width, source.height, next) });
    }
    function grow(horizontal: Drag["horizontal"], vertical: Drag["vertical"], dx: number, dy: number, base: OutpaintingPadding) {
        if (!source) return;
        const next = { ...base };
        if (horizontal) next[horizontal] = Math.max(0, Math.round(base[horizontal] + (horizontal === "left" ? -dx : dx)));
        if (vertical) next[vertical] = Math.max(0, Math.round(base[vertical] + (vertical === "top" ? -dy : dy)));
        updateSelection({ ...selection, padding: next, ratio: "free" });
    }
    function move(event: PointerEvent<HTMLButtonElement>) {
        const active = drag.current;
        if (active?.pointer !== event.pointerId) return;
        grow(active.horizontal, active.vertical, (event.clientX - active.x) / active.scale, (event.clientY - active.y) / active.scale, active.padding);
    }
    function end(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null;
        setSelection((current) => ({ ...current }));
    }
    function restore(record: OutpaintingRecord) {
        if (busy || uploading) return;
        setSource({ url: record.sourceUrl, width: record.width, height: record.height });
        setSelection(record.selection);
        setResult(record);
        setError("");
        setShowOriginal(false);
    }
    async function generate() {
        if (!source || !geometry || generation.current || uploading) return;
        const key = JSON.stringify([source.url, selection]);
        const active = submission.current?.key === key ? submission.current : { key, requestId: crypto.randomUUID() };
        submission.current = active;
        const controller = new AbortController();
        generation.current = controller;
        setBusy(true);
        setError("");
        try {
            active.task ||= await submitPracticeOutpainting(source.url, selection, active.requestId);
            const completed = await pollPracticeImageToolTask(active.task, controller.signal);
            if (!completed.image) throw new Error("扩图任务没有返回图片");
            const record: OutpaintingRecord = {
                id: active.task.id,
                createdAt: Date.now(),
                sourceUrl: source.url,
                width: source.width,
                height: source.height,
                selection,
                image: completed.image,
                model: completed.model,
                prompt: outpaintingLesson(selection, source.width, source.height).prompt,
            };
            if (controller.signal.aborted) return;
            setResult(record);
            setShowOriginal(false);
            setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 20));
            submission.current = null;
        } catch (cause) {
            if (controller.signal.aborted) return;
            if (cause instanceof PracticeImageToolTaskFailed) submission.current = null;
            setError(cause instanceof Error ? cause.message : "扩图失败");
        } finally {
            generation.current = null;
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    async function save() {
        if (!result || saving || saved.has(result.id)) return;
        setSaving(true);
        try {
            const { image, id } = result;
            const media = parseServerMediaUrl(image.url);
            if (!media) throw new Error("结果无法保存，请重新打开历史记录");
            await createLibraryAsset({ kind: "image", title: "AI 扩图结果", coverUrl: media.url, tags: ["无限练习", "AI 扩图"], source: "practice", data: { ...image, dataUrl: media.url, serverUrl: media.url, storageKey: media.storageKey } });
            setSaved((current) => new Set([...current, id]));
            message.success("已保存到个人素材库");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="h-full overflow-y-auto bg-[var(--gm-bg)]">
            <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6">
                <header className="mb-6 flex items-center gap-3">
                    <Link href="/practice" aria-label="返回无限练习" className="grid size-10 place-items-center rounded-full border border-[var(--gm-border)]">
                        <ArrowLeft className="size-4" />
                    </Link>
                    <div>
                        <p className="text-xs text-[var(--gm-text-3)]">无限练习 · 图像工具</p>
                        <h1 className="text-2xl font-semibold">AI 扩图</h1>
                    </div>
                </header>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(176px,.6fr)]">
                    <section aria-label="输入与设置" className={`${panel} space-y-4`}>
                        <header className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="font-semibold">输入与设置</h2>
                            <span className="rounded-full bg-[var(--gm-wash)] px-2 py-1 text-xs text-[var(--gm-text-3)]">无限练习模型池</span>
                        </header>
                        <input
                            ref={file}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                                void upload(event.target.files?.[0]);
                                event.currentTarget.value = "";
                            }}
                        />
                        <div ref={stage} className={`relative overflow-hidden rounded-xl border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)]/40 ${source ? "h-[17rem]" : "h-56"}`}>
                            {source ? (
                                <div
                                    aria-label="扩图范围"
                                    className="absolute border border-[var(--gm-accent)]"
                                    style={{
                                        width: frameW * scale,
                                        height: frameH * scale,
                                        left: Math.max(17, Math.min(viewport.width - frameW * scale - 17, (viewport.width - source.width * scale) / 2 - padding.left * scale)),
                                        top: Math.max(32, Math.min(viewport.height - frameH * scale - 17, (viewport.height - source.height * scale) / 2 - padding.top * scale)),
                                        backgroundImage: "repeating-conic-gradient(#cbd8ea 0% 25%, #eff4fb 0% 50%)",
                                        backgroundSize: "16px 16px",
                                    }}
                                >
                                    <span className="absolute bottom-full mb-1 whitespace-nowrap text-xs text-[var(--gm-text-3)]">
                                        {frameW} × {frameH}
                                    </span>
                                    <img
                                        src={source.url}
                                        alt="原图"
                                        draggable={false}
                                        className="pointer-events-none absolute max-w-none select-none"
                                        style={{ left: padding.left * scale, top: padding.top * scale, width: source.width * scale, height: source.height * scale }}
                                    />
                                    {handles.map(([name, horizontal, vertical]) => (
                                        <button
                                            key={name}
                                            type="button"
                                            aria-label={`向${name}扩图`}
                                            disabled={busy || uploading}
                                            className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded focus-visible:outline-2 focus-visible:outline-[var(--gm-accent)]"
                                            style={{
                                                left: horizontal === "left" ? "0%" : horizontal === "right" ? "100%" : "50%",
                                                top: vertical === "top" ? "0%" : vertical === "bottom" ? "100%" : "50%",
                                                cursor: horizontal && vertical ? ((horizontal === "left") === (vertical === "top") ? "nwse-resize" : "nesw-resize") : horizontal ? "ew-resize" : "ns-resize",
                                            }}
                                            onPointerDown={(event) => {
                                                if (event.button !== 0) return;
                                                event.currentTarget.setPointerCapture(event.pointerId);
                                                drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, scale, padding, horizontal, vertical };
                                            }}
                                            onPointerMove={move}
                                            onPointerUp={end}
                                            onPointerCancel={end}
                                            onLostPointerCapture={end}
                                            onKeyDown={(event) => {
                                                const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                                                const direction = arrows[event.key];
                                                if (!direction) return;
                                                event.preventDefault();
                                                const step = event.shiftKey ? 64 : 16;
                                                grow(horizontal, vertical, direction[0] * step, direction[1] * step, padding);
                                            }}
                                        >
                                            <span aria-hidden className={`rounded-[3px] border border-[#6382b5] bg-white ${!horizontal ? "h-2 w-5" : !vertical ? "h-5 w-2" : "size-2.5"}`} />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <button type="button" onClick={() => file.current?.click()} disabled={uploading} className="grid h-full w-full place-content-center justify-items-center gap-2 text-sm text-[var(--gm-text-2)]">
                                    <ImagePlus className="size-6" />
                                    {uploading ? "图片上传中…" : "点击上传一张图片"}
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <PracticeAssetPicker disabled={busy || uploading} onSelect={selectSource} label="或从个人素材库选择" />
                            {source && (
                                <GammaButton variant="outline" disabled={busy || uploading} onClick={() => file.current?.click()}>
                                    更换图片
                                </GammaButton>
                            )}
                        </div>
                        <label className="block space-y-1 text-sm">
                            <span>扩图比例</span>
                            <select className={selectClass} disabled={!source || busy || uploading} value={ratio} onChange={(event) => changeRatio(event.target.value as OutpaintingRatio)}>
                                {OUTPAINTING_RATIOS.map((item) => (
                                    <option key={item} value={item}>
                                        {ratioLabel(item)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-1 text-sm">
                            <span>输出分辨率</span>
                            <select className={selectClass} disabled={!source || busy || uploading} value={resolution} onChange={(event) => updateSelection({ ...selection, resolution: event.target.value === "1k" ? "1k" : "2k" })}>
                                <option value="1k">1K · 1024px</option>
                                <option value="2k">2K · 2048px</option>
                            </select>
                        </label>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--gm-text-3)]">
                            <span role="status">{geometry ? `原图 ${source?.width} × ${source?.height} → 输出 ${geometry.width} × ${geometry.height}` : source ? "向外拖动边框或选择比例，需保留有效扩展区域" : "请先选择一张图片"}</span>
                            <GammaButton variant="outline" disabled={!source || busy || uploading} onClick={() => changeRatio("original")}>
                                重置边框
                            </GammaButton>
                        </div>
                        <GammaButton className="w-full" icon={<Sparkles className="size-4" />} disabled={!geometry || busy || uploading} loading={busy} onClick={() => void generate()}>
                            {busy ? "正在扩图…" : "开始 AI 扩图"}
                        </GammaButton>
                        {error && (
                            <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                                {error}
                            </p>
                        )}
                    </section>
                    <section aria-label="生成结果与诊断" className={`${panel} space-y-4`}>
                        <h2 className="flex items-center gap-2 font-semibold">
                            <WandSparkles className="size-4 text-[var(--gm-accent)]" />
                            生成结果与诊断
                        </h2>
                        {result ? (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    <GammaButton variant="outline" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>
                                        原图
                                    </GammaButton>
                                    <GammaButton variant="outline" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>
                                        扩图结果
                                    </GammaButton>
                                    <a className="rounded-lg border border-[var(--gm-border)] px-3 py-2 text-sm" href={result.image.url} download="AI 扩图.png">
                                        下载 PNG
                                    </a>
                                    <GammaButton variant="outline" disabled={saving || saved.has(result.id)} onClick={() => void save()}>
                                        {saved.has(result.id) ? "已保存" : "保存到素材库"}
                                    </GammaButton>
                                </div>
                                <img className="max-h-[55vh] w-full rounded-xl border border-[var(--gm-border)] bg-[var(--gm-wash)] object-contain" src={showOriginal ? result.sourceUrl : result.image.url} alt={showOriginal ? "历史原图" : "AI 扩图结果"} />
                                <div className="rounded-lg bg-[var(--gm-wash)] p-3 text-sm">
                                    <h3 className="font-semibold">扩图诊断</h3>
                                    <p>
                                        {result.width} × {result.height} → {result.image.width} × {result.image.height}
                                        {result.model ? ` · ${result.model}` : ""} · 已保留原图内容
                                    </p>
                                </div>
                            </>
                        ) : (
                            <p className="grid min-h-32 place-items-center text-center text-sm text-[var(--gm-text-3)]">{busy ? "扩图任务正在处理，完成后会显示结果" : "完成左侧设置后开始练习，结果会保留在历史记录中"}</p>
                        )}
                        {lesson && (
                            <section aria-label="结构化提示词" className="space-y-3 rounded-xl border border-[var(--gm-border)] p-3 sm:p-4">
                                <header className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h3 className="font-semibold">结构化提示词</h3>
                                        <p className="text-xs text-[var(--gm-text-3)]">{result ? "本次生成使用的提示词" : "根据当前扩图设置生成，提交时使用"}</p>
                                    </div>
                                    <GammaButton
                                        variant="outline"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(result?.prompt || lesson.prompt);
                                                message.success("已复制完整提示词");
                                            } catch {
                                                message.error("复制失败，请选中文字手动复制");
                                            }
                                        }}
                                    >
                                        复制完整提示词
                                    </GammaButton>
                                </header>
                                <ol className="grid gap-2">
                                    {lesson.sections.map((part, index) => (
                                        <li className="rounded-lg bg-[var(--gm-wash)]/60 p-3 text-sm" key={part.title}>
                                            <h4 className="font-semibold">
                                                {index + 1}. {part.title}
                                            </h4>
                                            <p className="mt-1">{result ? result.prompt.split("\n")[index]?.replace(`${part.title}：`, "") || part.text : part.text}</p>
                                            <p className="mt-1 text-xs text-[var(--gm-text-3)]">学习要点：{part.tip}</p>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}
                    </section>
                    <section aria-label="历史记录" className={`${panel} lg:col-span-2 xl:col-span-1`}>
                        <h2 className="mb-4 flex items-center gap-2 font-semibold">
                            <History className="size-4" />
                            历史记录 <span className="ml-auto text-xs text-[var(--gm-text-3)]">{history.length} 条</span>
                        </h2>
                        {history.length ? (
                            <ol className="max-h-[72vh] space-y-2 overflow-auto p-0.5">
                                {history.map((record) => (
                                    <li key={record.id}>
                                        <button
                                            type="button"
                                            disabled={busy || uploading}
                                            aria-pressed={result?.id === record.id}
                                            onClick={() => restore(record)}
                                            className="flex w-full items-center gap-2 rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash)]/40 p-2 text-left hover:border-[var(--gm-accent)] aria-pressed:border-[var(--gm-accent)]"
                                        >
                                            <img src={record.image.url} alt="" loading="lazy" className="size-12 shrink-0 rounded object-cover" />
                                            <span className="min-w-0 text-xs">
                                                <strong className="block">
                                                    {ratioLabel(record.selection.ratio)} · {record.selection.resolution.toUpperCase()}
                                                </strong>
                                                <span className="block">
                                                    {record.image.width} × {record.image.height}
                                                </span>
                                                <time className="text-[var(--gm-text-3)]" dateTime={new Date(record.createdAt).toISOString()}>
                                                    {new Date(record.createdAt).toLocaleString("zh-CN", { hour12: false })}
                                                </time>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="py-10 text-center text-sm text-[var(--gm-text-3)]">{historyStatus}</p>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}
