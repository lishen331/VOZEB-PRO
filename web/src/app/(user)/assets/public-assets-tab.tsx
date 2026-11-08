"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Music2, Video } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Select } from "@/components/gamma-ui/gamma-ant-select";
import { Button } from "@/components/gamma-ui/gamma-ant";
import { GammaCardGridSkeleton } from "@/components/gamma-ui/gamma-data";
import { CompactEmptyState } from "@/components/compact-empty-state";
import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { getPublicWorkPublication, type PublicWorkPublication } from "@/services/api/work-publications";
import { listPublicGallery } from "@/services/api/work-governance";

type PublicAsset = { id: string; title: string; category: string; mediaType: "image" | "video" | "audio"; url: string; slug: string };
type Kind = "all" | PublicAsset["mediaType"];

export function PublicAssetsTab() {
    const { message } = App.useApp();
    const [works, setWorks] = useState<PublicWorkPublication[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string>();
    const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
    const [kind, setKind] = useState<Kind>("all");
    const loadWorks = useCallback(
        async (cursor?: string, append = false) => {
            if (append) setLoadingMore(true);
            else setLoading(true);
            try {
                const page = await listPublicGallery({ limit: 30, sort: "featured", cursor });
                const details = await Promise.allSettled(page.items.map((item) => getPublicWorkPublication(item.slug)));
                const next = details.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
                setWorks((current) => (append ? [...current, ...next.filter((work) => !current.some((item) => item.slug === work.slug))] : next));
                setHasMore(Boolean(page.nextCursor));
                setNextCursor(page.nextCursor);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "公共素材加载失败");
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [message],
    );
    useEffect(() => {
        void loadWorks();
    }, [loadWorks]);
    const assets = useMemo(
        () =>
            works.flatMap((work) =>
                work.assets
                    .filter((asset) => asset.role === "content" && (asset.mediaType === "image" || asset.mediaType === "video" || asset.mediaType === "audio"))
                    .map((asset) => ({ ...asset, title: work.title, category: work.category, slug: work.slug })),
            ),
        [works],
    );
    const visible = assets.filter((asset) => (kind === "all" || asset.mediaType === kind) && !failedIds.has(asset.id));
    const counts = { image: assets.filter((asset) => asset.mediaType === "image").length, video: assets.filter((asset) => asset.mediaType === "video").length, audio: assets.filter((asset) => asset.mediaType === "audio").length };

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)] px-3 py-3 sm:px-6 sm:py-6" data-testid="public-assets-tab">
            <div className="mx-auto w-full max-w-[1760px]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold sm:text-xl">公共素材</h1>
                        <p className="mt-1 text-xs text-[var(--gm-text-3)]">仅展示已公开发布作品中可访问的图片、视频和音频。</p>
                    </div>
                    <Select
                        aria-label="筛选公共素材类型"
                        className="w-36"
                        value={kind}
                        onChange={(value) => setKind(value as Kind)}
                        options={[
                            { value: "all", label: `全部 (${assets.length})` },
                            { value: "image", label: `图片 (${counts.image})` },
                            { value: "video", label: `视频 (${counts.video})` },
                            { value: "audio", label: `音频 (${counts.audio})` },
                        ]}
                    />
                </div>
                {loading ? (
                    <GammaCardGridSkeleton count={8} />
                ) : !visible.length ? (
                    <CompactEmptyState title={assets.length ? "没有符合类型的公共素材" : "暂无公开素材"} description={assets.length ? "切换素材类型查看" : "公开发布审核通过的作品素材会出现在这里。"} />
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {visible.map((asset) => (
                            <Link
                                key={`${asset.slug}:${asset.id}`}
                                href={`/share/${encodeURIComponent(asset.slug)}`}
                                className="group min-w-0 overflow-hidden rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] transition hover:-translate-y-0.5 hover:shadow-[var(--gm-shadow)]"
                            >
                                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[var(--gm-wash)]">
                                    {asset.mediaType === "image" ? (
                                        <LazyMediaImage
                                            src={imagePreviewUrl(asset.url, 480)}
                                            alt={asset.title}
                                            containerClassName="size-full"
                                            imageClassName="size-full object-cover"
                                            errorLabel=""
                                            onError={() => setFailedIds((current) => new Set(current).add(asset.id))}
                                        />
                                    ) : asset.mediaType === "video" ? (
                                        <video src={asset.url} muted playsInline preload="metadata" onError={() => setFailedIds((current) => new Set(current).add(asset.id))} className="size-full object-cover" aria-label={asset.title} />
                                    ) : (
                                        <audio src={asset.url} controls preload="metadata" onError={() => setFailedIds((current) => new Set(current).add(asset.id))} className="w-[92%]" aria-label={asset.title} />
                                    )}
                                    <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white">
                                        {asset.mediaType === "image" ? <ImageIcon className="size-3.5" /> : asset.mediaType === "video" ? <Video className="size-3.5" /> : <Music2 className="size-3.5" />}
                                    </span>
                                </div>
                                <div className="px-3 py-2">
                                    <div className="truncate text-sm font-medium">{asset.title}</div>
                                    <div className="mt-0.5 truncate text-xs text-[var(--gm-text-3)]">{asset.category}</div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
                {!loading && hasMore ? (
                    <div className="mt-5 flex justify-center">
                        <Button loading={loadingMore} onClick={() => void loadWorks(nextCursor, true)}>
                            加载更多公共素材
                        </Button>
                    </div>
                ) : null}
            </div>
        </main>
    );
}
