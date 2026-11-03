"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * PDF 课件预览：用 pdfjs-dist 自己渲染，不再用浏览器自带的阅读器 iframe。
 *   顶栏：页码 / 缩放 / 适应宽度 / 重置 / 翻页 / 下载
 *   主体：当前页 canvas（滚轮与 ←/→ 翻页）
 * 工具条沿用 gm 令牌，不会出现浏览器阅读器那种灰框和双滚动条。
 */

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const STEP = 0.2;

type PdfDocumentProxy = { numPages: number; getPage: (page: number) => Promise<PdfPageProxy>; destroy?: () => Promise<void> };
type PdfPageProxy = {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
};

export interface PdfPreviewProps {
    /** 资料地址（同源鉴权路由） */
    src: string;
    title: string;
    downloadHref?: string;
    className?: string;
    /** panel=备课页内嵌（带工具条）；stage=全屏放映（隐藏工具条，按高度自适应，左右玻璃翻页） */
    variant?: "panel" | "stage";
}

export function PdfPreview({ src, title, downloadHref, className, variant = "panel" }: PdfPreviewProps) {
    const stage = variant === "stage";
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const docRef = useRef<PdfDocumentProxy | null>(null);
    const renderTask = useRef<{ cancel: () => void } | null>(null);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [fitWidth, setFitWidth] = useState(true);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");

    // 载入文档：worker 取随包发布的同源文件，避免跨域
    useEffect(() => {
        let cancelled = false;
        setStatus("loading");
        setPage(1);
        setPages(0);
        void docRef.current?.destroy?.()?.catch(() => undefined);
        docRef.current = null;

        void (async () => {
            try {
                const pdfjs = await import("pdfjs-dist");
                pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
                const doc = (await pdfjs.getDocument({ url: src, withCredentials: true }).promise) as unknown as PdfDocumentProxy;
                if (cancelled) {
                    void doc.destroy?.();
                    return;
                }
                docRef.current = doc;
                setPages(doc.numPages);
                setStatus("ready");
            } catch (caught) {
                if (cancelled) return;
                setError(caught instanceof Error ? caught.message : "课件加载失败");
                setStatus("error");
            }
        })();

        return () => {
            cancelled = true;
            renderTask.current?.cancel();
            void docRef.current?.destroy?.()?.catch(() => undefined);
            docRef.current = null;
        };
    }, [src]);

    // 渲染当前页：面板模式按宽度适应；放映模式同时受宽、高约束，整页必须完整可见
    const render = useCallback(async () => {
        const doc = docRef.current;
        const canvas = canvasRef.current;
        if (!doc || !canvas || !pages) return;
        try {
            const pdfPage = await doc.getPage(Math.min(Math.max(1, page), pages));
            const containerWidth = scrollRef.current?.clientWidth ?? 0;
            const containerHeight = scrollRef.current?.clientHeight ?? 0;
            const base = pdfPage.getViewport({ scale: 1 });
            let effective = scale;
            if (stage) {
                const byWidth = containerWidth ? (containerWidth - 32) / base.width : Number.POSITIVE_INFINITY;
                const byHeight = containerHeight ? (containerHeight - 24) / base.height : Number.POSITIVE_INFINITY;
                effective = Math.min(MAX_SCALE, Math.max(0.1, Math.min(byWidth, byHeight)));
            } else if (fitWidth && containerWidth) {
                effective = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (containerWidth - 48) / base.width));
            }
            const viewport = pdfPage.getViewport({ scale: effective });
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(viewport.width * ratio);
            canvas.height = Math.floor(viewport.height * ratio);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            const context = canvas.getContext("2d");
            if (!context) return;
            renderTask.current?.cancel();
            const task = pdfPage.render({ canvasContext: context, viewport });
            renderTask.current = task;
            await task.promise;
        } catch {
            // 快速翻页时上一张渲染会被取消，属正常
        }
    }, [fitWidth, page, pages, scale, stage]);

    useEffect(() => {
        if (status !== "ready") return;
        void render();
    }, [render, status]);

    // 容器尺寸变化要重渲染：窗口缩放、侧栏收起、进出放映都会改变可用空间
    useEffect(() => {
        const node = scrollRef.current;
        if (!node || status !== "ready") return;
        let frame = 0;
        const observer = new ResizeObserver(() => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => void render());
        });
        observer.observe(node);
        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [render, status]);

    const go = useCallback(
        (next: number) => {
            setPage(() => Math.min(Math.max(1, next), Math.max(1, pages)));
        },
        [pages],
    );

    const zoom = (delta: number) => {
        setFitWidth(false);
        setScale((value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((value + delta).toFixed(2)))));
    };

    // 键盘翻页（焦点不在输入框里时）
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement).closest("input,textarea,[role=dialog]")) return;
            if (event.key === "ArrowRight") go(page + 1);
            if (event.key === "ArrowLeft") go(page - 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [go, page]);

    return (
        <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-bg-elevated)] ring-1 ring-[var(--gm-border)]", stage && "rounded-none bg-transparent ring-0", className)}>
            <header className={cn("flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--gm-border)] px-2 py-1.5 text-[var(--gm-text-2)]", stage && "hidden")}>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gm-wash)] px-2 py-1 text-[11px] tabular-nums">
                    <input
                        aria-label="页码"
                        value={page}
                        onChange={(event) => {
                            const next = Number(event.target.value.replace(/\D/g, ""));
                            if (next) go(next);
                        }}
                        className="w-7 bg-transparent text-center outline-none"
                    />
                    <span className="text-[var(--gm-text-3)]">/ {pages || "–"}</span>
                </span>
                <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--gm-border-strong)]" />
                <button type="button" aria-label="缩小" onClick={() => zoom(-STEP)} className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                    <Minus className="size-3.5" />
                </button>
                <span className="min-w-9 text-center text-[11px] tabular-nums">{Math.round(scale * 100)}%</span>
                <button type="button" aria-label="放大" onClick={() => zoom(STEP)} className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                    <Plus className="size-3.5" />
                </button>
                <button
                    type="button"
                    aria-label="适应宽度"
                    aria-pressed={fitWidth}
                    onClick={() => setFitWidth((value) => !value)}
                    className={cn("grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]", fitWidth && "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]")}
                >
                    <Maximize2 className="size-3.5" />
                </button>
                <button
                    type="button"
                    aria-label="重置缩放"
                    onClick={() => {
                        setFitWidth(true);
                        setScale(1.2);
                    }}
                    className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                >
                    <RotateCcw className="size-3.5" />
                </button>
                <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--gm-border-strong)]" />
                <button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => go(page - 1)} className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] disabled:opacity-30">
                    <ChevronLeft className="size-4" />
                </button>
                <button type="button" aria-label="下一页" disabled={page >= pages} onClick={() => go(page + 1)} className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] disabled:opacity-30">
                    <ChevronRight className="size-4" />
                </button>
                <span className="ml-auto truncate text-[11px] text-[var(--gm-text-3)]" title={title}>
                    {title}
                </span>
                {downloadHref ? (
                    <a href={downloadHref} aria-label="下载课件" className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                        <Download className="size-3.5" />
                    </a>
                ) : null}
            </header>

            <div ref={scrollRef} className={cn("gm-scroll relative flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[#0b0f18] p-3", stage && "items-center overflow-hidden p-3")}>
                {status === "loading" ? (
                    <span className="absolute inset-0 grid place-items-center text-[var(--gm-text-3)]">
                        <Loader2 className="size-5 animate-spin" />
                    </span>
                ) : null}
                {status === "error" ? (
                    <div className="m-auto max-w-sm text-center text-xs leading-relaxed text-[var(--gm-danger)]">
                        <p>课件加载失败{error ? `：${error}` : ""}</p>
                        {downloadHref ? (
                            <a href={downloadHref} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-[image:var(--gm-gradient)] px-4 text-xs font-medium text-white">
                                <Download className="size-3.5" />
                                下载后再看
                            </a>
                        ) : null}
                    </div>
                ) : null}
                <canvas ref={canvasRef} aria-label={title} className={cn("block h-auto max-w-none rounded-[6px] bg-white shadow-[0_18px_40px_rgba(0,0,0,0.45)]", status !== "ready" && "invisible")} />

                {/* 左右玻璃翻页：面板与放映都用同一套，翻的是课件页码而不是资料 */}
                {status === "ready" && pages > 1 ? (
                    <>
                        <button
                            type="button"
                            aria-label="上一页"
                            disabled={page <= 1}
                            onClick={() => go(page - 1)}
                            className="gm-glass absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg transition-opacity disabled:pointer-events-none disabled:opacity-0"
                        >
                            <ChevronLeft className="size-5" />
                        </button>
                        <button
                            type="button"
                            aria-label="下一页"
                            disabled={page >= pages}
                            onClick={() => go(page + 1)}
                            className="gm-glass absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg transition-opacity disabled:pointer-events-none disabled:opacity-0"
                        >
                            <ChevronRight className="size-5" />
                        </button>
                    </>
                ) : null}
            </div>
        </div>
    );
}
