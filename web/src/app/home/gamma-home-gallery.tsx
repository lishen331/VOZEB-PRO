"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, Film, Heart, ImageOff, Play, RotateCw, Search, Sparkles } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaChip, GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { cn } from "@/lib/utils";
import { WORK_CATEGORIES } from "@/lib/work-publication-options";
import { listPublicGallery, type PublicGalleryItem } from "@/services/api/work-governance";

/*
 * 新首页下半屏：公开作品广场（真实数据 /api/public/gallery）。
 * 推荐 / 精选 / 最新 三个排序 + 关键词 + 作品分类筛选 + 瀑布流；点作品打开公开作品详情弹窗。
 */

type FeedSort = "random" | "featured" | "latest";

const FEED_TABS = [
    { value: "random" as const, label: "推荐" },
    { value: "featured" as const, label: "精选" },
    { value: "latest" as const, label: "最新" },
];

const ALL = "all";
const PAGE_LIMIT = 30;

function matchesKeyword(item: PublicGalleryItem, keyword: string) {
    if (!keyword) return true;
    return [item.title, item.description, item.publicPrompt, item.authorName, item.category, ...item.tags].some((field) => field?.toLowerCase().includes(keyword));
}

export function GammaHomeGallery({ onCreate }: { onCreate: () => void }) {
    const [sort, setSort] = useState<FeedSort>("random");
    const [category, setCategory] = useState<string>(ALL);
    const [keyword, setKeyword] = useState("");
    const [previewSlug, setPreviewSlug] = useState("");

    const query = useQuery({
        queryKey: ["home-public-gallery", sort, category],
        queryFn: () => listPublicGallery({ limit: PAGE_LIMIT, sort, category: category === ALL ? undefined : category }),
        staleTime: 60_000,
    });
    const items = useMemo(() => (query.data?.items || []).filter((item) => matchesKeyword(item, keyword.trim().toLowerCase())), [query.data, keyword]);
    const filtered = Boolean(keyword.trim()) || category !== ALL;

    const resetFilters = () => {
        setKeyword("");
        setCategory(ALL);
    };

    return (
        <section id="inspiration" aria-labelledby="home-gallery-title" className="flex scroll-mt-4 flex-col gap-2.5">
            <h2 id="home-gallery-title" className="sr-only">
                作品广场
            </h2>
            <div className="flex flex-wrap items-center gap-3">
                <GammaTabs label="作品排序" options={FEED_TABS} value={sort} onChange={setSort} />
                <span aria-hidden className="h-6 w-px bg-[var(--gm-border-strong)]" />
                <label className="flex h-9 w-full max-w-80 items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 ring-1 ring-[var(--gm-border)] transition-shadow focus-within:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus-within:ring-[var(--gm-accent)]">
                    <Search className="size-4 text-[var(--gm-text-3)]" />
                    <span className="sr-only">搜索作品</span>
                    <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索作品、提示词、作者" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--gm-text-3)]" />
                </label>
                <div className="ml-auto flex items-center gap-2">
                    <GammaButton variant="outline" size="sm" onClick={onCreate}>
                        做同款创作
                    </GammaButton>
                    <Link href="/gallery" className="inline-flex h-8 items-center gap-1 rounded-[var(--gm-radius-sm)] px-2.5 text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                        全部作品
                        <ArrowRight className="size-3.5" />
                    </Link>
                </div>
            </div>
            <div className="hide-scrollbar flex flex-nowrap gap-2 overflow-x-auto" role="group" aria-label="按分类筛选">
                <GammaChip active={category === ALL} onClick={() => setCategory(ALL)}>
                    全部
                </GammaChip>
                {WORK_CATEGORIES.map((item) => (
                    <GammaChip key={item} active={category === item} onClick={() => setCategory(item)}>
                        {item}
                    </GammaChip>
                ))}
            </div>
            <GalleryBody query={query} items={items} sort={sort} filtered={filtered} onReset={resetFilters} onPreview={setPreviewSlug} />
            <PublicWorkPreviewModal slug={previewSlug || undefined} onClose={() => setPreviewSlug("")} />
        </section>
    );
}

const MASONRY = "columns-2 gap-3 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 [&>*]:mb-3";

function GalleryBody({
    query,
    items,
    sort,
    filtered,
    onReset,
    onPreview,
}: {
    query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
    items: PublicGalleryItem[];
    sort: FeedSort;
    filtered: boolean;
    onReset: () => void;
    onPreview: (slug: string) => void;
}) {
    if (query.isLoading) {
        return (
            <div aria-label="正在加载公开作品" className={MASONRY}>
                {Array.from({ length: 10 }, (_, index) => (
                    <span key={index} className={cn("block animate-pulse break-inside-avoid rounded-[var(--gm-radius-lg)] bg-[var(--gm-wash-strong)]", index % 3 === 0 ? "aspect-[3/4]" : "aspect-[4/3]")} />
                ))}
            </div>
        );
    }
    if (query.isError) {
        return (
            <GammaEmptyState
                icon={<RotateCw />}
                title="作品暂时无法加载"
                description="请稍后重试，或刷新页面后再试"
                action={
                    <GammaButton size="sm" variant="soft" onClick={() => void query.refetch()}>
                        重新加载
                    </GammaButton>
                }
            />
        );
    }
    if (!items.length) {
        return (
            <GammaEmptyState
                icon={sort === "featured" ? <Sparkles /> : <Search />}
                title={filtered ? "没有找到相关作品" : "还没有公开作品"}
                description={filtered ? "换个关键词或分类看看" : "审核通过并公开发布的作品会出现在这里"}
                action={
                    filtered ? (
                        <GammaButton size="sm" variant="soft" onClick={onReset}>
                            清空筛选
                        </GammaButton>
                    ) : undefined
                }
            />
        );
    }
    return (
        <div className={MASONRY} data-testid="home-public-gallery">
            {items.map((item, index) => (
                <GalleryCard key={item.slug} item={item} tall={index % 3 === 0} onPreview={() => onPreview(item.slug)} />
            ))}
        </div>
    );
}

/** 作品卡：封面（图片 / 视频首帧）+ 标题 / 作者 + 浏览与点赞数 */
function GalleryCard({ item, tall, onPreview }: { item: PublicGalleryItem; tall: boolean; onPreview: () => void }) {
    const [failed, setFailed] = useState(false);
    const preview = item.preview;
    const ratio = tall ? "aspect-[3/4]" : "aspect-[4/3]";
    const media =
        failed || !preview || (preview.mediaType !== "image" && preview.mediaType !== "video") ? (
            <span className={cn("flex w-full flex-col items-center justify-center gap-2 text-xs text-[var(--gm-text-3)]", ratio)} role="img" aria-label="作品预览不可用">
                <ImageOff className="size-5" />
                预览不可用
            </span>
        ) : preview.mediaType === "image" ? (
            <LazyMediaImage
                src={imagePreviewUrl(preview.url, 640)}
                alt={item.title}
                containerClassName={cn("block w-full overflow-hidden", ratio)}
                imageClassName="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                errorLabel="作品图片不可用"
            />
        ) : (
            <video src={preview.url} muted playsInline preload="metadata" onError={() => setFailed(true)} className={cn("w-full object-cover", ratio)} />
        );

    return (
        <article
            data-testid="home-gallery-card"
            className="group relative break-inside-avoid overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)] transition-shadow duration-300 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-accent-ring)]"
        >
            <button type="button" onClick={onPreview} aria-label={`查看作品：${item.title}`} className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-inset">
                {media}
            </button>
            <span className="pointer-events-none absolute top-2.5 left-2.5 flex gap-1.5">
                {item.isFeatured ? <span className="rounded-full bg-[image:var(--gm-gradient)] px-2 py-0.5 text-[11px] font-medium text-white">精选</span> : null}
                {item.hasProcess ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                        <Film className="size-3" />
                        制作流程
                    </span>
                ) : null}
            </span>
            {preview?.mediaType === "video" ? (
                <span className="pointer-events-none absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                    <Play className="size-3.5 fill-current" />
                </span>
            ) : null}
            <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--gm-text)]">{item.title}</span>
                    <span className="block truncate text-[11px] text-[var(--gm-text-3)]">{item.authorName || item.authorUsername || item.category}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2.5 text-[11px] text-[var(--gm-text-3)] tabular-nums">
                    <span className="inline-flex items-center gap-1">
                        <Eye className="size-3" />
                        {item.viewCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Heart className="size-3" />
                        {item.likeCount}
                    </span>
                </span>
            </div>
        </article>
    );
}
