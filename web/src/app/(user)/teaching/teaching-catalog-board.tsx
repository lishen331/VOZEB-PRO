"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Layers, Lock, LockOpen, Paperclip, Search, Sparkles } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Pagination, Spin } from "@/components/gamma-ui/gamma-ant";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import type { SchoolCourseCatalogEntry } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";
import { TeachingCourseCover } from "./teaching-course-cover";
import { teachingCatalogCourseHref } from "./teaching-routes";

/*
 * 教学中心 · 备课大厅（L1 标签）：平台所有已上架课程都能浏览，
 * 本校没解锁的只给目录（章节/课时标题 + 资料文件名），管理员解锁后课程进入「备课」标签，老师可以直接备课。
 */

type Scope = "all" | "unlocked" | "locked";
const SCOPES: readonly { key: Scope; label: string }[] = [
    { key: "all", label: "全部课程" },
    { key: "unlocked", label: "本校已解锁" },
    { key: "locked", label: "待解锁" },
];
const PAGE_SIZE = 12;

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function CatalogCard({ item }: { item: SchoolCourseCatalogEntry }) {
    return (
        <li>
            <Link
                href={teachingCatalogCourseHref(item.id)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] text-left text-[var(--gm-text)] ring-1 ring-[var(--gm-border)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-accent-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
            >
                <span className="relative block aspect-[16/9] overflow-hidden">
                    <TeachingCourseCover seed={item.id} coverUrl={item.coverUrl} className="transition-transform duration-700 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    {item.category ? <span className="absolute top-3 left-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur">{item.category}</span> : null}
                    <span
                        className={
                            item.unlocked
                                ? "absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[var(--gm-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--gm-text)] shadow-sm"
                                : "absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"
                        }
                    >
                        {item.unlocked ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
                        {item.unlocked ? "已解锁" : "待解锁"}
                    </span>
                </span>
                <span className="flex flex-1 flex-col gap-2 p-4">
                    <span className="line-clamp-1 text-[15px] font-semibold">{item.title}</span>
                    <span className="line-clamp-2 min-h-[2.5em] text-xs leading-relaxed text-[var(--gm-text-3)]">{item.summary || "暂无课程简介"}</span>
                    <span className="mt-auto flex flex-wrap items-center gap-3 pt-1 text-xs text-[var(--gm-text-2)]">
                        <span className="inline-flex items-center gap-1">
                            <Layers className="size-3.5" />
                            {item.chapterCount} 章 · {item.lessonCount} 课时
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Paperclip className="size-3.5" />
                            {item.materialCount} 份资料
                        </span>
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
            message.error(errorMessage(error, "备课大厅加载失败"));
        } finally {
            if (requestId === listSequence.current) setLoading(false);
        }
    }, [keyword, message, page, scope]);

    useEffect(() => void load(), [load]);

    const unlockedCount = useMemo(() => items.filter((item) => item.unlocked).length, [items]);

    return (
        <div className="flex flex-col gap-5">
            <section className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                <div aria-hidden className="gm-aurora pointer-events-none absolute -top-20 right-8 size-56 rounded-full bg-[var(--gm-blue)] opacity-20 blur-3xl" />
                <h2 className="relative flex items-center gap-2 text-base font-semibold">
                    <Sparkles className="size-4 text-[var(--gm-accent)]" />
                    备课大厅
                </h2>
                <p className="relative mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--gm-text-2)]">这里是平台提供的全部教学资源。未解锁的课程可以查看章节目录和资料清单；学校管理员解锁后，课程会进入「备课」标签，老师就能直接使用里面的课件备课。</p>
                <p className="relative mt-2 text-xs text-[var(--gm-text-3)]">
                    当前页已解锁 {unlockedCount} / {items.length} 门 · 共 {total} 门课程可浏览
                </p>
            </section>

            <section className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label="解锁状态" className="flex rounded-full bg-[var(--gm-wash)] p-1 ring-1 ring-[var(--gm-border)]">
                    {SCOPES.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            aria-pressed={scope === item.key}
                            onClick={() => {
                                setScope(item.key);
                                setPage(1);
                            }}
                            className={
                                scope === item.key
                                    ? "h-8 rounded-full bg-[var(--gm-bg-elevated)] px-4 text-[13px] font-medium text-[var(--gm-text)] shadow-sm ring-1 ring-[var(--gm-border-strong)]"
                                    : "h-8 rounded-full px-4 text-[13px] text-[var(--gm-text-2)] transition-colors hover:text-[var(--gm-text)]"
                            }
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-full bg-[var(--gm-wash)] px-3.5 ring-1 ring-[var(--gm-border)] focus-within:ring-[var(--gm-accent)] sm:w-72">
                    <Search className="size-4 text-[var(--gm-text-3)]" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程" aria-label="搜索课程" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--gm-text-3)]" />
                </label>
            </section>

            {loading && !items.length ? (
                <div className="flex min-h-40 items-center justify-center">
                    <Spin />
                </div>
            ) : items.length ? (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
