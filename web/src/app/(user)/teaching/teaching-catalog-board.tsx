"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Layers, Lock, LockOpen, Paperclip, Search, Sparkles } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Pagination, Spin } from "@/components/gamma-ui/gamma-ant";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import type { SchoolCourseCatalogEntry } from "@/lib/school-domain";
import { cn } from "@/lib/utils";
import { coursesApi } from "@/services/api/courses";
import { TeachingCourseCover } from "./teaching-course-cover";
import { teachingCatalogCourseHref } from "./teaching-routes";

/*
 * 教学中心 · 课程中心（L1 标签）：平台所有已上架课程都能浏览，
 * 本校没解锁的只给目录（章节/课时标题 + 资料文件名），管理员解锁后课程进入「备课」标签，老师可以直接备课。
 * 卡片整块是液态玻璃：封面铺满整卡，文字压在底部渐变上，不再是「半张图 + 下面一大段字」。
 */

type Scope = "all" | "unlocked" | "locked";
const SCOPES: readonly { key: Scope; label: string }[] = [
    { key: "all", label: "全部课程" },
    { key: "unlocked", label: "本校已解锁" },
    { key: "locked", label: "待解锁" },
];
const PAGE_SIZE = 24;
/** 卡片上只留一句极短的话：截到最近的标点，绝不半句断开 */
const INTRO_MAX = 22;

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

/** 取简介的一句短话；超过上限就在标点处收尾，读起来是完整的 */
export function courseIntro(summary: string) {
    const text = summary.replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length <= INTRO_MAX) return text;
    const head = text.slice(0, INTRO_MAX);
    const cut = Math.max(head.lastIndexOf("，"), head.lastIndexOf(","), head.lastIndexOf("；"), head.lastIndexOf("、"), head.lastIndexOf("。"));
    return cut >= INTRO_MAX * 0.4 ? `${head.slice(0, cut)}…` : `${head}…`;
}

/** 指针位置写进 CSS 变量，给 gm-glass-spec 的跟随高光用 */
function trackSpecular(event: React.PointerEvent<HTMLElement>) {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--gm-gx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    node.style.setProperty("--gm-gy", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

function CatalogCard({ item }: { item: SchoolCourseCatalogEntry }) {
    const intro = courseIntro(item.summary);
    return (
        <li>
            <Link
                href={teachingCatalogCourseHref(item.id)}
                onPointerMove={trackSpecular}
                className="gm-glass gm-glass-sheen gm-glass-refract gm-glass-spec group relative isolate flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-[var(--gm-radius-lg)] text-[var(--gm-text)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-24px_rgba(2,6,20,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
            >
                {/* 封面铺满整张卡，下面压一层深色渐变保证文字可读 */}
                <span aria-hidden className="pointer-events-none absolute inset-0 -z-[2] overflow-hidden [clip-path:inset(0_round_var(--gm-radius-lg))]">
                    <TeachingCourseCover seed={item.id} coverUrl={item.coverUrl} className="transition-transform duration-700 group-hover:scale-[1.05]" />
                    <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,20,0.15)_0%,rgba(4,8,20,0)_34%,rgba(4,8,20,0.66)_74%,rgba(4,8,20,0.9)_100%)]" />
                </span>

                {/* 顶部角标 */}
                <span className="absolute inset-x-0 top-0 flex items-start gap-1.5 p-2.5">
                    {item.category ? <span className="gm-glass gm-glass-refract max-w-[52%] truncate rounded-full px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">{item.category}</span> : null}
                    <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md", item.unlocked ? "bg-white/90 text-[#0b1526]" : "bg-black/45 text-white ring-1 ring-white/25")}>
                        {item.unlocked ? <LockOpen className="size-2.5" /> : <Lock className="size-2.5" />}
                        {item.unlocked ? "已解锁" : "待解锁"}
                    </span>
                </span>

                {/* 底部信息：标题 + 一句完整介绍 + 统计，全部压在渐变上 */}
                <span className="relative flex flex-col gap-1 p-3 pt-8">
                    <span className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-white drop-shadow-[0_1px_6px_rgba(2,6,20,0.6)]">{item.title}</span>
                    {intro ? <span className="truncate text-[11px] leading-relaxed text-white/70">{intro}</span> : null}
                    <span className="mt-0.5 flex items-center gap-2.5 text-[10.5px] text-white/65 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                            <Layers className="size-3" />
                            {item.chapterCount} 章 · {item.lessonCount} 课时
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Paperclip className="size-3" />
                            {item.materialCount} 份
                        </span>
                        <ArrowUpRight className="ml-auto size-3.5 text-white/55 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
                    </span>
                </span>
            </Link>
        </li>
    );
}

export function TeachingCatalogBoard() {
    const { message } = App.useApp();
    const [scope, setScope] = useState<Scope>("all");
    const [query, setQuery] = useState("");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [items, setItems] = useState<SchoolCourseCatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const listSequence = useRef(0);

    // 输入框停顿 300ms 再查，避免每敲一个字打一次接口
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setKeyword(query.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    const load = useCallback(async () => {
        const requestId = ++listSequence.current;
        setLoading(true);
        try {
            const result = await coursesApi.listCourseCatalog({ page, pageSize: PAGE_SIZE, scope, keyword: keyword || undefined });
            if (requestId !== listSequence.current) return;
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            if (requestId !== listSequence.current) return;
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "课程中心加载失败"));
        } finally {
            if (requestId === listSequence.current) setLoading(false);
        }
    }, [keyword, message, page, scope]);

    useEffect(() => void load(), [load]);

    const unlockedCount = useMemo(() => items.filter((item) => item.unlocked).length, [items]);

    return (
        <div className="mx-auto w-full max-w-[1760px] flex flex-col gap-5">
            <section className="gm-glass gm-glass-sheen gm-glass-refract relative isolate overflow-hidden rounded-[var(--gm-radius-xl)] p-5">
                <div aria-hidden className="gm-aurora pointer-events-none absolute -top-24 right-6 size-60 rounded-full bg-[var(--gm-blue)] opacity-25 blur-3xl" />
                <h2 className="relative flex items-center gap-2 text-base font-semibold">
                    <Sparkles className="size-4 text-[var(--gm-accent)]" />
                    课程中心
                </h2>
                <p className="relative mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--gm-text-2)]">平台全部教学资源都在这里。点开课程可以看章节目录和资料清单；学校管理员解锁后，课程进入「备课」标签，老师可以直接用它备课。</p>
                <p className="relative mt-2 text-xs text-[var(--gm-text-3)] tabular-nums">
                    当前页已解锁 {unlockedCount} / {items.length} 门 · 共 {total} 门课程
                </p>
            </section>

            <section className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label="解锁状态" className="gm-glass gm-glass-refract flex rounded-full p-1">
                    {SCOPES.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            aria-pressed={scope === item.key}
                            onClick={() => {
                                setScope(item.key);
                                setPage(1);
                            }}
                            className={cn(
                                "h-8 rounded-full px-4 text-[13px] transition-colors",
                                scope === item.key ? "bg-[var(--gm-bg-elevated)] font-medium text-[var(--gm-text)] shadow-sm ring-1 ring-[var(--gm-border-strong)]" : "text-[var(--gm-text-2)] hover:text-[var(--gm-text)]",
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <label className="gm-glass gm-glass-refract ml-auto flex h-9 w-full items-center gap-2 rounded-full px-3.5 sm:w-72">
                    <Search className="size-4 text-[var(--gm-text-3)]" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程" aria-label="搜索课程" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--gm-text-3)]" />
                </label>
            </section>

            {loading && !items.length ? (
                <div className="flex min-h-40 items-center justify-center">
                    <Spin />
                </div>
            ) : items.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {items.map((item) => (
                        <CatalogCard key={item.id} item={item} />
                    ))}
                </ul>
            ) : (
                <GammaEmptyState
                    icon={<BookOpen />}
                    title={keyword ? "没有匹配的课程" : scope === "locked" ? "没有待解锁的课程" : "暂时没有可浏览的课程"}
                    description={keyword ? "换个关键词试试" : scope === "locked" ? "平台新上架的课程会出现在这里" : "等平台上架课程后，所有学校都能在这里浏览"}
                />
            )}

            {total > PAGE_SIZE ? <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} onChange={setPage} /> : null}
        </div>
    );
}
