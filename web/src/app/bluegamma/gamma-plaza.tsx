"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Search, Sparkles } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaWorkCard } from "@/components/gamma-ui/gamma-cards";
import { GammaChip, GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { GAMMA_SUBJECTS } from "@/components/gamma-ui/gamma-subjects";
import { GAMMA_GALLERY } from "@/app/bluegamma/gamma-nav";
import { cn } from "@/lib/utils";

type FeedTab = "recommend" | "following" | "events";

const FEED_TABS = [
    { value: "recommend" as const, label: "推荐" },
    { value: "following" as const, label: "关注" },
    { value: "events" as const, label: "活动" },
];

const ALL = "all";

/** 灵感广场（对标可灵首页下半屏）：推荐/关注/活动 + 搜索 + 专业筛选 + 瀑布流 */
export function GammaPlaza({
    onPreview,
    onRemix,
    onNotice,
    compact = false,
}: {
    onPreview: (item: { src: string; title: string }) => void;
    onRemix: (prompt: string, slug: string) => void;
    onNotice: (message: string) => void;
    /** 紧凑模式：无标题块、控件与筛选更密、瀑布流列数更多 */
    compact?: boolean;
}) {
    const [feedTab, setFeedTab] = useState<FeedTab>("recommend");
    const [filter, setFilter] = useState(ALL);
    const [query, setQuery] = useState("");
    const [liked, setLiked] = useState<ReadonlySet<string>>(() => new Set());

    const gallery = useMemo(() => {
        const keyword = query.trim();
        return GAMMA_GALLERY.filter((item) => (filter === ALL || item.subjectSlug === filter) && (!keyword || [item.title, item.subject, item.author].some((field) => field.includes(keyword))));
    }, [filter, query]);

    const toggleLike = (id: string) =>
        setLiked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const resetFilters = () => {
        setQuery("");
        setFilter(ALL);
    };

    let body;
    if (feedTab !== "recommend") {
        body = (
            <GammaEmptyState
                icon={<Sparkles />}
                title={feedTab === "following" ? "还没有关注的创作者" : "近期暂无活动"}
                description="去推荐里逛逛，关注喜欢的作者"
                action={
                    <GammaButton size="sm" variant="soft" onClick={() => setFeedTab("recommend")}>
                        回到推荐
                    </GammaButton>
                }
            />
        );
    } else if (!gallery.length) {
        body = (
            <GammaEmptyState
                icon={<Search />}
                title="没有找到相关作品"
                description="换个关键词，或切换到「发现」看看全部作品"
                action={
                    <GammaButton size="sm" variant="soft" onClick={resetFilters}>
                        清空筛选
                    </GammaButton>
                }
            />
        );
    } else {
        body = (
            <div className={cn("columns-2 md:columns-3", compact ? "gap-3 lg:columns-4 xl:columns-5 2xl:columns-6 [&>*]:mb-3" : "gap-4 xl:columns-5")}>
                <AnimatePresence>
                    {gallery.map((item) => (
                        <GammaWorkCard
                            key={item.id}
                            cover={item.cover}
                            title={item.title}
                            author={item.author}
                            subject={item.subject}
                            likes={item.likes}
                            kind={item.kind}
                            tall={item.tall}
                            liked={liked.has(item.id)}
                            onLike={() => toggleLike(item.id)}
                            onOpen={() => onPreview({ src: item.cover, title: item.title })}
                            onRemix={() => onRemix(item.prompt, item.subjectSlug)}
                        />
                    ))}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <section id="plaza" aria-labelledby="plaza-title" className={cn("flex scroll-mt-20 flex-col", compact ? "gap-2.5" : "gap-4")}>
            {/* 紧凑模式（可灵版式）：去掉标题块，标题只给读屏 */}
            <div className={compact ? "sr-only" : undefined}>
                <h2 id="plaza-title" className="text-lg font-semibold">
                    作品广场
                </h2>
                <p className="mt-1 text-[13px] text-[var(--gm-text-3)]">来自 12 个专业的同学作品，喜欢就「做同款」</p>
            </div>
            <div className={cn("flex flex-wrap items-center", compact ? "gap-3" : "gap-4")}>
                <GammaTabs label="广场分类" options={FEED_TABS} value={feedTab} onChange={setFeedTab} />
                <span aria-hidden className="h-6 w-px bg-[var(--gm-border-strong)]" />
                <label
                    className={cn(
                        "flex w-80 items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 ring-1 ring-[var(--gm-border)] transition-shadow focus-within:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus-within:ring-[var(--gm-accent)]",
                        compact ? "h-9" : "h-10",
                    )}
                >
                    <Search className="size-4 text-[var(--gm-text-3)]" />
                    <span className="sr-only">搜索作品</span>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品、专业、作者" className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--gm-text-3)]" />
                </label>
                <GammaButton className="ml-auto" variant="outline" size={compact ? "sm" : "md"} onClick={() => onNotice("发布功能即将上线")}>
                    发布作品
                </GammaButton>
            </div>
            <div className={cn("flex gap-2", compact ? "hide-scrollbar flex-nowrap overflow-x-auto" : "flex-wrap")} role="group" aria-label="按专业筛选">
                <GammaChip active={filter === ALL} onClick={() => setFilter(ALL)}>
                    发现
                </GammaChip>
                {GAMMA_SUBJECTS.map((item) => (
                    <GammaChip key={item.slug} active={filter === item.slug} onClick={() => setFilter(item.slug)}>
                        {item.name}
                    </GammaChip>
                ))}
            </div>
            {body}
        </section>
    );
}
