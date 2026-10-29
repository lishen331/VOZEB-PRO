"use client";

import type { PointerEvent, ReactNode } from "react";
import { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { AlertTriangle, ArrowUpRight, Download, Heart, Play, RotateCcw, Zap } from "lucide-react";

import { GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaCountUp, GammaProgressRing } from "@/components/gamma-ui/gamma-motion";
import { SUBJECT_ACCENT, type GammaSubject } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * 卡片边角细节：顶部一条渐隐发丝线 + 左上/右下两个 L 形角标。
 * 默认很淡，hover 时亮起，给卡片"边边角角"一点工艺感。
 */
export function GammaCardCorners({ className }: { className?: string }) {
    return (
        <span aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]", className)}>
            <span className="absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--gm-glass-edge),transparent)] opacity-40 transition-opacity duration-300 group-hover:opacity-90" />
            <span className="absolute top-0 left-0 size-5 rounded-tl-[inherit] border-t border-l border-[var(--gm-accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-50" />
            <span className="absolute right-0 bottom-0 size-5 rounded-br-[inherit] border-r border-b border-[var(--gm-accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-50" />
        </span>
    );
}

/** 专业入口卡（对标可灵首页工具条）：鼠标位置驱动的聚光 + 轻微 3D 倾斜，箭头 hover 前移 */
export function GammaSubjectCard({ subject, compact = false, onClick }: { subject: GammaSubject; compact?: boolean; onClick?: () => void }) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLButtonElement>(null);
    const mx = useMotionValue(50);
    const my = useMotionValue(50);
    const rotateX = useSpring(0, { stiffness: 200, damping: 18 });
    const rotateY = useSpring(0, { stiffness: 200, damping: 18 });
    const accent = SUBJECT_ACCENT[subject.accent];
    const spotlight = useMotionTemplate`radial-gradient(260px circle at ${mx}% ${my}%, ${accent.glow}, transparent 70%)`;
    const Icon = subject.icon;

    const handleMove = (event: PointerEvent<HTMLButtonElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ((event.clientX - rect.left) / rect.width) * 100;
        const py = ((event.clientY - rect.top) / rect.height) * 100;
        mx.set(px);
        my.set(py);
        if (!reduce) {
            rotateY.set((px - 50) / 14);
            rotateX.set(-(py - 50) / 14);
        }
    };
    const handleLeave = () => {
        rotateX.set(0);
        rotateY.set(0);
    };

    return (
        <motion.button
            ref={ref}
            type="button"
            onClick={onClick}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
            style={{ rotateX, rotateY, transformPerspective: 800 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className={cn(
                "group relative isolate flex w-full overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] text-left ring-1 ring-[var(--gm-border)] transition-shadow duration-300 hover:shadow-[0_18px_40px_rgba(0,0,0,0.5)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                compact ? "h-[100px] items-center gap-3 px-4" : "h-[168px] flex-col justify-end p-5",
            )}
        >
            <motion.span aria-hidden className="pointer-events-none absolute inset-0 -z-[1] opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: spotlight }} />
            <GammaCardCorners />
            {!compact ? (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意封面 */}
                    <img
                        src={subject.cover}
                        alt=""
                        aria-hidden
                        className="absolute inset-y-0 right-0 -z-[2] h-full w-3/5 object-cover opacity-45 transition-[opacity,transform] duration-500 [mask-image:linear-gradient(90deg,transparent,#000_70%)] group-hover:scale-105 group-hover:opacity-70"
                    />
                    <span aria-hidden className="absolute inset-0 -z-[1] bg-gradient-to-r from-[var(--gm-surface)] via-[var(--gm-surface)]/80 to-transparent" />
                </>
            ) : null}
            <span
                className={cn(
                    "grid shrink-0 place-items-center rounded-xl ring-1 ring-[var(--gm-border-strong)] transition-transform duration-300 group-hover:scale-110",
                    accent.chip,
                    accent.text,
                    compact ? "size-10 [&_svg]:size-5" : "mb-auto size-11 [&_svg]:size-[22px]",
                )}
            >
                <Icon />
            </span>
            <span className={cn("min-w-0", compact ? "flex-1" : "mt-3")}>
                <span className="flex items-center gap-2">
                    <span className={cn("font-semibold whitespace-nowrap text-[var(--gm-text)]", subject.name.length > 3 ? "text-[13px]" : "text-[15px]")}>{subject.name}</span>
                    {subject.badge ? (
                        <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide uppercase", subject.badge === "hot" ? "bg-[var(--gm-cyan)] text-[var(--gm-text-on-cyan)]" : "bg-[var(--gm-blue)] text-white")}>
                            {subject.badge}
                        </span>
                    ) : null}
                </span>
                <span className={cn("mt-1 block text-xs leading-relaxed text-[var(--gm-text-2)]", compact ? "line-clamp-1" : "line-clamp-2 max-w-[70%]")}>{subject.tagline}</span>
            </span>
            <ArrowUpRight
                className={cn("size-4 shrink-0 text-[var(--gm-text-3)] transition-[transform,color] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--gm-accent)]", !compact && "absolute top-5 right-5")}
            />
        </motion.button>
    );
}

export interface GammaWorkCardProps {
    cover: string;
    title: string;
    author: string;
    subject: string;
    likes: number;
    kind?: "image" | "video";
    tall?: boolean;
    liked?: boolean;
    onOpen?: () => void;
    onLike?: () => void;
    onRemix?: () => void;
}

/** 作品卡：瀑布流用，hover 封面放大并浮出"做同款" */
export function GammaWorkCard({ cover, title, author, subject, likes, kind = "image", tall = false, liked = false, onOpen, onLike, onRemix }: GammaWorkCardProps) {
    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)] transition-shadow duration-300 hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)] hover:ring-[rgba(40,235,250,0.35)]"
        >
            <button type="button" onClick={onOpen} aria-label={`预览 ${title}`} className="block w-full cursor-zoom-in focus-visible:outline-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                <img src={cover} alt={title} loading="lazy" className={cn("w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]", tall ? "aspect-[3/4]" : "aspect-[4/3]")} />
            </button>
            <span className="pointer-events-none absolute top-3 left-3 flex gap-1.5">
                <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur">{subject}</span>
                {kind === "video" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                        <Play className="size-3 fill-current" />
                        00:08
                    </span>
                ) : null}
            </span>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-white">{title}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65">
                        <span className="size-4 rounded-full bg-[image:var(--gm-gradient)]" aria-hidden />
                        {author}
                    </p>
                </div>
                <motion.button
                    type="button"
                    aria-pressed={liked}
                    aria-label={liked ? "取消点赞" : "点赞"}
                    onClick={onLike}
                    whileTap={{ scale: 1.3 }}
                    className={cn("pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--gm-wash-strong)]", liked ? "text-[#ff6b8a]" : "text-white/80")}
                >
                    <Heart className={cn("size-3.5", liked && "fill-current")} />
                    {likes + (liked ? 1 : 0)}
                </motion.button>
            </div>
            <button
                type="button"
                onClick={onRemix}
                className="absolute top-3 right-3 inline-flex -translate-y-1.5 items-center gap-1 rounded-full bg-[var(--gm-cyan)] px-3 py-1 text-xs font-semibold text-[var(--gm-text-on-cyan)] opacity-0 shadow-[var(--gm-glow-cyan)] transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-none"
            >
                做同款
                <ArrowUpRight className="size-3" />
            </button>
        </motion.article>
    );
}

export type GammaTaskStatus = "running" | "done" | "failed";

const STATUS: Record<GammaTaskStatus, { label: string; dot: string; text: string }> = {
    running: { label: "生成中", dot: "bg-[var(--gm-cyan)] animate-pulse", text: "text-[#a5f6fd]" },
    done: { label: "已完成", dot: "bg-[var(--gm-success)]", text: "text-[#a7f3d0]" },
    failed: { label: "失败", dot: "bg-[var(--gm-danger)]", text: "text-[#fecdd3]" },
};

export interface GammaTaskCardProps {
    status: GammaTaskStatus;
    title: string;
    meta?: string;
    cover?: string;
    progress?: number;
    etaSeconds?: number;
    onOpen?: () => void;
    onDownload?: () => void;
    onRetry?: () => void;
}

/** 生成任务卡：生成中流光 + 进度、完成可预览下载、失败显示退款并可重试 */
export function GammaTaskCard({ status, title, meta, cover, progress = 0, etaSeconds, onOpen, onDownload, onRetry }: GammaTaskCardProps) {
    const badge = STATUS[status];
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]"
        >
            <div className="relative aspect-video bg-[var(--gm-surface-2)]">
                {status === "done" && cover ? (
                    <button type="button" onClick={onOpen} aria-label={`预览 ${title}`} className="group block size-full cursor-zoom-in overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                        <img src={cover} alt={title} className="size-full animate-in object-cover transition-transform duration-500 fade-in group-hover:scale-[1.04]" />
                    </button>
                ) : null}
                {status === "running" ? (
                    <div className="gm-shimmer absolute inset-0 grid place-items-center">
                        <div className="flex flex-col items-center gap-2">
                            <GammaProgressRing value={progress}>{Math.round(progress)}%</GammaProgressRing>
                            <span className="text-xs tabular-nums text-[var(--gm-text-2)]">正在生成{etaSeconds !== undefined ? ` · 约 ${etaSeconds} 秒` : ""}</span>
                        </div>
                    </div>
                ) : null}
                {status === "failed" ? (
                    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(255,77,109,0.14),transparent_70%)]">
                        <div className="flex flex-col items-center gap-1.5 text-center">
                            <AlertTriangle className="size-6 text-[var(--gm-danger)]" />
                            <span className="text-[13px] text-[var(--gm-text)]">生成失败</span>
                            <span className="text-xs text-[var(--gm-text-3)]">积分已自动退回</span>
                        </div>
                    </div>
                ) : null}
                <span className={cn("absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-[rgba(4,6,12,0.6)] px-2 py-0.5 text-[11px] backdrop-blur", badge.text)}>
                    <span className={cn("size-1.5 rounded-full", badge.dot)} />
                    {badge.label}
                </span>
            </div>
            {status === "running" ? (
                <div className="h-0.5 bg-[var(--gm-surface-3)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="生成进度">
                    <div className="gm-flow h-full transition-[width] duration-300" style={{ width: `${progress}%` }} />
                </div>
            ) : null}
            <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] text-[var(--gm-text)]">{title}</p>
                    {meta ? <p className="mt-0.5 truncate text-[11px] text-[var(--gm-text-3)]">{meta}</p> : null}
                </div>
                {status === "done" ? (
                    <GammaIconButton label="下载" size="sm" onClick={onDownload}>
                        <Download />
                    </GammaIconButton>
                ) : null}
                {status === "failed" ? (
                    <GammaIconButton label="重新生成" size="sm" onClick={onRetry}>
                        <RotateCcw />
                    </GammaIconButton>
                ) : null}
            </div>
        </motion.div>
    );
}

export function GammaStatCard({ label, value, delta, icon }: { label: string; value: string | number; delta?: string; icon: ReactNode }) {
    return (
        <div className="rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
            <div className="flex items-center justify-between text-[13px] text-[var(--gm-text-2)]">
                {label}
                <span className="grid size-8 place-items-center rounded-lg bg-[var(--gm-blue-soft)] text-[var(--gm-blue-text)] [&_svg]:size-4">{icon}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{typeof value === "number" ? <GammaCountUp value={value} /> : value}</div>
            {delta ? <div className="mt-1 text-xs text-[var(--gm-success)]">{delta}</div> : null}
        </div>
    );
}

export function GammaPointsPill({ points }: { points: number }) {
    return (
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--gm-wash)] px-3 text-[13px] ring-1 ring-[var(--gm-border)]">
            <Zap className="size-3.5 fill-[var(--gm-cyan)] text-[var(--gm-accent)]" />
            <GammaCountUp value={points} />
        </span>
    );
}
