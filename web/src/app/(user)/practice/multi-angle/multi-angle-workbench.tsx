"use client";

import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aperture, ImagePlus } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { cn } from "@/lib/utils";
import { practiceApi, type PracticeSession } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";

import AngleParamsPanel from "./angle-params-panel";
import {
    ANGLE_PRESETS,
    BATCH_ANGLES,
    DEFAULT_SHOT_DISTANCE,
    DRAG_H_FACTOR,
    DRAG_P_FACTOR,
    MAX_SHOT_DISTANCE,
    MIN_SHOT_DISTANCE,
    WHEEL_STEP,
    clamp,
    createSampleImage,
    paintCapture,
    shotLabel,
    toSubjectAngle,
    wrapCameraAngle,
    type AngleMode,
    type BatchSize,
    type PresetKey,
} from "./lib/angle-model";
import { createAngleShots, groupMultiAngleSessions, type MultiAngleRun, type MultiAngleShot } from "./lib/angle-history";
import MultiAngleResults, { MultiAngleHistory } from "./multi-angle-results";
import MultiAngleStage from "./multi-angle-stage";
import OrbitWidget from "./orbit-widget";
import s from "./multi-angle.module.css";

interface DragStart {
    pointerId: number;
    x: number;
    y: number;
    h: number;
    p: number;
}

const DEFAULT_THUMB = { width: 52, height: 39 };

/** 把 data URL 落成 JPEG 下载，文件名里的非法字符统一换成下划线。 */
function downloadDataUrl(url: string, name: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `多角度练习-${name.replace(/[\\/:*?"<>|]/g, "_")}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** 指数退避轮询，2s→4s→8s→8s…，90 s 后超时。 */
async function pollSession(id: string, signal: AbortSignal): Promise<PracticeSession> {
    const deadline = Date.now() + 90_000;
    let delay = 2000;
    while (Date.now() < deadline) {
        if (signal.aborted) throw new Error("cancelled");
        const { session } = await practiceApi.getSession(id);
        if (session.status === "success" || session.status === "failed" || session.status === "cancelled") return session;
        await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, delay);
            signal.addEventListener(
                "abort",
                () => {
                    clearTimeout(t);
                    reject(new Error("cancelled"));
                },
                { once: true },
            );
        });
        delay = Math.min(delay * 2, 8000);
    }
    throw new Error("生成超时");
}

export default function MultiAngleWorkbench() {
    const { message } = App.useApp();

    const [image, setImage] = useState<string | null>(null);
    const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
    const [uploadedImage, setUploadedImage] = useState<Pick<UploadedImage, "storageKey"> | null>(null);
    const [uploading, setUploading] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [thumb, setThumb] = useState(DEFAULT_THUMB);
    const [mode, setMode] = useState<AngleMode>("camera");
    const [h, setH] = useState(0);
    const [p, setP] = useState(0);
    const [d, setD] = useState(DEFAULT_SHOT_DISTANCE);
    const [fisheye, setFisheye] = useState(false);
    const [preset, setPreset] = useState<PresetKey>("custom");
    const [batch, setBatch] = useState<BatchSize>(1);
    const [promptOn, setPromptOn] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [dragging, setDragging] = useState(false);
    const [dropActive, setDropActive] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [shots, setShots] = useState<MultiAngleShot[]>([]);
    const [resultRevision, setResultRevision] = useState(0);
    // 结果说明按「生成那一刻」的机位快照写，之后继续拖镜头不会改动已有结果的标注
    const [runMeta, setRunMeta] = useState<{ total: number; distance: number; wideAngle: boolean; cameraMode: boolean } | null>(null);
    const [runs, setRuns] = useState<MultiAngleRun[]>([]);
    const [restoredId, setRestoredId] = useState<string | null>(null);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyHasMore, setHistoryHasMore] = useState(false);

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const widgetRef = useRef<HTMLDivElement | null>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const workspaceRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dragRef = useRef<DragStart | null>(null);
    const live = useRef({ h, p, d, fisheye, mode });
    const aliveRef = useRef(true);
    const historyRequest = useRef(0);
    const imageRequest = useRef(0);
    const generationActive = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    live.current = { h, p, d, fisheye, mode };

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
            historyRequest.current += 1;
            imageRequest.current += 1;
            dragRef.current = null;
            abortRef.current?.abort();
        };
    }, []);

    const loadHistory = useCallback(async (page: number) => {
        const request = ++historyRequest.current;
        setHistoryLoading(true);
        setHistoryError(false);
        try {
            const response = await practiceApi.listSessions({ history: "multi-angle", page });
            if (request !== historyRequest.current || !aliveRef.current) return;
            const next = groupMultiAngleSessions(response.sessions);
            setRuns((previous) => (page === 1 ? next : [...previous, ...next.filter((run) => !previous.some((item) => item.id === run.id))]));
            setHistoryPage(response.page);
            setHistoryHasMore(response.page * response.pageSize < response.total);
        } catch {
            if (request === historyRequest.current && aliveRef.current) setHistoryError(true);
        } finally {
            if (request === historyRequest.current && aliveRef.current) setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadHistory(1);
    }, [loadHistory]);

    // ─── 载入图片：量出宽高比，用来等比缩小中央缩略卡 ───
    useEffect(() => {
        if (!image) {
            setImageEl(null);
            setThumb(DEFAULT_THUMB);
            return;
        }
        const element = new Image();
        element.onload = () => {
            if (!aliveRef.current) return;
            setImageEl(element);
            const ratio = element.naturalWidth / element.naturalHeight || 1;
            let width = 52;
            let height = 52 / ratio;
            if (height > 62) {
                height = 62;
                width = 62 * ratio;
            }
            setThumb({ width: Math.round(width), height: Math.round(height) });
        };
        element.onerror = () => setImageError(true);
        element.src = image;
        return () => {
            element.onload = null;
            element.onerror = null;
        };
    }, [image]);

    // 操作台右上角的实时取景。
    useEffect(() => {
        const canvas = captureCanvasRef.current;
        if (!canvas) return;
        if (!imageEl) {
            canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        paintCapture(canvas, imageEl, { h, p, d, fisheye, aspect: 1 });
    }, [imageEl, h, p, d, fisheye]);

    const startUpload = useCallback(
        (url: string, input: string | File, request: number) => {
            if (request !== imageRequest.current || !aliveRef.current || generationActive.current) return;
            setImage(url);
            setImageError(false);
            setUploadedImage(null);
            setRestoredId(null);
            setShots([]);
            setRunMeta(null);
            setUploading(true);
            const isCurrent = () => aliveRef.current && request === imageRequest.current;
            void uploadImage(input)
                .then((uploaded) => {
                    if (isCurrent()) setUploadedImage(uploaded);
                })
                .catch((error) => {
                    if (isCurrent()) message.error(error instanceof Error ? error.message : "上传失败");
                })
                .finally(() => {
                    if (isCurrent()) setUploading(false);
                });
        },
        [message],
    );

    const acceptFile = useCallback(
        (file: File | null | undefined) => {
            if (!file || !file.type.startsWith("image/") || generationActive.current) return;
            const request = ++imageRequest.current;
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") startUpload(reader.result, file, request);
            };
            reader.onerror = () => {
                if (request !== imageRequest.current || !aliveRef.current) return;
                setUploading(false);
                message.error("无法读取图片，请重新选择");
            };
            setUploading(true);
            reader.readAsDataURL(file);
        },
        [message, startUpload],
    );

    // 拖到页面任意位置、Ctrl+V 粘贴图片都能载入（输入框内粘贴不拦截）
    useEffect(() => {
        const onDragOver = (event: DragEvent) => {
            event.preventDefault();
            setDropActive(true);
        };
        const onDragLeave = (event: DragEvent) => {
            if (event.relatedTarget === null) setDropActive(false);
        };
        const onDrop = (event: DragEvent) => {
            event.preventDefault();
            setDropActive(false);
            acceptFile(event.dataTransfer?.files?.[0]);
        };
        const onPaste = (event: ClipboardEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
            for (const item of Array.from(event.clipboardData?.items ?? [])) {
                if (item.type.startsWith("image/")) {
                    acceptFile(item.getAsFile());
                    message.success("已从剪贴板读取图片");
                    return;
                }
            }
        };
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("drop", onDrop);
        window.addEventListener("paste", onPaste);
        return () => {
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop", onDrop);
            window.removeEventListener("paste", onPaste);
        };
    }, [acceptFile, message]);

    // ─── 参数写入：拖拽 / 滚轮 / 滑杆 / 预设都走这里 ───
    const applyAngles = useCallback((next: { h?: number; p?: number }) => {
        const current = live.current;
        if (next.h !== undefined) {
            setH(current.mode === "camera" ? wrapCameraAngle(next.h) : clamp(Math.round(next.h), -180, 180));
        }
        if (next.p !== undefined) setP(clamp(Math.round(next.p), -90, 90));
        setPreset("custom");
        setFisheye(false);
    }, []);

    const handlePointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (!image) return;
            event.preventDefault();
            const current = live.current;
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, h: current.h, p: current.p };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
        },
        [image],
    );

    const handlePointerMove = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const start = dragRef.current;
            if (!start || start.pointerId !== event.pointerId) return;
            const dh = (event.clientX - start.x) * DRAG_H_FACTOR;
            const dp = -(event.clientY - start.y) * DRAG_P_FACTOR;
            applyAngles({ h: start.h + dh, p: start.p + dp });
        },
        [applyAngles],
    );

    const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const start = dragRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDragging(false);
    }, []);

    // 滚轮 = 景别：向下拉远、向上推近。用原生监听才能在 preventDefault 生效（React 的 onWheel 是 passive）
    useEffect(() => {
        const viewport = viewportRef.current;
        const widget = widgetRef.current;
        const onWheel = (event: WheelEvent) => {
            if (!image) return;
            event.preventDefault();
            const direction = event.deltaY > 0 ? 1 : -1;
            const current = live.current.d;
            const next = clamp(current + direction * WHEEL_STEP, MIN_SHOT_DISTANCE, MAX_SHOT_DISTANCE);
            if (next === current) return;
            setD(next);
            setPreset("custom");
            setFisheye(false);
        };
        [viewport, widget].forEach((el) => el?.addEventListener("wheel", onWheel, { passive: false }));
        return () => {
            [viewport, widget].forEach((el) => el?.removeEventListener("wheel", onWheel));
        };
    }, [image]);

    const handlePreset = useCallback((key: PresetKey) => {
        setPreset(key);
        const config = ANGLE_PRESETS[key];
        if (!config) return;
        setH(live.current.mode === "camera" ? wrapCameraAngle(config.h) : toSubjectAngle(config.h));
        setP(config.p);
        if (config.d !== null) setD(config.d);
        setFisheye(config.fisheye);
    }, []);

    const handleMode = useCallback((next: AngleMode) => {
        setMode((prev) => {
            if (prev === next) return prev;
            // 同一角度在两种模式下的语义不同：摄像头是 [0,360)，主体是 [-180,180]
            setH((value) => (next === "camera" ? wrapCameraAngle(value) : toSubjectAngle(value)));
            setPreset("custom");
            return next;
        });
    }, []);

    const handleSlider = useCallback((next: { h?: number; p?: number; d?: number }) => {
        if (next.h !== undefined) setH(next.h);
        if (next.p !== undefined) setP(next.p);
        if (next.d !== undefined) setD(next.d);
        setPreset("custom");
        if (next.d !== undefined || next.h !== undefined || next.p !== undefined) setFisheye(false);
    }, []);

    const resetParams = useCallback(() => {
        setH(0);
        setP(0);
        setD(DEFAULT_SHOT_DISTANCE);
        setFisheye(false);
        setPreset("custom");
    }, []);

    const summaryText = useMemo(() => {
        if (!shots.length || !runMeta) return "";
        return `${runMeta.total} 张 · ${runMeta.wideAngle ? "鱼眼镜头" : shotLabel(runMeta.distance)} · ${runMeta.cameraMode ? "摄像头视角" : "主体视角"}`;
    }, [shots.length, runMeta]);

    // ─── 生成：上传图片后调 AI 练习画布 gamaimage 池 ───
    const generate = useCallback(async () => {
        if (!uploadedImage || !imageEl || imageError || generationActive.current || uploading) return;
        generationActive.current = true;
        setRestoredId(null);
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setGenerating(true);

        const snap = { ...live.current, batch, preset, prompt, promptOn, batchId: crypto.randomUUID() };
        const jobs = createAngleShots(snap);
        const { d: distance, fisheye: wideAngle, mode: cameraMode } = snap;

        setResultRevision((revision) => revision + 1);
        setShots(jobs);
        setRunMeta({ total: jobs.length, distance, wideAngle, cameraMode: cameraMode === "camera" });

        const urls: string[] = [];
        for (const [index, job] of jobs.entries()) {
            if (ac.signal.aborted || !aliveRef.current) break;
            setShots((prev) => prev.map((shot, i) => (i === index ? { ...shot, status: "running" as const } : shot)));
            try {
                const { session } = await practiceApi.createSession({
                    module: "storyboard-image",
                    mode: "workflow",
                    title: `多角度练习 · ${job.name}`,
                    input: {
                        prompt: job.prompt.full,
                        workflowCode: "gamaimage",
                        multiAngle: { ...snap, shotIndex: index },
                    },
                    references: [{ type: "asset", id: uploadedImage.storageKey, inputKey: "referenceImage" }],
                    logicalModelId: "gamaimage",
                    clientRequestId: crypto.randomUUID(),
                });
                const done = await pollSession(session.id, ac.signal);
                const url = done.status === "success" ? (done.result?.media?.url ?? null) : null;
                urls.push(url ?? "");
                setShots((prev) => prev.map((shot, i) => (i === index ? { ...shot, url, status: url ? ("success" as const) : ("failed" as const) } : shot)));
            } catch (error) {
                if ((error as Error).message === "cancelled") break;
                urls.push("");
                setShots((prev) => prev.map((shot, i) => (i === index ? { ...shot, status: "failed" as const } : shot)));
                message.error(`机位「${job.name}」生成失败`);
            }
        }

        generationActive.current = false;
        if (!aliveRef.current || ac.signal.aborted) return;
        setGenerating(false);
        const successCount = urls.filter(Boolean).length;
        if (successCount) message.success(`已生成 ${successCount} 张多角度画面`);
        void loadHistory(1);
    }, [uploadedImage, imageEl, imageError, uploading, batch, preset, prompt, promptOn, message, loadHistory]);

    const restoreRun = useCallback(
        (run: MultiAngleRun) => {
            if (generationActive.current) return;
            imageRequest.current += 1;
            const snap = run.snapshot;
            setImage(run.source.url);
            if (image !== run.source.url) setImageError(false);
            setUploadedImage(run.source);
            setUploading(false);
            setMode(snap.mode);
            setH(snap.h);
            setP(snap.p);
            setD(snap.d);
            setFisheye(snap.fisheye);
            setPreset(snap.preset);
            setBatch(snap.batch);
            setPromptOn(snap.promptOn);
            setPrompt(snap.prompt);
            setResultRevision((revision) => revision + 1);
            setShots(run.shots);
            setRunMeta({ total: snap.batch, distance: snap.d, wideAngle: snap.fisheye, cameraMode: snap.mode === "camera" });
            setRestoredId(run.id);
            if (fileInputRef.current) fileInputRef.current.value = "";
            window.requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({ block: "start" }));
        },
        [image],
    );

    const download = useCallback((url: string, name: string) => {
        downloadDataUrl(url, name);
    }, []);

    const downloadAll = useCallback(() => {
        const ready = shots.filter((shot): shot is MultiAngleShot & { url: string } => Boolean(shot.url));
        // 浏览器会拦连续同步下载，间隔一点再触发，保证每个文件都落到下载目录
        ready.forEach((shot, index) => {
            window.setTimeout(() => downloadDataUrl(shot.url, shot.name), index * 220);
        });
        message.success(`开始下载 ${ready.length} 张画面`);
    }, [shots, message]);

    const chooseSample = useCallback(() => {
        const url = createSampleImage();
        if (url) startUpload(url, url, ++imageRequest.current);
    }, [startUpload]);

    const clearImage = useCallback(() => {
        if (generationActive.current) return;
        imageRequest.current += 1;
        setImage(null);
        setImageError(false);
        setUploadedImage(null);
        setUploading(false);
        setShots([]);
        setRunMeta(null);
        setRestoredId(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    return (
        <main className={cn(s.root, "h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]")}>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => acceptFile(event.target.files?.[0])} />

            <div className="gm-page px-4 py-6 sm:px-6 lg:px-8">
                <header className={s.pageHead}>
                    <div>
                        <h1>
                            <span className={s.pageHeadIcon}>
                                <Aperture size={20} />
                            </span>
                            多角度练习
                        </h1>
                        <p>上传一张主体图，拖动镜头环绕它。镜头移到哪个角度，取景窗就实时显示那个机位会拍到的画面。</p>
                    </div>
                    {image ? (
                        <div className={s.headActions}>
                            <button type="button" className={cn(s.btn, s.btnGhost)} disabled={generating} onClick={clearImage}>
                                重新选择图片
                            </button>
                        </div>
                    ) : null}
                </header>

                {!image ? (
                    <div className={s.uploadCard}>
                        <div className={cn(s.dropzone, dropActive && s.dropzoneOver)} onClick={() => fileInputRef.current?.click()}>
                            <div className={s.dzInner}>
                                <div className={s.dzIcon}>
                                    <ImagePlus size={26} />
                                </div>
                                <b>拖入或点击上传一张主体图片</b>
                                <span>
                                    支持 JPG / PNG / WebP · 也可以直接 Ctrl+V 粘贴截图
                                    <br />
                                    上传后在环形轨迹上拖动镜头选择视角
                                </span>
                                <div className={s.dzActions}>
                                    <button
                                        type="button"
                                        className={cn(s.btn, s.btnPrimary)}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            fileInputRef.current?.click();
                                        }}
                                    >
                                        选择图片
                                    </button>
                                    <button
                                        type="button"
                                        className={cn(s.btn, s.btnGhost)}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            chooseSample();
                                        }}
                                    >
                                        用示例图试试
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={s.workspace} ref={workspaceRef}>
                        <section className={s.workCard} aria-labelledby="ma-controls-heading">
                            <h2 id="ma-controls-heading">操作台</h2>
                            <MultiAngleStage mode={mode} h={h} p={p} d={d} fisheye={fisheye} image={image} dragging={dragging} viewportRef={viewportRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
                                <OrbitWidget
                                    mode={mode}
                                    h={h}
                                    p={p}
                                    d={d}
                                    fisheye={fisheye}
                                    image={image}
                                    imageEl={imageEl}
                                    thumb={thumb}
                                    widgetRef={widgetRef}
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                />
                                <div className={s.capturePreview}>
                                    <canvas ref={captureCanvasRef} width={192} height={192} role="img" aria-label="当前机位的实时取景示意" />
                                    <span>当前取景</span>
                                </div>
                            </MultiAngleStage>
                            {imageError && (
                                <p className={s.hintLine} role="alert">
                                    原主体图已不可用，请重新选择图片。
                                </p>
                            )}

                            <AngleParamsPanel
                                mode={mode}
                                h={h}
                                p={p}
                                d={d}
                                fisheye={fisheye}
                                preset={preset}
                                batch={batch}
                                promptOn={promptOn}
                                prompt={prompt}
                                ready={!!uploadedImage && !!imageEl && !imageError && !uploading}
                                uploading={uploading}
                                costLabel={batch === 1 ? "1 个机位" : `${BATCH_ANGLES[batch].length} 个机位`}
                                generating={generating}
                                onModeChange={handleMode}
                                onPresetChange={handlePreset}
                                onAngleChange={handleSlider}
                                onBatchChange={setBatch}
                                onPromptToggle={() => setPromptOn((value) => !value)}
                                onPromptChange={setPrompt}
                                onReset={resetParams}
                                onGenerate={() => void generate()}
                            />
                        </section>
                        <MultiAngleResults key={resultRevision} shots={shots} summary={summaryText} historical={!!restoredId} generating={generating} onDownload={download} onDownloadAll={downloadAll} />
                    </div>
                )}
                <MultiAngleHistory
                    runs={runs}
                    selectedId={restoredId}
                    disabled={generating}
                    loading={historyLoading}
                    error={historyError}
                    hasMore={historyHasMore}
                    onRestore={restoreRun}
                    onRefresh={() => void loadHistory(1)}
                    onLoadMore={() => void loadHistory(historyPage + 1)}
                />
            </div>
        </main>
    );
}
