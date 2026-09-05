"use client";

import { Alert, Spin } from "antd";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Resolves the stable episode binding, then enters the shared Canvas runtime. */
export default function DramaEpisodeCanvasPage() {
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();
    const projectId = params.id;
    const episodeId = searchParams.get("episodeId") || searchParams.get("episode") || "";
    const shotId = searchParams.get("shotId") || "";
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (!projectId || !episodeId) {
            router.replace(`/drama-lab/${encodeURIComponent(projectId || "")}/outline`);
            return;
        }
        let cancelled = false;
        setError(undefined);
        void fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/episode-canvas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ episodeId, ...(shotId ? { shotId } : {}) }),
        })
            .then(async (response) => {
                const data = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { project?: { id?: string } } };
                if (!response.ok || data.code !== 0 || !data.data?.project?.id) throw new Error(data.msg || "本集画布创建失败");
                if (cancelled) return;
                const canvasId = data.data.project.id;
                const targetParams = new URLSearchParams({ dramaProjectId: projectId, episodeId });
                if (shotId) targetParams.set("shotId", shotId);
                router.replace(`/drama-canvas/${encodeURIComponent(canvasId)}?${targetParams.toString()}`);
            })
            .catch((cause) => {
                if (!cancelled) setError(cause instanceof Error ? cause.message : "本集画布创建失败");
            });
        return () => {
            cancelled = true;
        };
    }, [episodeId, projectId, router, shotId]);

    if (error)
        return (
            <main className="grid h-full place-items-center p-6">
                <Alert type="error" showIcon message={error} />
            </main>
        );
    return (
        <main className="grid h-full place-items-center">
            <Spin description="正在打开本集画布" />{" "}
        </main>
    );
}
