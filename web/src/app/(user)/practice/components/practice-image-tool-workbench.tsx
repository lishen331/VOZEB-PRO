"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Eraser, ImagePlus, LoaderCircle, Save, Sparkles, WandSparkles } from "lucide-react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { createLibraryAsset } from "@/services/api/library-assets";
import { parsePracticeReversePrompt } from "@/lib/practice-reverse-prompt";
import type { ReversePromptHistoryRecord } from "@/lib/practice-reverse-prompt-history";
import { pollPracticeImageToolTask, PracticeImageToolTaskFailed, type PracticeImageToolResult, type PracticeImageToolTask } from "./practice-image-tool-task";
import { PracticeReversePromptStudyDeck } from "./practice-reverse-prompt-study-deck";
import { PracticeReversePromptHistoryDrawer, REVERSE_PROMPT_MODES, restoreReversePromptHistoryView } from "./practice-reverse-prompt-history-drawer";
import { PracticeReversePromptTrial } from "./practice-reverse-prompt-trial";
import { PracticeAssetPicker } from "./practice-asset-picker";
import { getPracticeImageToolConfig, LOCAL_EDIT_HISTORY_LIMIT, type LocalEditPracticeRecord, type PracticeImageToolId } from "@/lib/practice-image-tools";
import { canvasReadableImageUrl } from "@/lib/browser-media-url";
import { parseServerMediaUrl } from "@/services/server-media-storage";
import { LocalEditHistory, LocalEditPromptLesson, readLocalEditSelection } from "./practice-local-edit-learning";
import { ExpressionHistory, ExpressionPromptLesson } from "./practice-expression-learning";
import { expressionLesson, EXPRESSION_HISTORY_LIMIT, readExpressionSelection, type ExpressionPracticeRecord } from "@/lib/practice-expression-learning";
import type { CanvasEmotionSelection } from "@/app/(user)/canvas/utils/canvas-emotion-prompt";
import { CanvasNodeEmotionDialog } from "@/app/(user)/canvas/components/canvas-node-emotion-dialog";
import { MAX_UPSCALE_LONG_EDGE, upscaleDataUrl, type ImageUpscaleAlgorithm } from "@/app/(user)/canvas/utils/canvas-image-data";

type ToolDiagnostic = { requestId: string; taskId?: string; taskType?: "text" | "image"; model?: string };

type Props = { toolId: PracticeImageToolId };

export default function PracticeImageToolWorkbench({ toolId }: Props) {
    const config = getPracticeImageToolConfig(toolId)!;
    const { message } = App.useApp();
    const fileRef = useRef<HTMLInputElement>(null);
    const maskRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const expressionReadRef = useRef(0);
    const restoredSelection = useRef<ImageData | null>(null);
    const reverse = toolId === "reverse-prompt";
    const localEdit = toolId === "local-edit";
    const expressionTool = toolId === "expression-reference";
    const [expressionSelection, setExpressionSelection] = useState<CanvasEmotionSelection | null>(null);
    const [expressionRecord, setExpressionRecord] = useState<ExpressionPracticeRecord | null>(null);
    const [expressionHistory, setExpressionHistory] = useState<ExpressionPracticeRecord[]>([]);
    const [expressionDirty, setExpressionDirty] = useState(false);
    const expressionSubmitting = useRef(false);
    const [source, setSource] = useState<UploadedImage | null>(null);
    const [prompt, setPrompt] = useState("");
    const [mode, setMode] = useState<(typeof REVERSE_PROMPT_MODES)[number]["id"]>("general");
    const [emotionDialogData, setEmotionDialogData] = useState("");
    const [emotionDialogOpen, setEmotionDialogOpen] = useState(false);
    const [upscaleTarget, setUpscaleTarget] = useState(2048);
    const [upscaleAlgorithm, setUpscaleAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
    const [result, setResult] = useState<PracticeImageToolResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [trialBusy, setTrialBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [retryPrompt, setRetryPrompt] = useState("");
    const [diagnostic, setDiagnostic] = useState<ToolDiagnostic | null>(null);
    const [brushSize, setBrushSize] = useState(36);
    const [localRecord, setLocalRecord] = useState<LocalEditPracticeRecord | null>(null);
    const [history, setHistory] = useState<LocalEditPracticeRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(localEdit || expressionTool);
    const [historyError, setHistoryError] = useState(false);
    const [historyRevision, setHistoryRevision] = useState(0);
    const [restoring, setRestoring] = useState(false);
    const [reverseSavedInputs, setReverseSavedInputs] = useState<{ sourceUrl?: string; mode: typeof mode; extraRequirement: string }>();
    const [reverseRestored, setReverseRestored] = useState<ReversePromptHistoryRecord>();
    const [reverseAnalysisId, setReverseAnalysisId] = useState<string>();
    const [reverseRestoreRevision, setReverseRestoreRevision] = useState(0);
    const [reverseSourcePreview, setReverseSourcePreview] = useState<"loading" | "missing" | null>(null);
    const [trialDraftDirty, setTrialDraftDirty] = useState(false);
    const reverseRestoreRequest = useRef<AbortController | null>(null);
    useEffect(() => () => reverseRestoreRequest.current?.abort(), []);

    const reloadHistory = useCallback(() => {
        setHistoryLoading(true);
        setHistoryError(false);
        setHistoryRevision((revision) => revision + 1);
    }, []);
    useEffect(() => {
        if (!localEdit) return;
        const controller = new AbortController();
        let active = true;
        async function load() {
            try {
                const response = await fetch("/api/practice/image-tools", { cache: "no-store", signal: controller.signal });
                if (!response.ok) throw new Error("history unavailable");
                const { records } = (await response.json()) as { records: LocalEditPracticeRecord[] };
                if (active) {
                    setHistory(records);
                    setHistoryError(false);
                }
            } catch {
                if (active) setHistoryError(true);
            } finally {
                if (active) setHistoryLoading(false);
            }
        }
        void load();
        return () => {
            active = false;
            controller.abort();
        };
    }, [localEdit, historyRevision]);

    useEffect(() => {
        if (!expressionTool) return;
        const controller = new AbortController();
        async function load() {
            try {
                const response = await fetch("/api/practice/image-tools?history=expression-reference", { cache: "no-store", signal: controller.signal });
                if (!response.ok) throw new Error("history unavailable");
                const { records } = (await response.json()) as { records: ExpressionPracticeRecord[] };
                if (!controller.signal.aborted) {
                    setExpressionHistory(records);
                    setExpressionRecord((current) => (current?.status === "running" ? records.find((record) => record.id === current.id) || current : current));
                }
            } catch {
                if (!controller.signal.aborted) setHistoryError(true);
            } finally {
                if (!controller.signal.aborted) setHistoryLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [expressionTool, historyRevision]);

    useLayoutEffect(() => {
        const canvas = maskRef.current;
        if (!localEdit || !canvas) return;
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        if (restoredSelection.current) context?.putImageData(restoredSelection.current, 0, 0);
        restoredSelection.current = null;
    }, [localEdit, source]);

    const openHistory = (record: LocalEditPracticeRecord) => {
        setLocalRecord(record);
        setResult({ taskId: record.id, model: record.model, image: record.image });
    };

    const restoreHistory = async (record: LocalEditPracticeRecord) => {
        if (busy || uploading || restoring) return;
        setRestoring(true);
        try {
            const sourceReference = parseServerMediaUrl(record.sourceUrl);
            if (!sourceReference) throw new Error("历史原图已失效，请重新上传");
            const sourceImage = fetch(canvasReadableImageUrl(sourceReference.url), { cache: "no-store" });
            const [response, mask] = await Promise.all([sourceImage, readLocalEditSelection(record.maskUrl)]);
            if (!response.ok) throw new Error("历史原图已失效，请重新上传");
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            const { width, height } = bitmap;
            bitmap.close();
            if (width !== mask.width || height !== mask.height) throw new Error("历史选区与原图尺寸不一致，请重新涂抹");
            restoredSelection.current = mask;
            setSource({ ...sourceReference, width, height, bytes: blob.size, mimeType: blob.type || "image/png" });
            setPrompt(record.prompt);
            setError("");
            setRetryPrompt("");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "无法恢复历史设置，请重新上传并涂抹");
        } finally {
            setRestoring(false);
        }
    };

    const copyPracticePrompt = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            message.success("已复制参考写法");
        } catch {
            message.error("复制失败，请手动选择并复制参考写法");
        }
    };

    const restoreReverseHistory = async (id: string) => {
        if (busy || uploading || trialBusy || restoring || reverseRestoreRequest.current) return false;
        const controller = new AbortController();
        reverseRestoreRequest.current = controller;
        setRestoring(true);
        try {
            const response = await fetch(`/api/practice/reverse-prompt/history/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
            if (!response.ok) throw new Error(response.status === 404 ? "这条历史记录已不可用。" : "暂时无法恢复历史记录，请重试。");
            const { record } = (await response.json()) as { record: ReversePromptHistoryRecord };
            if (controller.signal.aborted) return false;
            const restored = restoreReversePromptHistoryView(record);
            setSource(restored.source);
            setMode(restored.mode);
            setPrompt(restored.extraRequirement);
            setResult(restored.result);
            setReverseRestored(record);
            setReverseAnalysisId(record.id);
            setReverseSavedInputs({ sourceUrl: restored.source?.url, mode: restored.mode, extraRequirement: restored.extraRequirement });
            setReverseSourcePreview(restored.source ? "loading" : "missing");
            setReverseRestoreRevision((value) => value + 1);
            setTrialDraftDirty(false);
            setError("");
            setRetryPrompt("");
            setDiagnostic(null);
            return true;
        } catch (cause) {
            if (!controller.signal.aborted) message.error(cause instanceof Error ? cause.message : "暂时无法恢复历史记录，请重试。");
            return false;
        } finally {
            reverseRestoreRequest.current = null;
            if (!controller.signal.aborted) setRestoring(false);
        }
    };

    const replaceSource = (image: UploadedImage) => {
        if (reverse) {
            setReverseSourcePreview(null);
            setReverseRestored(undefined);
            setReverseAnalysisId(undefined);
            setTrialDraftDirty(false);
        }
        expressionReadRef.current += 1;
        setSource(image);
        // Local-edit lessons keep the previous result until the next successful run.
        if (!localEdit && !expressionTool) setResult(null);
        if (expressionTool) {
            setExpressionSelection(null);
            setExpressionDirty(true);
        }
        setError("");
        setRetryPrompt("");
        setDiagnostic(null);
        setEmotionDialogOpen(false);
        setEmotionDialogData("");
        const mask = maskRef.current;
        if (mask) mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
    };

    const chooseFile = async (file?: File) => {
        if (!file || restoring || ((toolId === "reverse-prompt" || toolId === "expression-reference") && (busy || trialBusy || uploading))) return;
        if (!file.type.startsWith("image/")) return message.error("请选择图片文件");
        setUploading(true);
        setError("");
        try {
            const uploaded = await uploadImage(file);
            replaceSource(uploaded);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "图片上传失败");
        } finally {
            setUploading(false);
        }
    };

    const readPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        return { x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) };
    };
    const drawMask = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        event.preventDefault();
        const canvas = event.currentTarget;
        const point = readPointer(event);
        const context = canvas.getContext("2d");
        if (!context) return;
        context.globalCompositeOperation = "source-over";
        context.strokeStyle = "rgba(30, 136, 229, .58)";
        context.fillStyle = "rgba(30, 136, 229, .58)";
        context.lineWidth = brushSize * (canvas.width / Math.max(1, canvas.clientWidth));
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineTo(point.x, point.y);
        context.stroke();
        context.beginPath();
        context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(point.x, point.y);
    };

    const makeMaskUrl = async () => {
        const selection = maskRef.current;
        if (!selection) throw new Error("蒙版画布未就绪");
        const selectionContext = selection.getContext("2d");
        if (!selectionContext) throw new Error("无法读取蒙版");
        const selectionData = selectionContext.getImageData(0, 0, selection.width, selection.height).data;
        let hasPaint = false;
        for (let index = 3; index < selectionData.length; index += 4)
            if (selectionData[index] > 0) {
                hasPaint = true;
                break;
            }
        if (!hasPaint) throw new Error("请先在图片上涂抹要编辑的区域");
        const mask = document.createElement("canvas");
        mask.width = selection.width;
        mask.height = selection.height;
        const context = mask.getContext("2d");
        if (!context) throw new Error("无法生成编辑蒙版");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, mask.width, mask.height);
        const maskImage = context.getImageData(0, 0, mask.width, mask.height);
        for (let index = 3; index < maskImage.data.length; index += 4) if (selectionData[index] > 0) maskImage.data[index] = 0;
        context.putImageData(maskImage, 0, 0);
        return uploadImage(mask.toDataURL("image/png"));
    };

    const openExpressionEditor = async () => {
        if (!source || busy || uploading || restoring) return;
        if (emotionDialogData) {
            setEmotionDialogOpen(true);
            return;
        }
        const readId = ++expressionReadRef.current;
        try {
            const { imageToDataUrl } = await import("@/services/image-storage");
            const dataUrl = await imageToDataUrl(source);
            if (expressionReadRef.current !== readId) return;
            if (!dataUrl) throw new Error("无法读取源图片");
            setEmotionDialogData(dataUrl);
            setEmotionDialogOpen(true);
        } catch (cause) {
            if (expressionReadRef.current === readId) message.error(cause instanceof Error ? cause.message : "读取图片失败");
        }
    };

    const restoreExpression = async (record: ExpressionPracticeRecord) => {
        if (busy || uploading || restoring || saving) return false;
        setRestoring(true);
        // Invalidate an older read started by the editor, before awaiting the historical image.
        expressionReadRef.current += 1;
        try {
            const reference = parseServerMediaUrl(record.sourceUrl);
            if (!reference) throw new Error("历史原图已无法恢复，请重新上传");
            const response = await fetch(canvasReadableImageUrl(reference.url), { cache: "no-store" });
            if (!response.ok) throw new Error("历史原图已无法恢复，请重新上传");
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            const { width, height } = bitmap;
            bitmap.close();
            replaceSource({ ...reference, width, height, bytes: blob.size, mimeType: blob.type || "image/png" });
            setExpressionSelection(record.selection);
            setExpressionRecord(record);
            setExpressionDirty(false);
            setResult(record.image ? { taskId: record.id, model: record.model, image: record.image } : null);
            return true;
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "无法恢复历史练习");
            return false;
        } finally {
            setRestoring(false);
        }
    };

    const run = async (promptOverride?: string) => {
        if (!source || busy || trialBusy || uploading || restoring || reverseSourcePreview === "loading" || reverseSourcePreview === "missing" || expressionSubmitting.current) return;
        if (expressionTool && (!expressionSelection || saving)) return;
        if (expressionTool) expressionSubmitting.current = true;
        setBusy(true);
        setError("");
        let attempt: ExpressionPracticeRecord | null = null;
        const updateExpression = (record: ExpressionPracticeRecord, saveToList: boolean) => {
            setExpressionRecord(record);
            if (saveToList) setExpressionHistory((records) => [record, ...records.filter((existing) => existing.id !== record.id)].slice(0, EXPRESSION_HISTORY_LIMIT));
        };
        try {
            if (toolId === "super-resolution") {
                setDiagnostic({ requestId: crypto.randomUUID(), model: "本地超分处理" });
                const { imageToDataUrl } = await import("@/services/image-storage");
                const dataUrl = await imageToDataUrl(source);
                if (!dataUrl) throw new Error("无法读取源图片");
                const upscaled = await upscaleDataUrl(dataUrl, { targetLongEdge: upscaleTarget, algorithm: upscaleAlgorithm });
                const uploaded = await uploadImage(upscaled);
                setResult({ image: uploaded, model: "本地超分处理" });
                return;
            }
            if (toolId === "local-edit" && !prompt.trim()) throw new Error("请填写本次修改说明");
            const mask = toolId === "local-edit" ? await makeMaskUrl() : undefined;
            const finalPrompt =
                (expressionTool && expressionSelection ? expressionLesson(expressionSelection).prompt : promptOverride?.trim()) ||
                (toolId === "reverse-prompt" ? `${REVERSE_PROMPT_MODES.find((item) => item.id === mode)?.instruction || "请描述图片"}${prompt.trim() ? `。补充要求：${prompt.trim()}` : ""}` : prompt.trim());
            const requestId = crypto.randomUUID();
            setDiagnostic({ requestId });
            setRetryPrompt(finalPrompt);
            if (expressionTool && expressionSelection) {
                attempt = { id: requestId, sourceUrl: source.url, selection: expressionSelection, prompt: finalPrompt, createdAt: Date.now(), status: "pending" };
                setExpressionRecord(attempt);
                setExpressionDirty(false);
                setResult(null);
            }
            const response = await fetch("/api/practice/image-tools", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toolId, sourceUrl: source.url, ...(mask ? { maskUrl: mask.url } : {}), prompt: finalPrompt, clientRequestId: requestId, ...(reverse ? { reverseHistory: { mode, extraRequirement: prompt.trim() } } : {}), ...(attempt ? { expression: attempt.selection } : {}) }),
            });
            const payload = (await response.json().catch(() => ({}))) as { task?: PracticeImageToolTask; record?: ExpressionPracticeRecord; error?: string; historyWarning?: string };
            if (!response.ok || !payload.task) {
                if (attempt && payload.record) {
                    updateExpression(payload.record, true);
                    attempt = null;
                    reloadHistory();
                }
                throw new Error(payload.error || "任务提交失败");
            }
            if (attempt) {
                attempt = { ...attempt, id: payload.task.id, model: payload.task.model, status: "running" };
                updateExpression(attempt, true);
            }
            if (payload.historyWarning) message.warning(payload.historyWarning);
            setDiagnostic({ requestId, taskId: payload.task.id, taskType: payload.task.type, model: payload.task.model });
            const completed = await pollPracticeImageToolTask(payload.task);
            setResult(completed);
            if (reverse) {
                setReverseSavedInputs({ sourceUrl: source.url, mode, extraRequirement: prompt.trim() });
                setReverseRestored(undefined);
                setReverseAnalysisId(payload.historyWarning ? undefined : payload.task.id);
                setTrialDraftDirty(false);
            }
            if (attempt) {
                updateExpression({ ...attempt, status: "success", image: completed.image, model: completed.model }, true);
                reloadHistory();
            }
            if (mask && completed.taskId && completed.image) {
                const record: LocalEditPracticeRecord = {
                    id: completed.taskId,
                    createdAt: Date.now(),
                    model: completed.model || payload.task.model,
                    prompt: finalPrompt.slice(0, 20_000),
                    sourceUrl: source.url,
                    maskUrl: mask.url,
                    image: completed.image,
                };
                setLocalRecord(record);
                setHistory((records) => [record, ...records.filter((item) => item.id !== record.id)].slice(0, LOCAL_EDIT_HISTORY_LIMIT));
                reloadHistory();
            }
        } catch (cause) {
            const messageText = cause instanceof Error ? cause.message : "本次练习失败，请重试";
            setError(messageText);
            if (attempt) {
                const accepted = attempt.status === "running";
                updateExpression({ ...attempt, status: accepted && !(cause instanceof PracticeImageToolTaskFailed) ? "running" : "error", error: messageText }, accepted);
                if (accepted) reloadHistory();
            }
            message.error(messageText);
        } finally {
            expressionSubmitting.current = false;
            setBusy(false);
        }
    };

    const saveResult = async () => {
        const target = result || (expressionRecord?.image ? { taskId: expressionRecord.id, image: expressionRecord.image, saved: false } : null);
        if (!target?.image || saving || target.saved) return;
        setSaving(true);
        try {
            const image = target.image.storageKey ? target.image : await uploadImage(target.image.serverUrl || target.image.remoteUrl || target.image.url);
            const url = image.serverUrl || image.url;
            await createLibraryAsset({
                kind: "image",
                title: `${config.title}结果`,
                coverUrl: url,
                tags: ["无限练习", config.title],
                source: "practice",
                data: { dataUrl: url, serverUrl: url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
            });
            setResult((current) => (current && (current.taskId !== target.taskId || current.image !== target.image) ? current : { ...target, image, saved: true }));
            message.success("已保存到个人素材库");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败，请重试");
        } finally {
            setSaving(false);
        }
    };

    const resultImageUrl = result?.image?.serverUrl || result?.image?.remoteUrl || result?.image?.url || expressionRecord?.image?.url;
    const resultDiagnostic = localEdit && diagnostic?.taskId !== result?.taskId ? null : diagnostic;

    const selectionLesson = expressionSelection ? expressionLesson(expressionSelection) : null;
    const analysis = reverse && result?.text !== undefined ? parsePracticeReversePrompt(result.text) : null;
    const reverseBlocked = busy || trialBusy || uploading || restoring;
    const reverseDirty = trialDraftDirty || (reverseSourcePreview !== "missing" && source?.url !== reverseSavedInputs?.sourceUrl) || mode !== (reverseSavedInputs?.mode || "general") || prompt.trim() !== (reverseSavedInputs?.extraRequirement || "").trim();

    return (
        <section className={`mx-auto flex h-full min-h-0 w-full flex-col overflow-y-auto px-4 py-5 text-[var(--gm-text)] sm:px-6 lg:px-8 ${reverse || localEdit || expressionTool ? "max-w-[1660px]" : "max-w-6xl"}`}>
            <header className={`mb-5 flex items-center gap-3 ${expressionTool ? "xl:shrink-0" : ""}`}>
                <Link href="/practice" className="grid size-10 place-items-center rounded-full border border-[var(--gm-border)] text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)]" aria-label="返回无限练习">
                    <ArrowLeft className="size-4" />
                </Link>
                <div>
                    <p className="text-xs font-medium text-[var(--gm-text-3)]">无限练习 · 图像工具</p>
                    <h1 className="text-2xl font-semibold">{config.title}</h1>
                </div>
            </header>
            <div
                className={`grid min-h-0 flex-1 gap-5 ${reverse ? "xl:min-h-[26rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:[&>*]:min-h-0 xl:[&>:first-child]:overflow-y-auto xl:[&>:last-child]:overflow-y-auto" : expressionTool ? "items-start lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] xl:min-h-[26rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,.5fr)] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch" : localEdit ? "lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,.67fr)]" : "lg:grid-cols-[minmax(330px,.86fr)_minmax(0,1.14fr)]"}`}
            >
                <div className={`space-y-4 rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 sm:p-5 ${expressionTool ? "xl:min-h-0 xl:overflow-y-auto" : ""}`}>
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">输入与设置</h2>
                        <span className="rounded-full bg-[var(--gm-wash)] px-2.5 py-1 text-xs text-[var(--gm-text-2)]">{config.kind === "local-image" ? "本地处理 · 不扣 AI 积分" : "使用无限练习模型池"}</span>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                            void chooseFile(event.target.files?.[0]);
                            event.currentTarget.value = "";
                        }}
                    />
                    {source ? (
                        <div className="relative overflow-hidden rounded-xl border border-[var(--gm-border)] bg-black/5">
                            <img
                                key={reverse ? reverseRestoreRevision : undefined}
                                src={source.url}
                                onError={() => {
                                    if (reverseSourcePreview !== "loading") return;
                                    setSource(null);
                                    setReverseSourcePreview("missing");
                                }}
                                alt="练习源图"
                                className="mx-auto max-h-[38vh] max-w-full object-contain"
                                onLoad={(event) => {
                                    const canvas = maskRef.current;
                                    if (reverseSourcePreview === "loading") setReverseSourcePreview(null);
                                    const { naturalWidth, naturalHeight } = event.currentTarget;
                                    if (!canvas || !naturalWidth || !naturalHeight) return;
                                    if (canvas.width !== naturalWidth) canvas.width = naturalWidth;
                                    if (canvas.height !== naturalHeight) canvas.height = naturalHeight;
                                }}
                            />
                            {toolId === "local-edit" ? (
                                <canvas
                                    ref={maskRef}
                                    width={source.width}
                                    height={source.height}
                                    aria-label="编辑选区画布"
                                    className="absolute inset-0 h-full w-full touch-none"
                                    onPointerDown={(event) => {
                                        if (restoring) return;
                                        drawingRef.current = true;
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        const context = event.currentTarget.getContext("2d");
                                        if (context) {
                                            const point = readPointer(event);
                                            context.beginPath();
                                            context.moveTo(point.x, point.y);
                                            drawMask(event);
                                        }
                                    }}
                                    onPointerMove={drawMask}
                                    onPointerUp={() => {
                                        drawingRef.current = false;
                                        maskRef.current?.getContext("2d")?.beginPath();
                                    }}
                                    onPointerCancel={() => {
                                        drawingRef.current = false;
                                    }}
                                />
                            ) : null}
                            {toolId === "local-edit" ? <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">涂抹要修改的区域</span> : null}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="grid min-h-56 w-full place-items-center rounded-xl border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)]/30 text-sm text-[var(--gm-text-2)] hover:border-[var(--gm-accent)]"
                            disabled={uploading}
                        >
                            <span className="flex flex-col items-center gap-2">
                                {uploading ? <LoaderCircle className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
                                {uploading ? "图片上传中" : "点击上传一张图片"}
                            </span>
                        </button>
                    )}
                    {reverse && reverseSourcePreview === "missing" ? (
                        <p role="status" className="text-sm text-[var(--gm-text-3)]">
                            历史原图已无法显示，仍可查看拆解和提示词。如需重新分析，请选择图片。
                        </p>
                    ) : null}
                    {!source ? (
                        <div className="mt-2 flex justify-center">
                            <PracticeAssetPicker disabled={uploading || busy || trialBusy || restoring} onSelect={replaceSource} label="或从个人素材库选择" />
                        </div>
                    ) : null}
                    {source ? (
                        <div className="flex flex-wrap gap-2">
                            <GammaButton
                                size="sm"
                                variant="outline"
                                disabled={restoring || ((reverse || localEdit || toolId === "expression-reference") && (busy || trialBusy || uploading))}
                                onClick={() => fileRef.current?.click()}
                                icon={<ImagePlus className="size-4" />}
                            >
                                更换图片
                            </GammaButton>
                            <PracticeAssetPicker disabled={uploading || busy || trialBusy || restoring} onSelect={replaceSource} label="从个人素材库选择" />
                            {toolId === "local-edit" ? (
                                <GammaButton
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const canvas = maskRef.current;
                                        canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
                                    }}
                                    icon={<Eraser className="size-4" />}
                                >
                                    清空蒙版
                                </GammaButton>
                            ) : null}
                        </div>
                    ) : null}
                    {toolId === "reverse-prompt" ? (
                        <label className="block space-y-2 text-sm">
                            <span>分析重点</span>
                            <select value={mode} disabled={reverseBlocked} onChange={(event) => setMode(event.target.value as typeof mode)} className="w-full rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] px-3 py-2">
                                {REVERSE_PROMPT_MODES.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    {toolId === "local-edit" ? (
                        <>
                            <label className="block space-y-2 text-sm">
                                <span>画笔大小 · {brushSize}px</span>
                                <input type="range" min="8" max="120" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="w-full" />
                            </label>
                            <label className="block space-y-2 text-sm">
                                <span>修改说明</span>
                                <Input.TextArea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：把选中区域改为金属材质，保持原图光影" />
                            </label>
                        </>
                    ) : null}
                    {toolId === "expression-reference" ? (
                        <div className="space-y-2">
                            <p className="text-sm">沿用画布的人脸识别、手动框选、表情预设及强度/情绪调节。</p>
                            <GammaButton size="sm" variant="outline" disabled={!source || busy || uploading || restoring} onClick={() => void openExpressionEditor()} icon={<Sparkles className="size-4" />}>
                                {expressionSelection ? "编辑人物与表情" : "选择人物与表情"}
                            </GammaButton>
                            {selectionLesson ? (
                                <p className="text-sm" aria-label="当前表情设置">
                                    {selectionLesson.expression} · {selectionLesson.intensity} · {selectionLesson.rows[0].value}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                    {toolId === "reverse-prompt" ? (
                        <label className="block space-y-2 text-sm">
                            <span>额外分析要求（可选）</span>
                            <Input.TextArea rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={reverse && reverseBlocked} placeholder="例如：更关注服装和材质" />
                        </label>
                    ) : null}
                    {toolId === "super-resolution" ? (
                        <>
                            <label className="block space-y-2 text-sm">
                                <span>目标长边</span>
                                <select value={upscaleTarget} onChange={(event) => setUpscaleTarget(Number(event.target.value))} className="w-full rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] px-3 py-2">
                                    {[1024, 2048, MAX_UPSCALE_LONG_EDGE].map((value) => (
                                        <option key={value} value={value}>
                                            {value >= 4096 ? "4K" : `${value / 1024}K`} · {value}px
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block space-y-2 text-sm">
                                <span>算法</span>
                                <select value={upscaleAlgorithm} onChange={(event) => setUpscaleAlgorithm(event.target.value as ImageUpscaleAlgorithm)} className="w-full rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] px-3 py-2">
                                    <option value="high">高清插值</option>
                                    <option value="bilinear">双线性</option>
                                    <option value="nearest">最近邻（像素风）</option>
                                </select>
                            </label>
                        </>
                    ) : null}
                    <GammaButton
                        disabled={!source || busy || uploading || trialBusy || restoring || reverseSourcePreview === "loading" || (expressionTool && (!expressionSelection || saving))}
                        loading={busy}
                        onClick={() => void run()}
                        className="w-full"
                        icon={busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    >
                        {busy ? "正在处理…" : toolId === "reverse-prompt" ? "分析并生成提示词" : toolId === "super-resolution" ? "开始本地放大" : expressionTool ? "生成表情参考" : "生成编辑结果"}
                    </GammaButton>
                    {config.kind !== "local-image" ? <p className="text-xs leading-5 text-[var(--gm-text-3)]">提交后按无限练习当前模型池与计费配置执行；失败不会切换到生产模型。</p> : null}
                    {reverse ? <PracticeReversePromptHistoryDrawer activeId={reverseAnalysisId} blocked={reverseBlocked} dirty={reverseDirty} restoring={restoring} onRestore={restoreReverseHistory} /> : null}
                    {error && !expressionTool ? (
                        <div role="alert" className="rounded-lg border border-red-300/50 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
                            {error}
                            <button className="ml-2 underline" onClick={() => (reverse ? void run() : void run(retryPrompt || undefined))}>
                                重试
                            </button>
                            {diagnostic?.requestId ? (
                                <div className="mt-2 text-xs">
                                    请求 ID：<code>{diagnostic.requestId}</code>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                {reverse ? (
                    <PracticeReversePromptStudyDeck
                        key={`study:${result?.taskId || "empty"}:${reverseRestoreRevision}`}
                        analysis={analysis}
                        busy={busy}
                        blocked={reverseBlocked || reverseSourcePreview === "loading"}
                        onCopy={(value) => void copyPracticePrompt(value)}
                        onAnalyze={() => void run()}
                    />
                ) : (
                    <div className={`min-w-0 min-h-[360px] rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 sm:p-5 ${expressionTool ? "xl:min-h-0 xl:overflow-y-auto" : ""}`}>
                        <div className="mb-4 flex items-center gap-2">
                            <WandSparkles className="size-4 text-[var(--gm-accent)]" />
                            <h2 className="font-semibold">生成结果与诊断</h2>
                        </div>
                        {expressionTool ? (
                            expressionRecord ? (
                                <>
                                    {resultImageUrl ? (
                                        <>
                                            <img src={resultImageUrl} alt="表情参考结果" className="max-h-[55vh] w-full rounded-lg object-contain" />
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <a href={resultImageUrl} download className="rounded-lg border border-[var(--gm-border)] px-3 py-2 text-sm">
                                                    下载结果
                                                </a>
                                                <GammaButton variant="outline" disabled={saving || result?.saved} loading={saving} onClick={() => void saveResult()}>
                                                    {result?.saved ? "已保存到个人素材库" : "保存到个人素材库"}
                                                </GammaButton>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="rounded-lg bg-[var(--gm-wash)] p-3 text-sm" role="status">
                                            {expressionRecord.status === "error" || expressionRecord.status === "cancelled" ? "未生成图片" : expressionRecord.status === "success" ? "历史结果图暂不可用" : "任务执行中，可刷新历史查看进度"}
                                            {expressionRecord.error ? `：${expressionRecord.error}` : ""}
                                        </p>
                                    )}
                                    <ExpressionPromptLesson record={expressionRecord} dirty={expressionDirty} onCopy={(value) => void copyPracticePrompt(value)} />
                                </>
                            ) : (
                                <p className="py-12 text-center text-sm text-[var(--gm-text-3)]">完成左侧设置后开始练习</p>
                            )
                        ) : !result ? (
                            <div className="grid min-h-72 place-items-center text-center text-sm text-[var(--gm-text-3)]">
                                {busy ? (
                                    <span className="flex items-center gap-2">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        任务执行中，完成后会显示在这里
                                    </span>
                                ) : (
                                    "完成左侧设置后开始练习，结果会先保留在当前页面"
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2 text-xs text-[var(--gm-text-3)]">
                                    {resultDiagnostic?.taskId || result.taskId ? (
                                        <span>
                                            任务 ID：<code>{resultDiagnostic?.taskId || result.taskId}</code>
                                        </span>
                                    ) : null}
                                    <span>执行：{result.model || "本地处理"}</span>
                                </div>
                                {resultImageUrl ? (
                                    <div className="space-y-3">
                                        <div className="grid overflow-hidden rounded-xl border border-[var(--gm-border)] bg-black/5 md:grid-cols-2">
                                            <div className="p-2">
                                                <img src={localRecord?.sourceUrl || source?.url} alt="原图" className="max-h-[55vh] w-full object-contain" />
                                                <p className="mt-1 text-center text-xs text-[var(--gm-text-3)]">原图</p>
                                            </div>
                                            <div className="p-2">
                                                <img src={resultImageUrl} alt={`${config.title}结果`} className="max-h-[55vh] w-full object-contain" />
                                                <p className="mt-1 text-center text-xs text-[var(--gm-text-3)]">结果</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <a href={resultImageUrl} download className="inline-flex items-center gap-2 rounded-lg border border-[var(--gm-border)] px-3 py-2 text-sm">
                                                <Download className="size-4" />
                                                下载结果
                                            </a>
                                            <GammaButton variant="outline" disabled={saving || result.saved} loading={saving} onClick={() => void saveResult()} icon={<Save className="size-4" />}>
                                                {result.saved ? "已保存到个人素材库" : "保存到个人素材库"}
                                            </GammaButton>
                                        </div>
                                    </div>
                                ) : null}
                                {localRecord ? (
                                    <LocalEditPromptLesson record={localRecord} disabled={busy || uploading || restoring} onCopy={(value) => void copyPracticePrompt(value)} onApply={setPrompt} onRestore={() => void restoreHistory(localRecord)} />
                                ) : null}
                                <div className="rounded-lg bg-[var(--gm-wash)]/40 p-3 text-xs text-[var(--gm-text-3)]">
                                    <p>结果未自动写入个人素材库。图片结果可按需点击保存；本地超分结果可下载或主动保存。</p>
                                    {resultDiagnostic ? (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer font-medium">诊断信息</summary>
                                            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify({ toolId, ...resultDiagnostic, error: localEdit ? undefined : error || undefined }, null, 2)}</pre>
                                        </details>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {expressionTool ? (
                    <ExpressionHistory records={expressionHistory} activeId={expressionRecord?.id} loading={historyLoading} error={historyError} blocked={busy || uploading || restoring || saving} onReload={reloadHistory} onRestore={restoreExpression} />
                ) : null}
                {localEdit ? <LocalEditHistory records={history} activeId={localRecord?.id} loading={historyLoading} error={historyError} onOpen={openHistory} onReload={reloadHistory} /> : null}
                {reverse ? (
                    <PracticeReversePromptTrial
                        key={`trial:${result?.taskId || "empty"}:${reverseRestoreRevision}`}
                        initialPrompt={analysis?.fullPrompt || ""}
                        historyId={reverseAnalysisId}
                        restoredTrial={reverseRestored?.trial}
                        restoredStatus={reverseRestored?.trialStatus}
                        blocked={busy || uploading || restoring}
                        onBusyChange={setTrialBusy}
                        onDraftDirtyChange={setTrialDraftDirty}
                    />
                ) : null}
            </div>
            {toolId === "expression-reference" && emotionDialogData ? (
                <CanvasNodeEmotionDialog
                    dataUrl={emotionDialogData}
                    open={emotionDialogOpen}
                    preserveConfirmedSelection
                    restoredSelection={expressionSelection}
                    confirmLabel="确认设置"
                    onClose={() => setEmotionDialogOpen(false)}
                    onConfirm={(payload) => {
                        setEmotionDialogOpen(false);
                        setExpressionSelection(readExpressionSelection(payload));
                        setExpressionDirty(true);
                    }}
                />
            ) : null}
        </section>
    );
}
