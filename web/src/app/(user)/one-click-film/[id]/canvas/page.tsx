"use client";
import { Alert, Spin } from "antd";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
export default function OneClickFilmCanvasPage() {
    const { id } = useParams<{ id: string }>();
    const query = useSearchParams();
    const router = useRouter();
    const episodeId = query.get("episode") || query.get("episodeId") || "";
    // 带上 shotId 才能在画布里定位到具体分镜，并在返回时回到同一张分镜卡。
    const shotId = query.get("shotId") || query.get("shot") || "";
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!id || !episodeId) {
            router.replace(`/one-click-film/${encodeURIComponent(id || "")}`);
            return;
        }
        let cancelled = false;
        void fetch(`/api/one-click-film/projects/${encodeURIComponent(id)}/episode-canvas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId, ...(shotId ? { shotId } : {}) }) })
            .then(async (r) => {
                const p = await r.json();
                if (!r.ok || p.code !== 0 || !p.data?.canvasId) throw new Error(p.msg || "画布创建失败");
                if (cancelled) return;
                const target = new URLSearchParams({ dramaProjectId: id, episodeId, source: "one-click-film" });
                if (shotId) target.set("shotId", shotId);
                router.replace(`/drama-canvas/${encodeURIComponent(p.data.canvasId)}?${target.toString()}`);
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "画布创建失败");
            });
        return () => {
            cancelled = true;
        };
    }, [episodeId, id, router, shotId]);
    return error ? (
        <main className="grid h-full place-items-center">
            <Alert type="error" showIcon message={error} />
        </main>
    ) : (
        <main className="grid h-full place-items-center">
            <Spin description="正在打开商单画布" />
        </main>
    );
}
