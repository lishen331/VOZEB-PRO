"use client";

import { ArrowRight, ChevronLeft, GalleryVerticalEnd, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Select } from "@/components/gamma-ui/gamma-ant-select";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Checkbox } from "@/components/gamma-ui/gamma-ant";
import { GammaButton } from "@/components/gamma-ui/gamma-button";

import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { PublicWorkGalleryCard } from "@/components/works/public-work-gallery-card";
import { PublicCreatorModal } from "@/components/works/public-creator-modal";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";
import { cn } from "@/lib/utils";
import type { GalleryFilters, GalleryResult } from "./gallery-data";
import { GalleryPublishLink } from "./gallery-publish-link";

const linkControlClass = "inline-flex h-10 items-center gap-2 rounded-[var(--gm-radius-sm)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface)] px-3 text-sm text-[var(--gm-text)] transition hover:bg-[var(--gm-wash)]";
const primaryLinkClass =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] px-4 text-sm font-medium text-white shadow-[var(--gm-glow-blue)] transition-shadow hover:shadow-[0_10px_34px_rgba(0,80,245,0.6)]";

export function GalleryView({ filters, gallery, basePath, embedded = false }: { filters: GalleryFilters; gallery: GalleryResult; basePath: string; embedded?: boolean }) {
    const filtered = hasFilters(filters);
    const [previewSlug, setPreviewSlug] = useState("");
    const [creatorUsername, setCreatorUsername] = useState("");
    const [sort, setSort] = useState(filters.sort);
    const router = useRouter();

    useEffect(() => setSort(filters.sort), [filters.sort]);
    return (
        <div className={cn("mx-auto w-full max-w-[1600px]", embedded ? "px-2 py-2 sm:px-6 sm:py-6" : "px-3 pb-10 pt-4 sm:px-6 sm:pb-16 sm:pt-6")}>
            <section className="flex min-w-0 items-center justify-between gap-3 pb-3 sm:pb-4">
                <div className="flex min-w-0 items-center gap-2">
                    {!embedded ? (
                        <button
                            type="button"
                            aria-label="返回上一页"
                            onClick={() => router.back()}
                            className="grid size-8 shrink-0 place-items-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-2)] transition hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]"
                        >
                            <ChevronLeft className="size-5" aria-hidden />
                        </button>
                    ) : null}
                    <h1 className="min-w-0 text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">灵感发现</h1>
                </div>
                {embedded ? (
                    <Link href="/works" className={linkControlClass}>
                        <Plus className="size-4" aria-hidden />
                        管理我的作品
                    </Link>
                ) : null}
            </section>

            <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-[var(--gm-border)] pb-2" aria-label="作品分类">
                <Link href={galleryFilterHref(basePath, filters, "")} className={categoryClass(!filters.category)}>
                    全部
                </Link>
                {WORK_CATEGORY_OPTIONS.map((option) => (
                    <Link key={option.value} href={galleryFilterHref(basePath, filters, option.value)} className={categoryClass(filters.category === option.value)}>
                        {option.label}
                    </Link>
                ))}
            </nav>

            <form className="grid min-w-0 grid-cols-2 gap-2 border-b border-[var(--gm-border)] py-2.5 md:grid-cols-[minmax(220px,1fr)_140px_150px_auto_auto]" action={basePath}>
                <input type="hidden" name="category" value={filters.category} />
                <div className="col-span-2 min-w-0 md:col-span-1">
                    <Input name="keyword" defaultValue={filters.keyword} placeholder="搜索标题、说明或提示词" aria-label="搜索作品" size="large" prefix={<Search className="size-4" aria-hidden />} className="w-full" />
                </div>
                <Input name="tag" defaultValue={filters.tag} placeholder="标签" aria-label="作品标签" size="large" />
                <input type="hidden" name="sort" value={sort} />
                <Select
                    aria-label="作品排序"
                    className="w-full"
                    size="large"
                    value={sort}
                    options={[
                        { value: "random", label: "随机发现" },
                        { value: "featured", label: "精选优先" },
                        { value: "latest", label: "最新发布" },
                        { value: "popular", label: "最多访问" },
                        { value: "weekly", label: "本周热榜" },
                        { value: "monthly", label: "本月热榜" },
                    ]}
                    onChange={setSort}
                />
                <Checkbox name="featured" value="1" defaultChecked={filters.featured === "1"} className="h-10 min-h-10 rounded-[var(--gm-radius-sm)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface)] px-3 transition hover:bg-[var(--gm-wash)]">
                    只看精选
                </Checkbox>
                <div className="col-span-2 flex min-w-0 items-center justify-end gap-2 md:col-span-1">
                    {filtered ? (
                        <Link href={basePath} className={linkControlClass}>
                            清除
                        </Link>
                    ) : null}
                    <GammaButton size="lg" icon={<Search className="size-4" aria-hidden />} type="submit" className="min-w-0 flex-1 md:flex-none">
                        筛选
                    </GammaButton>
                </div>
            </form>

            {gallery.error ? (
                <section className="grid min-h-48 place-items-center border-b border-dashed border-[var(--gm-border)] px-4 text-center">
                    <div>
                        <p className="text-sm font-medium text-[var(--gm-text)]">作品广场暂时不可用</p>
                        <p className="mt-1 text-xs text-[var(--gm-text-3)]">{gallery.error}</p>
                    </div>
                </section>
            ) : gallery.items.length ? (
                <ResponsiveMasonryGrid className="grid-cols-2 py-3 sm:grid-cols-3 sm:py-4 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6" ariaLabel="作品列表">
                    {gallery.items.map((item) => (
                        <PublicWorkGalleryCard key={item.slug} item={item} nextPath={basePath} onOpen={() => setPreviewSlug(item.slug)} onOpenAuthor={setCreatorUsername} />
                    ))}
                </ResponsiveMasonryGrid>
            ) : (
                <section className="flex min-h-64 flex-col items-center justify-center border-b border-dashed border-[var(--gm-border)] px-4 py-10 text-center sm:min-h-80">
                    <span className="grid size-11 place-items-center rounded-[var(--gm-radius)] bg-[var(--gm-surface)] text-[var(--gm-text-3)] ring-1 ring-[var(--gm-border)]">
                        <GalleryVerticalEnd className="size-5" aria-hidden />
                    </span>
                    <h2 className="mt-4 text-base font-semibold text-[var(--gm-text)]">{filtered ? "没有匹配的公开作品" : "还没有公开作品"}</h2>
                    <p className="mt-1.5 max-w-sm text-sm leading-6 text-[var(--gm-text-3)]">{filtered ? "调整筛选条件后再查看。" : "审核通过并公开发布的作品会出现在这里。"}</p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        {filtered ? (
                            <Link href={basePath} className={primaryLinkClass}>
                                清除筛选
                            </Link>
                        ) : (
                            <>
                                <GalleryPublishLink className={primaryLinkClass} label="发布第一个作品" />
                                <Link href="/create" className={linkControlClass}>
                                    <Sparkles className="size-4" aria-hidden />
                                    开始创作
                                </Link>
                            </>
                        )}
                    </div>
                </section>
            )}

            {gallery.nextCursor ? (
                <div className="flex justify-center pt-2 sm:pt-4">
                    <Link href={nextPageHref(basePath, filters, gallery.nextCursor)} className={linkControlClass}>
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

function MediaPlaceholder({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div className="grid size-full place-items-center text-[var(--gm-text-3)]">
            <div className="flex flex-col items-center gap-2 text-xs">
                {icon}
                {label}
            </div>
        </div>
    );
}

function hasFilters(filters: GalleryFilters) {
    return Boolean(filters.keyword || filters.category || filters.tag || filters.featured || filters.sort !== "random");
}

function categoryClass(active: boolean) {
    return cn(
        "inline-flex h-9 shrink-0 items-center rounded-[var(--gm-radius-sm)] px-3 text-sm transition",
        active ? "bg-[var(--gm-wash)] font-medium text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
    );
}

function galleryFilterHref(basePath: string, filters: GalleryFilters, category: string) {
    const params = new URLSearchParams();
    Object.entries({ ...filters, category, cursor: "" }).forEach(([key, value]) => {
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
