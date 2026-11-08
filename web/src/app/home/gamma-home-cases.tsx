"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";

import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { listPublicGallery, type PublicGalleryItem } from "@/services/api/work-governance";
import { filterVisibleGalleryItems } from "./gallery-visible-items";

export function GammaHomeCases() {
    const [items, setItems] = useState<PublicGalleryItem[]>([]);
    const [failed, setFailed] = useState<Set<string>>(() => new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [previewSlug, setPreviewSlug] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        setError(false);
        setFailed(new Set());
        void listPublicGallery({ limit: 5, sort: "featured" })
            .then((page) => setItems(page.items))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);
    const visible = filterVisibleGalleryItems(items, failed);

    return (
        <section aria-labelledby="home-cases-title" className="flex min-w-0 flex-col gap-3" data-testid="home-canvas-cases">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="home-cases-title" className="text-base font-semibold text-[var(--gm-text)]">
                        画布创作案例
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--gm-text-3)]">来自平台真实公开作品，点击可查看详情与提示词</p>
                </div>
                <Link href="/community" className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--gm-text-2)] transition hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                    全部作品 →
                </Link>
            </div>
            {error ? (
                <GammaEmptyState
                    icon={<ImageIcon />}
                    title="案例暂时无法加载"
                    description="公开作品仍可通过作品广场浏览"
                    action={
                        <button type="button" onClick={load} className="rounded-md border border-[var(--gm-border)] px-3 py-1.5 text-xs">
                            重新加载
                        </button>
                    }
                />
            ) : loading ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="正在加载真实创作案例">
                    {Array.from({ length: 5 }, (_, index) => (
                        <span key={index} className="aspect-[4/3] animate-pulse rounded-lg bg-[var(--gm-wash-strong)]" />
                    ))}
                </div>
            ) : visible.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {visible.map((item) => (
                        <button
                            key={item.slug}
                            type="button"
                            onClick={() => setPreviewSlug(item.slug)}
                            className="group min-w-0 overflow-hidden rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] text-left transition hover:-translate-y-0.5 hover:shadow-[var(--gm-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                        >
                            {item.preview?.mediaType === "image" ? (
                                <LazyMediaImage
                                    src={imagePreviewUrl(item.preview.url, 480)}
                                    alt={item.title}
                                    containerClassName="block aspect-[4/3] w-full"
                                    imageClassName="size-full object-cover"
                                    errorLabel=""
                                    onError={() => setFailed((current) => new Set(current).add(item.slug))}
                                />
                            ) : item.preview?.mediaType === "video" ? (
                                <video src={item.preview.url} muted playsInline preload="metadata" onError={() => setFailed((current) => new Set(current).add(item.slug))} className="aspect-[4/3] w-full object-cover" aria-label={item.title} />
                            ) : (
                                <span className="grid aspect-[4/3] place-items-center bg-[var(--gm-wash)] text-xs text-[var(--gm-text-3)]">暂无预览</span>
                            )}
                            <span className="block truncate px-2.5 py-2 text-xs font-medium text-[var(--gm-text)]">{item.title}</span>
                            <span className="block truncate px-2.5 pb-2 text-[11px] text-[var(--gm-text-3)]">{item.category}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <GammaEmptyState icon={<ImageIcon />} title="暂时没有可展示的公开案例" description="作品审核通过并公开后，会自动出现在这里。" />
            )}
            <PublicWorkPreviewModal slug={previewSlug || undefined} onClose={() => setPreviewSlug("")} />
        </section>
    );
}
