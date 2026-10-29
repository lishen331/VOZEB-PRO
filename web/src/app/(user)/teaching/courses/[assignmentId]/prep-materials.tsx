"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Download, FileArchive, FileSpreadsheet, FileText, Film, ImageIcon, Presentation, X } from "lucide-react";

import type { CourseMaterial } from "@/lib/school-domain";
import { cn } from "@/lib/utils";

/*
 * 课时资料的展示：大图预览（图片 / 视频直接看，文档给下载卡）、缩略条、全屏放映。
 * 版式对应预览页 /bluegamma/courses 的 SlideViewer / CoursePresent，数据换成真实课程资料。
 */

export const MATERIAL_ACCEPT = ".docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.zip";

export function materialKind(material: Pick<CourseMaterial, "mimeType">) {
    if (material.mimeType.startsWith("image/")) return "image" as const;
    if (material.mimeType.startsWith("video/")) return "video" as const;
    return "file" as const;
}

export function MaterialIcon({ mimeType, className }: { mimeType: string; className?: string }) {
    const Icon = mimeType.startsWith("image/")
        ? ImageIcon
        : mimeType.startsWith("video/")
          ? Film
          : mimeType.includes("presentation")
            ? Presentation
            : mimeType.includes("spreadsheet")
              ? FileSpreadsheet
              : mimeType === "application/zip"
                ? FileArchive
                : FileText;
    return <Icon className={className} />;
}

export function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const materialDownloadHref = (material: CourseMaterial) => `${material.url}?download=original`;

/** 单份资料的大预览：图片 / 视频直接展示，其他文件显示下载卡 */
export function MaterialStage({ material }: { material: CourseMaterial }) {
    const kind = materialKind(material);
    if (kind === "image") {
        // eslint-disable-next-line @next/next/no-img-element -- 课程资料走鉴权地址，尺寸未知
        return <img src={material.url} alt={material.title} className="mx-auto block h-full max-h-full max-w-full object-contain" />;
    }
    if (kind === "video") return <video key={material.id} src={material.url} controls preload="metadata" className="mx-auto block h-full max-h-full max-w-full" />;
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]">
                <MaterialIcon mimeType={material.mimeType} className="size-7" />
            </span>
            <p className="max-w-md truncate text-sm font-medium">{material.title}</p>
            <p className="text-xs text-[var(--gm-text-3)]">
                {material.fileName} · {formatBytes(material.bytes)}
            </p>
            <a href={materialDownloadHref(material)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[image:var(--gm-gradient)] px-4 text-xs font-medium text-white shadow-[var(--gm-glow-blue)] hover:brightness-110">
                <Download className="size-3.5" />
                下载查看
            </a>
        </div>
    );
}
/** 中栏：当前资料大预览 + 左右翻 + 缩略条（←/→ 翻页） */
export function MaterialViewer({ materials, index, onIndex, onPresent }: { materials: readonly CourseMaterial[]; index: number; onIndex: (index: number) => void; onPresent: () => void }) {
    const current = materials[index];
    const total = materials.length;
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement).closest("input,textarea,video,[role=dialog]")) return;
            if (event.key === "ArrowRight") onIndex(Math.min(total - 1, index + 1));
            if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [index, onIndex, total]);
    if (!current) return null;
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="group relative aspect-video overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-bg-elevated)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]">
                <MaterialStage material={current} />
                {[
                    { side: "left-3", icon: ChevronLeft, label: "上一份资料", to: index - 1 },
                    { side: "right-3", icon: ChevronRight, label: "下一份资料", to: index + 1 },
                ].map((item) =>
                    item.to >= 0 && item.to < total ? (
                        <button
                            key={item.label}
                            type="button"
                            aria-label={item.label}
                            onClick={() => onIndex(item.to)}
                            className={cn("gm-glass absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100", item.side)}
                        >
                            <item.icon className="size-5" />
                        </button>
                    ) : null,
                )}
                <button
                    type="button"
                    onClick={onPresent}
                    className="gm-glass absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <Presentation className="size-3.5" />
                    放映
                </button>
            </div>
            {total > 1 ? (
                <ol className="gm-scroll flex gap-2 overflow-x-auto pb-1" aria-label="本课时资料">
                    {materials.map((material, itemIndex) => (
                        <li key={material.id} className="w-[132px] shrink-0">
                            <button
                                type="button"
                                onClick={() => onIndex(itemIndex)}
                                aria-label={`第 ${itemIndex + 1} 份：${material.title}`}
                                aria-current={itemIndex === index ? "true" : undefined}
                                className={cn(
                                    "flex aspect-video w-full items-center justify-center overflow-hidden rounded-[10px] bg-[var(--gm-wash)] ring-2 transition-[box-shadow,opacity]",
                                    itemIndex === index ? "ring-[var(--gm-accent)]" : "opacity-70 ring-transparent hover:opacity-100",
                                )}
                            >
                                {materialKind(material) === "image" ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- 缩略图
                                    <img src={material.url} alt="" className="size-full object-cover" />
                                ) : (
                                    <MaterialIcon mimeType={material.mimeType} className="size-6 text-[var(--gm-text-3)]" />
                                )}
                            </button>
                        </li>
                    ))}
                </ol>
            ) : null}
        </div>
    );
}

/** 放映：全屏黑底，←/→ 翻页，Esc 退出；底部显示资料名与课时 */
export function MaterialPresent({ materials, index, caption, onIndex, onClose }: { materials: readonly CourseMaterial[]; index: number; caption: string; onIndex: (index: number) => void; onClose: () => void }) {
    const total = materials.length;
    const current = materials[index];
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowRight") onIndex(Math.min(total - 1, index + 1));
            if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [index, onClose, onIndex, total]);
    if (!current) return null;
    return createPortal(
        <motion.div role="dialog" aria-modal aria-label="资料放映" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="gm fixed inset-0 z-[1200] flex flex-col bg-black text-white">
            <div className="flex min-h-0 flex-1 items-center justify-center px-16 py-8">
                <div className="h-full w-full">
                    <MaterialStage material={current} />
                </div>
            </div>
            <div className="flex items-center gap-4 border-t border-white/10 px-6 py-3 text-sm">
                <span className="font-mono text-white/50">
                    {index + 1} / {total}
                </span>
                <p className="min-w-0 flex-1 truncate text-white/70">
                    {caption} · {current.title}
                </p>
                <button type="button" aria-label="上一份" disabled={index === 0} onClick={() => onIndex(index - 1)} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                    <ChevronLeft className="size-4" />
                </button>
                <button type="button" aria-label="下一份" disabled={index === total - 1} onClick={() => onIndex(index + 1)} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                    <ChevronRight className="size-4" />
                </button>
                <button type="button" aria-label="退出放映" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 hover:bg-white/20">
                    <X className="size-4" />
                    Esc
                </button>
            </div>
        </motion.div>,
        document.body,
    );
}
