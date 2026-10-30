"use client";

import { ArrowRight, ChevronLeft, GalleryVerticalEnd, Plus, RotateCw, Search, Sparkles, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaTabs, gammaChipClass } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";

import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { PublicWorkGalleryCard } from "@/components/works/public-work-gallery-card";
import { PublicCreatorModal } from "@/components/works/public-creator-modal";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";
import { cn } from "@/lib/utils";
import type { GalleryFilters, GalleryResult } from "./gallery-data";
import { GalleryPublishLink } from "./gallery-publish-link";

/*
 * 作品广场（/gallery 公开页、/community 工作空间内）共用的视图。
 * 控件与首页作品区一致：分段排序 + 胶囊分类 + 搜索框；筛选条件都在 URL 上，所以分类、精选用链接，排序切换后跳转。
 */

const SORT_TABS = [
    { value: "random", label: "推荐" },
    { value: "featured", label: "精选" },
    { value: "latest", label: "最新" },
    { value: "popular", label: "最多访问" },
    { value: "weekly", label: "本周热榜" },
    { value: "monthly", label: "本月热榜" },
];

const linkControlClass = "inline-flex h-8 items-center gap-1 rounded-[var(--gm-radius-sm)] px-2.5 text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]";
const searchFieldClass =
    "flex h-9 min-w-0 items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 ring-1 ring-[var(--gm-border)] transition-shadow focus-within:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus-within:ring-[var(--gm-accent)]";
const searchInputClass = "h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]";
const primaryLinkClass =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] px-3 text-[13px] font-medium text-white shadow-[var(--gm-glow-blue)] transition-shadow hover:shadow-[0_10px_34px_rgba(0,80,245,0.6)]";

export function GalleryView({ filters, gallery, basePath, embedded = false }: { filters: GalleryFilters; gallery: GalleryResult; basePath: string; embedded?: boolean }) {
    const filtered = hasFilters(filters);
    const [previewSlug, setPreviewSlug] = useState("");
    const [creatorUsername, setCreatorUsername] = useState("");
    // 先在本地切过去，指示块立刻滑动，不用等页面跳转完成
    const [sort, setSort] = useState(filters.sort);
    const router = useRouter();

    useEffect(() => setSort(filters.sort), [filters.sort]);
    const changeSort = (value: string) => {
        setSort(value);
        router.push(galleryFilterHref(basePath, filters, { sort: value }));
    };
    return (
        <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-2.5", embedded ? "px-2 py-2 sm:px-6 sm:py-6" : "px-3 pb-10 pt-4 sm:px-6 sm:pb-16 sm:pt-6")}>
            <section className="flex min-w-0 items-center justify-between gap-3 pb-1">
                <div className="flex min-w-0 items-center gap-2">
                    {!embedded ? (
                        <button
                            type="button"
                            aria-label="返回上一页"
                            onClick={() => router.back()}
                            className="gm-glass gm-glass-sheen gm-glass-refract grid size-9 shrink-0 place-items-center rounded-full text-[var(--gm-text-2)] transition-colors hover:text-[var(--gm-text)] focus-visible:outline-2 focus-visible:outline-[var(--gm-accent)]"
                        >
                            <ChevronLeft className="relative z-[1] size-5" aria-hidden />
                        </button>
                    ) : null}
                    <h1 className="!m-0 min-w-0 text-xl leading-9 font-semibold text-[var(--gm-text)] sm:text-2xl sm:leading-9">灵感发现</h1>
                </div>
                {embedded ? (
                    <Link href="/works" className={linkControlClass}>
                        <Plus className="size-4" aria-hidden />
                        管理我的作品
                    </Link>
                ) : null}
            </section>

            <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="hide-scrollbar max-w-full overflow-x-auto">
                    <GammaTabs label="作品排序" options={SORT_TABS} value={sort} onChange={changeSort} />
                </div>
                <span aria-hidden className="hidden h-6 w-px bg-[var(--gm-border-strong)] md:block" />
                <form className="flex w-full min-w-0 items-center gap-2 md:w-auto md:flex-1" action={basePath}>
                    <input type="hidden" name="category" value={filters.category} />
                    <input type="hidden" name="sort" value={sort} />
                    {filters.featured ? <input type="hidden" name="featured" value="1" /> : null}
                    <label className={cn(searchFieldClass, "flex-1 md:max-w-80")}>
                        <Search className="size-4 shrink-0 text-[var(--gm-text-3)]" aria-hidden />
                        <span className="sr-only">搜索作品</span>
                        <input name="keyword" defaultValue={filters.keyword} placeholder="搜索作品或提示词" className={searchInputClass} />
                    </label>
                    <label className={cn(searchFieldClass, "w-28 shrink-0 sm:w-36")}>
                        <Tag className="size-4 shrink-0 text-[var(--gm-text-3)]" aria-hidden />
                        <span className="sr-only">作品标签</span>
                        <input name="tag" defaultValue={filters.tag} placeholder="标签" className={searchInputClass} />
                    </label>
                    <GammaButton size="sm" variant="soft" type="submit" icon={<Search className="size-3.5" aria-hidden />}>
                        搜索
                    </GammaButton>
                </form>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Link href={galleryFilterHref(basePath, filters, { featured: filters.featured ? "" : "1" })} aria-pressed={filters.featured === "1"} className={gammaChipClass(filters.featured === "1")}>
                        <Sparkles className="size-3.5" aria-hidden />
                        只看精选
                    </Link>
                    {filtered ? (
                        <Link href={basePath} className={linkControlClass}>
                            清除筛选
                        </Link>
                    ) : null}
                </div>
            </div>

            <nav className="hide-scrollbar flex min-w-0 flex-nowrap gap-2 overflow-x-auto" aria-label="作品分类">
                <Link href={galleryFilterHref(basePath, filters, { category: "" })} aria-current={!filters.category ? "page" : undefined} className={gammaChipClass(!filters.category)}>
                    全部
                </Link>
                {WORK_CATEGORY_OPTIONS.map((option) => (
                    <Link key={option.value} href={galleryFilterHref(basePath, filters, { category: option.value })} aria-current={filters.category === option.value ? "page" : undefined} className={gammaChipClass(filters.category === option.value)}>
                        {option.label}
                    </Link>
                ))}
            </nav>
            {gallery.error ? (
                <GammaEmptyState
                    icon={<RotateCw />}
                    title="作品广场暂时不可用"
                    description={gallery.error}
                    action={
                        <GammaButton size="sm" variant="soft" onClick={() => router.refresh()}>
                            重新加载
                        </GammaButton>
                    }
                />
            ) : gallery.items.length ? (
                <ResponsiveMasonryGrid className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6" ariaLabel="作品列表">
                    {gallery.items.map((item) => (
                        <PublicWorkGalleryCard key={item.slug} item={item} nextPath={basePath} onOpen={() => setPreviewSlug(item.slug)} onOpenAuthor={setCreatorUsername} />
                    ))}
                </ResponsiveMasonryGrid>
            ) : (
                <GammaEmptyState
                    icon={filtered ? <Search /> : <GalleryVerticalEnd />}
                    title={filtered ? "没有匹配的公开作品" : "还没有公开作品"}
                    description={filtered ? "换个关键词或分类看看" : "审核通过并公开发布的作品会出现在这里"}
                    action={
                        filtered ? (
                            <Link href={basePath} className={primaryLinkClass}>
                                清除筛选
                            </Link>
                        ) : (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <GalleryPublishLink className={primaryLinkClass} label="发布第一个作品" />
                                <Link href="/create" className={linkControlClass}>
                                    <Sparkles className="size-4" aria-hidden />
                                    开始创作
                                </Link>
                            </div>
                        )
                    }
                />
            )}

            {gallery.nextCursor ? (
                <div className="flex justify-center pt-2 sm:pt-4">
                    <Link href={nextPageHref(basePath, filters, gallery.nextCursor)} className={cn(linkControlClass, "h-10 px-4 ring-1 ring-[var(--gm-border-strong)]")}>
                        查看更多
                        <ArrowRight className="size-4" aria-hidden />
                    </Link>
                </div>
            ) : null}
            <PublicWorkPreviewModal slug={previewSlug || undefined} onClose={() => setPreviewSlug("")} onOpenCreator={setCreatorUsername} />
            <PublicCreatorModal username={creatorUsername || undefined} nextPath={basePath} onClose={() => setCreatorUsername("")} />
        </div>
    );
}

function hasFilters(filters: GalleryFilters) {
    return Boolean(filters.keyword || filters.category || filters.tag || filters.featured || filters.sort !== "random");
}

/** 改一个筛选条件后的地址；换条件就从第一页开始 */
function galleryFilterHref(basePath: string, filters: GalleryFilters, patch: Partial<GalleryFilters>) {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...patch, cursor: "" }).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

function nextPageHref(basePath: string, filters: GalleryFilters, cursor: string) {
    const params = new URLSearchParams();
    Object.entries({ ...filters, cursor }).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    return `${basePath}?${params}`;
}
