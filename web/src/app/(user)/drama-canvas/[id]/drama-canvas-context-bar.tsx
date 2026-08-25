"use client";

import { Button, Select, Tooltip } from "antd";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type DramaEpisodeSummary = { id: string; title?: string; episodeNumber?: number };
type DramaProjectPayload = { id: string; title?: string; episodes?: DramaEpisodeSummary[] };

export function DramaCanvasContextBar() {
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();
    const dramaProjectId = searchParams.get("dramaProjectId") || "";
    const episodeId = searchParams.get("episodeId") || "";
    const shotId = searchParams.get("shotId") || "";
    const [project, setProject] = useState<DramaProjectPayload>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!dramaProjectId) return;
        let cancelled = false;
        void fetch(`/api/drama-lab/projects/${encodeURIComponent(dramaProjectId)}`, { cache: "no-store" })
            .then(async (response) => {
                const payload = (await response.json().catch(() => ({}))) as { data?: { project?: DramaProjectPayload }; msg?: string };
                if (!response.ok || !payload.data?.project) throw new Error(payload.msg || "短剧项目读取失败");
                if (!cancelled) setProject(payload.data.project);
            })
            .catch((cause) => {
                if (!cancelled) setError(cause instanceof Error ? cause.message : "短剧项目读取失败");
            });
        return () => {
            cancelled = true;
        };
    }, [dramaProjectId]);

    const episodes = useMemo(
        () => [...(project?.episodes || [])].sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0)),
        [project?.episodes],
    );

    const openEpisodeCanvas = useCallback(
        async (nextEpisodeId: string, preserveShot = false) => {
            if (!dramaProjectId || !nextEpisodeId) return;
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(dramaProjectId)}/episode-canvas`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ episodeId: nextEpisodeId, ...(preserveShot && shotId ? { shotId } : {}) }),
                });
                const payload = (await response.json().catch(() => ({}))) as { data?: { project?: { id?: string } }; msg?: string };
                const canvasId = payload.data?.project?.id;
                if (!response.ok || !canvasId) throw new Error(payload.msg || "本集画布同步失败");
                const query = new URLSearchParams({ dramaProjectId, episodeId: nextEpisodeId });
                if (preserveShot && shotId) query.set("shotId", shotId);
                router.replace(`/drama-canvas/${encodeURIComponent(canvasId)}?${query.toString()}`);
                router.refresh();
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : "本集画布同步失败");
            } finally {
                setLoading(false);
            }
        },
        [dramaProjectId, router, shotId],
    );

    if (!dramaProjectId || !episodeId) return null;

    const returnTarget = `/drama-lab/${encodeURIComponent(dramaProjectId)}/create?episode=${encodeURIComponent(episodeId)}&stage=storyboard${shotId ? `#storyboard-shot-${encodeURIComponent(shotId)}` : ""}`;

    return (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-[70] flex justify-center px-3 sm:top-20">
            <div className="pointer-events-auto flex h-10 max-w-[calc(100vw-1.5rem)] items-center gap-1.5 border border-neutral-200 bg-white/95 px-1.5 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
                <Tooltip title="返回短剧分镜工作台">
                    <Button type="text" icon={<ArrowLeft className="size-4" />} aria-label="返回短剧分镜工作台" onClick={() => router.push(returnTarget)} />
                </Tooltip>
                <span className="hidden max-w-40 truncate text-xs text-neutral-500 sm:block" title={project?.title || dramaProjectId}>
                    {project?.title || "短剧实验室"}
                </span>
                <Select
                    aria-label="切换剧集"
                    value={episodeId}
                    loading={!project && !error}
                    className="w-36 sm:w-44"
                    size="small"
                    options={episodes.map((episode, index) => ({ value: episode.id, label: episode.title || `第 ${episode.episodeNumber ?? index + 1} 集` }))}
                    onChange={(value) => void openEpisodeCanvas(value)}
                />
                <Tooltip title={error || "从短剧实验室同步当前集"}>
                    <Button
                        type="text"
                        danger={Boolean(error)}
                        loading={loading}
                        icon={<RefreshCw className="size-4" />}
                        aria-label="同步当前集"
                        onClick={() => void openEpisodeCanvas(episodeId, true)}
                    />
                </Tooltip>
                <span className="hidden text-[11px] text-neutral-400 md:inline">画布 {params.id.slice(-8)}</span>
            </div>
        </div>
    );
}
