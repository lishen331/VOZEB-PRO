"use client";

import { ArrowUpRight, CheckCircle2, FileImage, LoaderCircle, Maximize2, Paperclip, RefreshCw, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AgentMediaPreview } from "@/components/agent/agent-media-preview";
import { browserReadableMediaUrl } from "@/lib/browser-media-url";
import type { CreateOverviewAsset, CreateOverviewMedia, CreateOverviewTask } from "@/lib/create-workbench-overview";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { cn } from "@/lib/utils";

import { useCreateWorkbenchOverview } from "../use-create-workbench-overview";
import { createConversationHref } from "../create-conversation-navigation";

const sectionTitleClass = "text-[15px] font-semibold text-[var(--gm-text)]";
const sectionHintClass = "mt-1 text-xs text-[var(--gm-text-3)]";
const panelClass = "rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)]";
const recentAssetVisibilityClasses = ["", "", "hidden sm:block", "hidden lg:block", "hidden xl:block", "hidden 2xl:block"];

export function CreateWorkbenchOverview({ onUseAsset }: { onUseAsset: (asset: CreateOverviewAsset) => Promise<void> }) {
    const { latestProject, runningTasks, recentAssets, loading, error, reload } = useCreateWorkbenchOverview();
    const [importingAssetId, setImportingAssetId] = useState("");

    const importAsset = async (asset: CreateOverviewAsset) => {
        setImportingAssetId(asset.id);
        try {
            await onUseAsset(asset);
        } finally {
            setImportingAssetId("");
        }
    };

    return (
        <div className="mt-3 w-full space-y-3 pb-3 sm:mt-12 sm:space-y-9 sm:pb-8">
            <section aria-labelledby="create-assets-heading">
                <div className="flex items-end justify-between gap-3 border-b border-[var(--gm-border)] pb-3">
                    <div>
                        <h2 id="create-assets-heading" className={sectionTitleClass}>
                            最近生成
                        </h2>
                        <p className={sectionHintClass}>点击图片或视频可直接放大查看</p>
                    </div>
                    <Link href="/assets" className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--gm-text-2)] transition hover:text-[var(--gm-text)]">
                        查看素材库 <ArrowUpRight className="size-3.5" />
                    </Link>
                </div>
                {loading ? <OverviewLoading label="正在读取最近生成..." /> : null}
                {!loading && error ? <OverviewError message={error} onRetry={reload} /> : null}
                {!loading && !error && recentAssets.length ? (
                    <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3 sm:gap-3 sm:pt-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {recentAssets.slice(0, recentAssetVisibilityClasses.length).map((asset, index) => (
                            <div key={asset.id} className={recentAssetVisibilityClasses[index]}>
                                <RecentAssetCard asset={asset} importing={importingAssetId === asset.id} onUse={() => void importAsset(asset)} />
                            </div>
                        ))}
                    </div>
                ) : null}
                {!loading && !error && !recentAssets.length ? <OverviewEmpty label="完成一次图片或视频生成后，结果会出现在这里" /> : null}
            </section>

            <section aria-labelledby="create-projects-heading">
                <div className="flex items-end justify-between gap-3 border-b border-[var(--gm-border)] pb-3">
                    <div>
                        <h2 id="create-projects-heading" className={sectionTitleClass}>
                            项目与任务
                        </h2>
                        <p className={sectionHintClass}>回到最近的项目，或查看仍在运行的任务</p>
                    </div>
                    <Link href="/canvas" className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--gm-text-2)] transition hover:text-[var(--gm-text)]">
                        全部项目 <ArrowUpRight className="size-3.5" />
                    </Link>
                </div>
                <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)] sm:mt-3 sm:gap-3">
                    <LatestProjectCard project={latestProject} loading={loading} error={error} onRetry={reload} />
                    <RunningTasksCard tasks={runningTasks} loading={loading} error={error} onRetry={reload} />
                </div>
            </section>

            {loading ? <span className="sr-only">正在加载工作台概览</span> : null}
        </div>
    );
}

function LatestProjectCard({ project, loading, error, onRetry }: { project?: ReturnType<typeof useCreateWorkbenchOverview>["latestProject"]; loading: boolean; error?: string; onRetry: () => void }) {
    if (loading)
        return (
            <div className={cn(panelClass, "h-32 p-2.5 sm:h-44 sm:p-4")}>
                <OverviewLoading label="正在读取画布项目..." compact />
            </div>
        );
    if (error)
        return (
            <div className={cn(panelClass, "h-32 p-2.5 sm:h-44 sm:p-4")}>
                <OverviewError message={error} onRetry={onRetry} compact />
            </div>
        );
    if (!project)
        return (
            <div className={cn(panelClass, "flex h-32 items-center p-2.5 sm:h-44 sm:p-4")}>
                <OverviewEmpty label="创建第一个 Canvas 项目后，会在这里继续" compact />
            </div>
        );

    return (
        <Link
            href={`/canvas/${project.id}`}
            className={cn(
                panelClass,
                "group grid h-32 grid-cols-[minmax(100px,34%)_minmax(0,1fr)] overflow-hidden transition hover:border-[var(--gm-border-strong)] hover:shadow-[0_8px_20px_rgba(32,36,42,0.08)] dark:hover:shadow-black/25 sm:h-44 sm:grid-cols-[minmax(150px,34%)_minmax(0,1fr)]",
            )}
        >
            <div className="relative h-full min-h-0 overflow-hidden bg-[var(--gm-wash-strong)]">
                <CanvasProjectCover previews={project.previews} />
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                    <Maximize2 className="size-3" /> Canvas 项目
                </span>
            </div>
            <div className="flex min-w-0 flex-col justify-between gap-1.5 p-2.5 sm:p-4">
                <div className="min-w-0">
                    <p className="text-[11px] text-[var(--gm-text-3)]">最近编辑 · {formatRecentTime(project.updatedAt)}</p>
                    <h3 className="mt-1.5 truncate text-sm font-semibold text-[var(--gm-text)] sm:text-base">{project.title || "未命名项目"}</h3>
                    <p className="mt-1.5 text-[11px] text-[var(--gm-text-2)] sm:text-xs">
                        {project.nodeCount} 个节点 · {project.connectionCount} 条连线
                    </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[var(--gm-surface-light)] px-2.5 py-1.5 text-xs font-semibold text-[var(--gm-inverse-text)] transition group-hover:opacity-85">
                    继续编辑 <ArrowUpRight className="size-3.5" />
                </span>
            </div>
        </Link>
    );
}

function CanvasProjectCover({ previews }: { previews: CreateOverviewMedia[] }) {
    const [previewIndex, setPreviewIndex] = useState(0);
    const previewKey = previews.map((item) => `${item.kind}:${item.url}`).join("|");
    const preview = previews[previewIndex];

    useEffect(() => setPreviewIndex(0), [previewKey]);

    if (!preview)
        return (
            <div className="grid size-full place-items-center text-[var(--gm-text-3)]">
                <Maximize2 className="size-8" />
            </div>
        );

    const mediaClass = "size-full object-cover transition duration-300 group-hover:scale-[1.02]";
    return preview.kind === "image" ? (
        <img src={imagePreviewUrl(preview.url, 960)} alt="" loading="lazy" className={mediaClass} onError={() => setPreviewIndex((index) => index + 1)} />
    ) : (
        <video src={browserReadableMediaUrl(preview.url)} muted preload="metadata" playsInline className={mediaClass} onError={() => setPreviewIndex((index) => index + 1)} />
    );
}

function RecentAssetCard({ asset, importing, onUse }: { asset: CreateOverviewAsset; importing: boolean; onUse: () => void }) {
    return (
        <div className="group min-w-0 overflow-hidden rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] transition hover:border-[var(--gm-border-strong)] hover:shadow-[0_8px_20px_rgba(32,36,42,0.08)] dark:hover:shadow-black/25">
            <div className="relative overflow-hidden bg-[var(--gm-wash-strong)]">
                <AgentMediaPreview type={asset.kind} url={browserReadableMediaUrl(asset.url)} title={asset.title} className="aspect-[4/3] max-h-52" />
                <span className="pointer-events-none absolute left-2 top-2 inline-flex size-7 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm" aria-hidden="true">
                    {asset.kind === "image" ? <FileImage className="size-3.5" /> : <Video className="size-3.5" />}
                </span>
            </div>
            <div className="min-w-0 px-2.5 py-2">
                <p className="truncate text-xs font-medium text-[var(--gm-text)]">{asset.title}</p>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[11px] text-[var(--gm-text-3)]">{formatRecentTime(asset.createdAt)}</p>
                    <button
                        type="button"
                        disabled={importing}
                        className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-[var(--gm-text-2)] transition hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] disabled:cursor-wait disabled:opacity-60"
                        onClick={onUse}
                        aria-label="引用到 Agent"
                        title="引用到 Agent"
                    >
                        {importing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RunningTasksCard({ tasks, loading, error, onRetry }: { tasks: CreateOverviewTask[]; loading: boolean; error?: string; onRetry: () => void }) {
    return (
        <div className={cn(panelClass, "flex h-32 min-h-0 flex-col p-3 sm:h-44 sm:p-4")}>
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--gm-text)]">运行任务</h3>
                {tasks.length ? <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--gm-accent-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--gm-accent)]">{tasks.length}</span> : null}
            </div>
            {loading ? <OverviewLoading label="正在读取运行任务..." compact /> : null}
            {!loading && error ? <OverviewError message={error} onRetry={onRetry} compact /> : null}
            {!loading && !error && tasks.length ? (
                <div className="hide-scrollbar mt-2 min-h-0 flex-1 divide-y divide-[var(--gm-border)] overflow-y-auto">
                    {tasks.map((task) => (
                        <TaskRow key={task.id} task={task} />
                    ))}
                </div>
            ) : null}
            {!loading && !error && !tasks.length ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 text-center text-xs text-[var(--gm-text-3)]">
                    <CheckCircle2 className="size-6 text-[var(--gm-text-3)]" />
                    <span>当前没有运行中的任务</span>
                </div>
            ) : null}
        </div>
    );
}

function TaskRow({ task }: { task: CreateOverviewTask }) {
    const isImage = task.kind === "image";
    const href = task.conversationId ? createConversationHref(task.conversationId) : task.source === "canvas" ? "/canvas" : "/create";
    const Icon = task.kind === "agent" ? Sparkles : isImage ? FileImage : Video;
    const status = task.status === "paused" ? "已暂停" : task.status === "planning" ? "规划中" : "运行中";
    return (
        <Link href={href} className="group flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)]">
                <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-[var(--gm-text)]">{task.title || (isImage ? "图片生成" : "视频生成")}</span>
                <span className="mt-1 block truncate text-[11px] text-[var(--gm-text-3)]">
                    {formatRecentTime(task.createdAt)} · {status}
                </span>
            </span>
            <LoaderCircle className="size-4 shrink-0 animate-spin text-[var(--gm-accent)]" />
        </Link>
    );
}

function OverviewLoading({ label, compact = false }: { label: string; compact?: boolean }) {
    return (
        <div className={cn("flex items-center justify-center gap-2 text-xs text-[var(--gm-text-3)]", compact ? "min-h-20 sm:min-h-32" : "min-h-20 pt-2 sm:min-h-36 sm:pt-3")}>
            <LoaderCircle className="size-4 animate-spin" />
            {label}
        </div>
    );
}

function OverviewEmpty({ label, compact = false }: { label: string; compact?: boolean }) {
    return <div className={cn("flex items-center justify-center text-center text-xs text-[var(--gm-text-3)]", compact ? "min-h-20 sm:min-h-36" : "min-h-20 pt-2 sm:min-h-32 sm:pt-3")}>{label}</div>;
}

function OverviewError({ message, onRetry, compact = false }: { message: string; onRetry: () => void; compact?: boolean }) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-2 text-center", compact ? "min-h-20 sm:min-h-32" : "min-h-20 pt-2 sm:min-h-36 sm:pt-3")}>
            <p className="max-w-md text-xs text-[var(--gm-danger)]">{message}</p>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--gm-text-2)] transition hover:text-[var(--gm-text)]">
                <RefreshCw className="size-3.5" />
                重新读取
            </button>
        </div>
    );
}

function formatRecentTime(value: string) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return "刚刚";
    return new Date(time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
