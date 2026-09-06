"use client";

import { Alert, Button, Progress, Tag, message } from "antd";
import { CheckCircle2, ChevronUp, CircleAlert, LoaderCircle, PauseCircle, RefreshCw, Square, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { DramaLabTaskView } from "@/lib/server/drama-lab-task-service";

export type DramaLabTaskPanelProps = {
    projectId: string;
    episodes?: Array<{ id: string; title?: string; number?: number }>;
    initialTasks?: DramaLabTaskView[];
    className?: string;
    compact?: boolean;
};

/** A persistent project-scoped view over server-owned generation_tasks. */
export function DramaLabTaskPanel({ projectId, episodes = [], initialTasks = [], className, compact = false }: DramaLabTaskPanelProps) {
    const [tasks, setTasks] = useState<DramaLabTaskView[]>(() => initialTasks);
    const [collapsed, setCollapsed] = useState(compact);
    const [loading, setLoading] = useState(initialTasks.length === 0);
    const [refreshing, setRefreshing] = useState(false);
    const [cancellingId, setCancellingId] = useState<string>();
    const [recheckingId, setRecheckingId] = useState<string>();
    const [retryingId, setRetryingId] = useState<string>();
    const [error, setError] = useState<string>();
    const [messageApi, contextHolder] = message.useMessage();

    const activeCount = useMemo(() => tasks.filter(isTaskActive).length, [tasks]);

    const load = useCallback(
        async (silent = false) => {
            if (silent) setRefreshing(true);
            else setLoading(true);
            try {
                const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/tasks?status=all`, { cache: "no-store" });
                const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { tasks?: DramaLabTaskView[] } };
                if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "Task status could not be loaded");
                setTasks(Array.isArray(payload.data?.tasks) ? payload.data.tasks : []);
                setError(undefined);
            } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Task status could not be loaded");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [projectId],
    );

    useEffect(() => {
        void load(initialTasks.length > 0);
    }, [load, initialTasks.length]);

    useEffect(() => {
        setCollapsed(compact);
    }, [compact]);

    // Keep discovering tasks created by another panel/action. The previous
    // activeCount-gated poll never noticed the first task until a refresh.
    useEffect(() => {
        const timer = window.setInterval(() => void load(true), 2_000);
        return () => window.clearInterval(timer);
    }, [load]);

    const cancel = async (task: DramaLabTaskView) => {
        if (!task.canCancel || cancellingId) return;
        setCancellingId(task.id);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/cancel`, { method: "POST", cache: "no-store" });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: DramaLabTaskView };
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "Task cancellation failed");
            setTasks((current) => current.filter((item) => item.id !== task.id && item.id !== payload.data?.id));
            messageApi.success({ content: "Cancellation request recorded", key: `drama-task-cancel-${task.id}`, duration: 2 });
        } catch (reason) {
            messageApi.error({ content: reason instanceof Error ? reason.message : "Task cancellation failed", key: `drama-task-cancel-${task.id}`, duration: 3 });
        } finally {
            setCancellingId(undefined);
        }
    };

    const recheck = async (task: DramaLabTaskView) => {
        if (!task.canRecheck || recheckingId) return;
        setRecheckingId(task.id);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/recheck`, { method: "POST", cache: "no-store" });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: DramaLabTaskView };
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "重新检查失败");
            if (payload.data) setTasks((current) => current.map((item) => (item.id === task.id ? payload.data! : item)));
            messageApi.success({ content: "已重新检查任务", key: `drama-task-recheck-${task.id}`, duration: 2 });
        } catch (reason) {
            messageApi.error({ content: reason instanceof Error ? reason.message : "重新检查失败", key: `drama-task-recheck-${task.id}`, duration: 3 });
        } finally {
            setRecheckingId(undefined);
        }
    };

    const retry = async (task: DramaLabTaskView) => {
        if (!task.canRetry || retryingId) return;
        setRetryingId(task.id);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/retry`, { method: "POST", cache: "no-store" });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: DramaLabTaskView };
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "重试失败");
            if (payload.data) setTasks((current) => current.map((item) => (item.id === task.id ? payload.data! : item)));
            messageApi.success({ content: "已重新启动工作流", key: `drama-task-retry-${task.id}`, duration: 2 });
        } catch (reason) {
            messageApi.error({ content: reason instanceof Error ? reason.message : "重试失败", key: `drama-task-retry-${task.id}`, duration: 3 });
        } finally {
            setRetryingId(undefined);
        }
    };

    const activeTasks = tasks.filter(isTaskActive);
    const reviewTasks = tasks.filter((task) => isTaskNeedsReview(task));
    const historyTasks = tasks.filter((task) => !isTaskActive(task) && !isTaskNeedsReview(task));

    return (
        <section className={cn("border-b border-border bg-card", className)} data-testid="drama-lab-task-panel">
            {contextHolder}
            {collapsed ? (
                <div className="flex items-center justify-center px-1 py-2">
                    <button
                        type="button"
                        className="relative grid size-8 place-items-center rounded hover:bg-muted"
                        onClick={() => (compact ? undefined : setCollapsed(false))}
                        aria-label="展开任务状态"
                        aria-expanded={false}
                        aria-controls="drama-lab-task-panel-content"
                        disabled={compact}
                    >
                        <LoaderCircle className={cn("size-3.5", activeCount > 0 && "animate-spin text-primary")} />
                        {activeCount > 0 ? <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">{activeCount > 99 ? "99+" : activeCount}</span> : null}
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-2 py-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCollapsed(true)} aria-expanded aria-controls="drama-lab-task-panel-content">
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                            <LoaderCircle className={cn("size-3.5", activeCount > 0 && "animate-spin text-primary")} />
                            任务状态
                            {activeCount > 0 ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{activeCount}</span> : null}
                        </span>
                    </button>
                    <Button type="text" size="small" icon={<RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />} loading={refreshing} onClick={() => void load(true)} aria-label="刷新任务状态" title="刷新任务状态" />
                    <Button type="text" size="small" icon={<ChevronUp className="size-3.5" />} onClick={() => setCollapsed(true)} aria-label="收起任务状态" title="收起任务状态" />
                </div>
            )}
            {!collapsed ? (
                <div id="drama-lab-task-panel-content" className="space-y-2 px-2 pb-2" aria-live="polite">
                    {error ? (
                        <Alert
                            type="error"
                            showIcon
                            message={error}
                            action={
                                <Button size="small" onClick={() => void load()}>
                                    重试
                                </Button>
                            }
                        />
                    ) : null}
                    {loading && !tasks.length ? (
                        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                            <LoaderCircle className="size-3.5 animate-spin" />
                            正在加载任务
                        </div>
                    ) : null}
                    {!loading && !error && !tasks.length ? <p className="px-1 py-2 text-xs text-muted-foreground">暂无任务</p> : null}
                    <TaskSection title="运行中" tasks={activeTasks} episodes={episodes} cancellingId={cancellingId} recheckingId={recheckingId} retryingId={retryingId} onCancel={cancel} onRecheck={recheck} onRetry={retry} />
                    <TaskSection title="待检查" tasks={reviewTasks} episodes={episodes} cancellingId={cancellingId} recheckingId={recheckingId} retryingId={retryingId} onCancel={cancel} onRecheck={recheck} onRetry={retry} />
                    <TaskSection title="历史记录" tasks={historyTasks} episodes={episodes} cancellingId={cancellingId} recheckingId={recheckingId} retryingId={retryingId} onCancel={cancel} onRecheck={recheck} onRetry={retry} />
                </div>
            ) : null}
        </section>
    );
}

function TaskSection({
    title,
    tasks,
    episodes,
    cancellingId,
    recheckingId,
    retryingId,
    onCancel,
    onRecheck,
    onRetry,
}: {
    title: string;
    tasks: DramaLabTaskView[];
    episodes: Array<{ id: string; title?: string; number?: number }>;
    cancellingId?: string;
    recheckingId?: string;
    retryingId?: string;
    onCancel: (task: DramaLabTaskView) => void;
    onRecheck: (task: DramaLabTaskView) => void;
    onRetry: (task: DramaLabTaskView) => void;
}) {
    if (!tasks.length) return null;
    return (
        <div className="space-y-1.5" data-testid={`drama-task-section-${title}`}>
            <div className="px-1 text-[11px] font-semibold text-muted-foreground">{title}</div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                {tasks.map((task) => (
                    <TaskRow
                        key={task.id}
                        task={task}
                        episodes={episodes}
                        cancelling={cancellingId === task.id}
                        rechecking={recheckingId === task.id}
                        retrying={retryingId === task.id}
                        onCancel={() => onCancel(task)}
                        onRecheck={() => onRecheck(task)}
                        onRetry={() => onRetry(task)}
                    />
                ))}
            </div>
        </div>
    );
}

function TaskRow({
    task,
    episodes,
    cancelling,
    rechecking,
    retrying,
    onCancel,
    onRecheck,
    onRetry,
}: {
    task: DramaLabTaskView;
    episodes: Array<{ id: string; title?: string; number?: number }>;
    cancelling: boolean;
    rechecking: boolean;
    retrying: boolean;
    onCancel: () => void;
    onRecheck: () => void;
    onRetry: () => void;
}) {
    const active = isTaskActive(task);
    const needsReview = isTaskNeedsReview(task);
    const failed = task.status === "error";
    const cancelled = task.status === "cancelled";
    const statusLabel = failed ? "失败" : cancelled ? "已取消" : task.status === "success" ? "完成" : task.status === "paused" ? "已暂停" : active ? "进行中" : task.status;
    return (
        <article className="border border-border/80 px-2 py-2" data-testid={`drama-task-${task.id}`}>
            <div className="flex items-start gap-2">
                <StatusIcon status={task.status} executionPhase={task.executionPhase} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-medium" title={task.title}>
                            {task.title}
                        </p>
                        <Tag className="m-0 shrink-0 text-[10px] leading-4" color={needsReview ? "warning" : failed ? "error" : cancelled ? "default" : active ? "processing" : task.status === "success" ? "success" : "warning"}>
                            {needsReview ? "待检查" : statusLabel}
                        </Tag>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[episodeLabel(task.episodeId, episodes), task.shotId ? `分镜 ${task.shotId}` : "", task.currentStep || ""].filter(Boolean).join(" · ") || "短剧实验室"}</p>
                    {needsReview ? (
                        <div className="mt-1.5 text-[11px] text-amber-700">待检查，不会继续轮询</div>
                    ) : task.progress === null ? (
                        <div className="mt-1.5 h-1 overflow-hidden bg-muted" data-progress-indeterminate="true">
                            <div className="h-full w-2/5 animate-pulse bg-primary/70" />
                        </div>
                    ) : (
                        <Progress className="mt-1" percent={task.progress} showInfo={false} size="small" status={failed ? "exception" : cancelled ? "normal" : task.status === "success" ? "success" : "active"} />
                    )}
                    {task.error ? (
                        <p className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-destructive">
                            <CircleAlert className="mt-0.5 size-3 shrink-0" />
                            {task.error}
                        </p>
                    ) : null}
                    {task.canRetry ? <p className="mt-1 text-[11px] text-amber-700">可重试</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {task.canRetry ? <Button type="text" size="small" loading={retrying} icon={<RefreshCw className="size-3" />} onClick={onRetry} aria-label={`重试${task.title}`} title="重试工作流" /> : null}
                    {task.canRecheck ? <Button type="text" size="small" loading={rechecking} icon={<RefreshCw className="size-3" />} onClick={onRecheck} aria-label={`重新检查${task.title}`} title="重新检查" /> : null}
                    {task.canCancel ? <Button type="text" danger size="small" loading={cancelling} icon={<Square className="size-3" />} onClick={onCancel} aria-label={`取消${task.title}`} title="取消任务" /> : null}
                </div>
            </div>
        </article>
    );
}

function episodeLabel(id: string | undefined, episodes: Array<{ id: string; title?: string; number?: number }>) {
    if (!id) return "";
    const episode = episodes.find((item) => item.id === id);
    if (!episode) return `剧集 ${id}`;
    return `第${episode.number || ""}集${episode.title ? ` ${episode.title}` : ""}`;
}

function isTaskNeedsReview(task: Pick<DramaLabTaskView, "executionPhase">) {
    return task.executionPhase === "needs_review" || task.executionPhase === "review_pending" || task.executionPhase === "reviewing" || task.executionPhase === "review_unavailable";
}

function isTaskActive(task: Pick<DramaLabTaskView, "status" | "executionPhase">) {
    return (task.status === "pending" || task.status === "running") && !isTaskNeedsReview(task);
}

function StatusIcon({ status, executionPhase }: { status: DramaLabTaskView["status"]; executionPhase?: DramaLabTaskView["executionPhase"] }) {
    if (status === "success") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
    if (status === "error") return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />;
    if (status === "cancelled") return <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
    if (status === "paused") return <PauseCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />;
    if (isTaskNeedsReview({ executionPhase })) return <PauseCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />;
    return <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />;
}
