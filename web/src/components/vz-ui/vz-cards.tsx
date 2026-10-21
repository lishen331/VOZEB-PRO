import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Download, Heart, Play, RotateCcw, Sparkles } from "lucide-react";

import { VzIconButton } from "@/components/vz-ui/vz-button";
import { cn } from "@/lib/utils";

/** 作品卡片：广场 / 作品列表。悬停放大封面、浮出"做同款"。 */
export function VzWorkCard({
    cover,
    title,
    author,
    likes,
    kind = "image",
    tall = false,
    liked = false,
    onOpen,
    onLike,
    onRemix,
}: {
    cover: string;
    title: string;
    author: string;
    likes: number;
    kind?: "image" | "video";
    tall?: boolean;
    liked?: boolean;
    onOpen?: () => void;
    onLike?: () => void;
    onRemix?: () => void;
}) {
    return (
        <article className="group relative overflow-hidden rounded-[var(--vz-radius-lg)] bg-[var(--vz-surface)] ring-1 ring-[var(--vz-border)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.5)] hover:ring-[rgba(139,92,246,0.45)]">
            <button type="button" onClick={onOpen} aria-label={`预览 ${title}`} className="block w-full cursor-zoom-in focus-visible:outline-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- 预览页静态素材 */}
                <img src={cover} alt={title} loading="lazy" className={cn("w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]", tall ? "aspect-[3/4]" : "aspect-[4/3]")} />
            </button>
            {kind === "video" ? (
                <span className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                    <Play className="size-3 fill-current" />
                    00:05
                </span>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-white">{title}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65">
                        <span className="size-4 rounded-full bg-[image:var(--vz-gradient)]" aria-hidden />
                        {author}
                    </p>
                </div>
                <button
                    type="button"
                    aria-pressed={liked}
                    aria-label={liked ? "取消点赞" : "点赞"}
                    onClick={onLike}
                    className={cn("pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors hover:bg-white/10", liked ? "text-[#fb7185]" : "text-white/80")}
                >
                    <Heart className={cn("size-3.5 transition-transform", liked && "scale-110 fill-current")} />
                    {likes + (liked ? 1 : 0)}
                </button>
            </div>
            <button
                type="button"
                onClick={onRemix}
                className="absolute top-3 right-3 inline-flex h-7 translate-y-1 items-center gap-1 rounded-full bg-white/90 px-2.5 text-xs font-medium text-[#14141f] opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
            >
                做同款
                <ArrowUpRight className="size-3.5" />
            </button>
        </article>
    );
}

const FEATURE_GLOW = { violet: "from-[#a855f7]/40", cyan: "from-[#22d3ee]/35", pink: "from-[#f472b6]/40" } as const;

/** 功能入口卡：首页"开始创作"区块，大卡 + 渐变光晕 + 右侧封面 */
export function VzFeatureCard({ title, description, icon, cover, accent = "violet", badge, onClick }: { title: string; description: string; icon: ReactNode; cover: string; accent?: keyof typeof FEATURE_GLOW; badge?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative isolate flex h-[168px] flex-col justify-between overflow-hidden rounded-[var(--vz-radius-lg)] bg-[var(--vz-surface)] p-5 text-left ring-1 ring-[var(--vz-border)] transition-shadow duration-300 hover:ring-[var(--vz-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vz-brand-3)]"
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- 预览页静态素材 */}
            <img
                src={cover}
                alt=""
                aria-hidden
                className="absolute top-0 right-0 -z-10 h-full w-3/5 object-cover opacity-55 transition-[opacity,transform] duration-500 [mask-image:linear-gradient(90deg,transparent,#000_60%)] group-hover:scale-105 group-hover:opacity-80"
            />
            <div className={cn("absolute -top-16 -left-10 -z-10 size-48 rounded-full bg-gradient-to-br to-transparent blur-2xl", FEATURE_GLOW[accent])} />
            <div className="flex items-center gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/10 backdrop-blur [&_svg]:size-5">{icon}</span>
                {badge ? <span className="rounded-full bg-[image:var(--vz-gradient-hot)] px-2 py-0.5 text-[10px] font-semibold text-white">{badge}</span> : null}
            </div>
            <div>
                <h3 className="flex items-center gap-1 text-lg font-semibold text-white">
                    {title}
                    <ArrowUpRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </h3>
                <p className="mt-1 max-w-[60%] text-[13px] leading-relaxed text-[var(--vz-text-2)]">{description}</p>
            </div>
        </button>
    );
}

type TaskStatus = "running" | "done" | "failed";

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string; text: string }> = {
    running: { label: "生成中", dot: "bg-[var(--vz-brand-3)] animate-pulse", text: "text-[#a5f3fc]" },
    done: { label: "已完成", dot: "bg-[var(--vz-success)]", text: "text-[#a7f3d0]" },
    failed: { label: "失败", dot: "bg-[var(--vz-danger)]", text: "text-[#fecdd3]" },
};

/** 生成任务卡：进行中（流光 + 进度）、完成、失败（含退款提示） */
export type { TaskStatus as VzTaskStatus };

export function VzTaskCard({
    status,
    prompt,
    cover,
    progress = 0,
    etaSeconds,
    meta,
    onOpen,
    onDownload,
    onRetry,
}: {
    status: TaskStatus;
    prompt: string;
    cover?: string;
    progress?: number;
    etaSeconds?: number;
    meta?: string;
    onOpen?: () => void;
    onDownload?: () => void;
    onRetry?: () => void;
}) {
    const badge = STATUS_CONFIG[status];
    return (
        <div className="animate-in overflow-hidden rounded-[var(--vz-radius-lg)] bg-[var(--vz-surface)] ring-1 ring-[var(--vz-border)] fade-in zoom-in-95">
            <div className="relative aspect-video bg-[var(--vz-surface-2)]">
                {status === "done" && cover ? (
                    <button type="button" onClick={onOpen} aria-label={`预览 ${prompt}`} className="group block size-full cursor-zoom-in overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 预览页静态素材 */}
                        <img src={cover} alt={prompt} className="size-full animate-in object-cover transition-transform duration-500 fade-in group-hover:scale-[1.04]" />
                    </button>
                ) : null}
                {status === "running" ? (
                    <div className="vz-shimmer absolute inset-0 grid place-items-center">
                        <div className="flex flex-col items-center gap-2.5">
                            <Sparkles className="size-6 animate-pulse text-[#c4b5fd]" />
                            <span className="text-xs tabular-nums text-[var(--vz-text-2)]">
                                正在生成 · {progress}%{etaSeconds !== undefined ? ` · 约 ${etaSeconds} 秒` : ""}
                            </span>
                        </div>
                    </div>
                ) : null}
                {status === "failed" ? (
                    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(251,113,133,0.12),transparent_70%)]">
                        <div className="flex flex-col items-center gap-1.5 text-center">
                            <AlertTriangle className="size-6 text-[var(--vz-danger)]" />
                            <span className="text-[13px] text-[var(--vz-text)]">生成失败</span>
                            <span className="text-xs text-[var(--vz-text-3)]">积分已自动退回</span>
                        </div>
                    </div>
                ) : null}
                <span className={cn("absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] backdrop-blur", badge.text)}>
                    <span className={cn("size-1.5 rounded-full", badge.dot)} />
                    {badge.label}
                </span>
            </div>
            {status === "running" ? (
                <div className="h-0.5 bg-[var(--vz-surface-3)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="生成进度">
                    <div className="vz-flow h-full bg-[linear-gradient(90deg,#a855f7,#22d3ee,#a855f7)]" style={{ width: `${progress}%` }} />
                </div>
            ) : null}
            <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] text-[var(--vz-text-2)]">{prompt}</p>
                    {meta ? <p className="mt-0.5 text-[11px] text-[var(--vz-text-3)]">{meta}</p> : null}
                </div>
                {status === "done" ? (
                    <VzIconButton label="下载" size="sm" onClick={onDownload}>
                        <Download />
                    </VzIconButton>
                ) : null}
                {status === "failed" ? (
                    <VzIconButton label="重新生成" size="sm" onClick={onRetry}>
                        <RotateCcw />
                    </VzIconButton>
                ) : null}
            </div>
        </div>
    );
}

/** 数据统计卡 */
export function VzStatCard({ label, value, delta, icon }: { label: string; value: string; delta?: string; icon: ReactNode }) {
    return (
        <div className="rounded-[var(--vz-radius-lg)] bg-[var(--vz-surface)] p-4 ring-1 ring-[var(--vz-border)]">
            <div className="flex items-center justify-between text-[13px] text-[var(--vz-text-2)]">
                {label}
                <span className="grid size-8 place-items-center rounded-lg bg-[var(--vz-brand-soft)] text-[#c4b5fd] [&_svg]:size-4">{icon}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
            {delta ? <div className="mt-1 text-xs text-[var(--vz-success)]">{delta}</div> : null}
        </div>
    );
}
