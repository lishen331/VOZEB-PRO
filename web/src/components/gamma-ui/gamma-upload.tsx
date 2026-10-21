"use client";

import type { DragEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CheckCircle2, FileText, Film, Image as ImageIcon, Music, RotateCcw, UploadCloud, X } from "lucide-react";

import { checkFiles, describeAccept, formatBytes, type UploadLimits } from "@/components/gamma-ui/gamma-upload-core";
import { cn } from "@/lib/utils";

/*
 * 上传：拖拽 / 点击 / 粘贴（Ctrl+V 截图）三种入口；逐个文件显示进度、成功、失败与重传。
 * 真正的上传由外部 upload(file, onProgress) 完成，组件只管状态与外观。
 */

export type UploadStatus = "uploading" | "done" | "error";

export interface UploadItem {
    id: string;
    file: File;
    status: UploadStatus;
    progress: number;
    error?: string;
    preview?: string;
}

export interface GammaUploadProps extends UploadLimits {
    /** 实际上传；reject 时显示失败与重传 */
    upload: (file: File, onProgress: (percent: number) => void) => Promise<void>;
    title?: string;
    description?: ReactNode;
    /** 监听整页粘贴（参考图场景好用） */
    pasteToUpload?: boolean;
    variant?: "area" | "compact";
    onChange?: (items: UploadItem[]) => void;
    onReject?: (reasons: string[]) => void;
    invalid?: boolean;
    describedBy?: string;
    id?: string;
}

function kindIcon(file: File) {
    if (file.type.startsWith("image/")) return ImageIcon;
    if (file.type.startsWith("video/")) return Film;
    if (file.type.startsWith("audio/")) return Music;
    return FileText;
}

let seq = 0;

export function GammaUpload({ upload, accept, maxSize, maxFiles, title = "拖拽文件到这里，或点击上传", description, pasteToUpload = false, variant = "area", onChange, onReject, invalid = false, describedBy, id: idProp }: GammaUploadProps) {
    const reduce = useReducedMotion();
    const autoId = useId();
    const id = idProp ?? autoId;
    const inputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<UploadItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
        onChange?.(items);
        // onChange 是回调通知，不应作为依赖重复触发
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    const patch = (itemId: string, value: Partial<UploadItem>) => setItems((list) => list.map((entry) => (entry.id === itemId ? { ...entry, ...value } : entry)));

    const start = (item: UploadItem) => {
        upload(item.file, (percent) => patch(item.id, { progress: Math.min(99, percent) }))
            .then(() => patch(item.id, { status: "done", progress: 100 }))
            .catch((error: unknown) => patch(item.id, { status: "error", error: error instanceof Error ? error.message : "上传失败" }));
    };

    const addFiles = (files: File[]) => {
        const { accepted, rejected } = checkFiles(files, { accept, maxSize, maxFiles }, itemsRef.current.length);
        if (rejected.length) onReject?.(rejected.map((entry) => `${entry.file.name}：${entry.reason}`));
        const created = accepted.map<UploadItem>((file) => ({ id: `up-${++seq}`, file, status: "uploading", progress: 0, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
        if (!created.length) return;
        setItems((list) => [...list, ...created]);
        created.forEach(start);
    };

    // 卸载时释放预览图 URL
    useEffect(() => () => itemsRef.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), []);

    const addRef = useRef(addFiles);
    useEffect(() => {
        addRef.current = addFiles;
    });
    useEffect(() => {
        if (!pasteToUpload) return;
        const handlePaste = (event: ClipboardEvent) => {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.length) addRef.current(files);
        };
        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [pasteToUpload]);

    const remove = (target: UploadItem) => {
        if (target.preview) URL.revokeObjectURL(target.preview);
        setItems((list) => list.filter((entry) => entry.id !== target.id));
    };
    const retry = (target: UploadItem) => {
        const next = { ...target, status: "uploading" as const, progress: 0, error: undefined };
        setItems((list) => list.map((entry) => (entry.id === target.id ? next : entry)));
        start(next);
    };

    const full = maxFiles !== undefined && items.length >= maxFiles;
    const rules = [describeAccept(accept), maxSize ? `单个 ≤ ${formatBytes(maxSize)}` : null, maxFiles ? `最多 ${maxFiles} 个` : null].filter(Boolean).join(" · ");

    const dropProps = {
        onDragEnter: (event: DragEvent) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
        },
        onDragOver: (event: DragEvent) => event.preventDefault(),
        onDragLeave: () => {
            // 子元素之间移动也会触发 dragleave，用计数判断真正离开
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (event: DragEvent) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (!full) addFiles([...event.dataTransfer.files]);
        },
    };

    return (
        <div className="flex flex-col gap-3">
            <input
                ref={inputRef}
                id={id}
                type="file"
                multiple={maxFiles !== 1}
                accept={accept?.join(",")}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                    addFiles([...(event.target.files ?? [])]);
                    event.target.value = "";
                }}
            />
            <motion.button
                type="button"
                disabled={full}
                onClick={() => inputRef.current?.click()}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                animate={{ scale: dragging && !reduce ? 1.01 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                {...dropProps}
                className={cn(
                    "group relative flex w-full items-center overflow-hidden rounded-[var(--gm-radius-lg)] border border-dashed text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] disabled:cursor-not-allowed disabled:opacity-50",
                    variant === "area" ? "flex-col justify-center gap-3 px-6 py-8 text-center" : "gap-3 px-4 py-3",
                    dragging
                        ? "border-[var(--gm-accent)] bg-[var(--gm-accent-soft)]"
                        : invalid
                          ? "border-[var(--gm-danger)] bg-[var(--gm-wash)]"
                          : "border-[var(--gm-border-strong)] bg-[var(--gm-wash)] hover:border-[var(--gm-accent-ring)] hover:bg-[var(--gm-wash-strong)]",
                )}
            >
                {dragging ? <span aria-hidden className="gm-aurora pointer-events-none absolute inset-0 m-auto size-48 rounded-full bg-[var(--gm-blue)] opacity-25 blur-3xl" /> : null}
                <motion.span
                    animate={dragging && !reduce ? { y: [-2, -8, -2] } : { y: 0 }}
                    transition={dragging ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
                    className={cn(
                        "relative grid shrink-0 place-items-center rounded-2xl text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)] transition-colors",
                        variant === "area" ? "size-12 bg-[var(--gm-accent-soft)]" : "size-9 bg-[var(--gm-accent-soft)]",
                    )}
                >
                    <UploadCloud className={variant === "area" ? "size-6" : "size-4"} />
                </motion.span>
                <span className="relative flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-[var(--gm-text)]">{full ? "已达到数量上限" : dragging ? "松开即可上传" : title}</span>
                    <span className="text-xs text-[var(--gm-text-3)]">
                        {description ?? rules}
                        {pasteToUpload ? " · 也可以直接 Ctrl+V 粘贴截图" : ""}
                    </span>
                </span>
            </motion.button>

            {items.length ? (
                <ul className="flex flex-col gap-2" aria-label="已上传文件">
                    <AnimatePresence initial={false}>
                        {items.map((item) => {
                            const Icon = kindIcon(item.file);
                            return (
                                <motion.li
                                    key={item.id}
                                    layout={!reduce}
                                    initial={reduce ? false : { opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                    transition={{ duration: 0.22 }}
                                    className={cn(
                                        "flex items-center gap-3 overflow-hidden rounded-[12px] p-2 pr-3 ring-1",
                                        item.status === "error" ? "bg-[color-mix(in_srgb,var(--gm-danger)_8%,transparent)] ring-[color-mix(in_srgb,var(--gm-danger)_35%,transparent)]" : "bg-[var(--gm-surface)] ring-[var(--gm-border)]",
                                    )}
                                >
                                    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)]">
                                        {item.preview ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- 本地预览（blob URL）
                                            <img src={item.preview} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <Icon className="size-4" />
                                        )}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="flex items-center gap-2 text-[13px]">
                                            <span className="truncate">{item.file.name}</span>
                                            <span className="shrink-0 text-[11px] text-[var(--gm-text-3)]">{formatBytes(item.file.size)}</span>
                                        </span>
                                        {item.status === "error" ? (
                                            <span className="flex items-center gap-1 text-[11px] text-[var(--gm-danger)]">
                                                <AlertCircle className="size-3" />
                                                {item.error}
                                            </span>
                                        ) : (
                                            <span className="relative h-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                                                <motion.span
                                                    className={cn("absolute inset-y-0 left-0 rounded-full", item.status === "done" ? "bg-[var(--gm-success)]" : "bg-[image:var(--gm-gradient)]")}
                                                    animate={{ width: `${item.progress}%` }}
                                                    transition={{ duration: 0.2 }}
                                                />
                                            </span>
                                        )}
                                    </span>
                                    {item.status === "uploading" ? <span className="w-9 text-right font-mono text-[11px] text-[var(--gm-text-3)] tabular-nums">{Math.round(item.progress)}%</span> : null}
                                    {item.status === "done" ? <CheckCircle2 className="size-4 shrink-0 text-[var(--gm-success)]" aria-label="上传完成" /> : null}
                                    {item.status === "error" ? (
                                        <button
                                            type="button"
                                            onClick={() => retry(item)}
                                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-[var(--gm-danger)] ring-1 ring-current hover:bg-[color-mix(in_srgb,var(--gm-danger)_12%,transparent)]"
                                        >
                                            <RotateCcw className="size-3" /> 重传
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        aria-label={`移除 ${item.file.name}`}
                                        onClick={() => remove(item)}
                                        className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>
            ) : null}
        </div>
    );
}
