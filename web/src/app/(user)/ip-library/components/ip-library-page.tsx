"use client";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Pagination, Segmented } from "@/components/gamma-ui/gamma-ant";
import { GammaCardGridSkeleton } from "@/components/gamma-ui/gamma-data";
import { GammaReveal, useFirstEntry } from "@/components/gamma-ui/gamma-motion";
import { ArrowUpRight, BookOpen, LibraryBig, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import { CompactEmptyState } from "@/components/compact-empty-state";
import type { IpSummary } from "@/lib/server/ip-library-service";
import { ipLibraryApi } from "@/services/api/ip-library";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

const PAGE_SIZE = 12;
export type IpLibraryScope = "public" | "school";

export function availableIpLibraryScopes(hasSchool: boolean) {
    return hasSchool
        ? [
              { label: "公共 IP", value: "public" as const },
              { label: "本校 IP", value: "school" as const },
          ]
        : [{ label: "公共 IP", value: "public" as const }];
}

export default function IpLibraryPage() {
    const { message } = App.useApp();
    const context = useSchoolContextStore((state) => state.context);
    const hasSchool = context?.school.status === "active" && context.membership.status === "active";
    const [scope, setScope] = useState<IpLibraryScope>("public");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<IpSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const firstEntry = useFirstEntry(!loading);
    const deferredKeyword = useDeferredValue(keyword.trim());

    useEffect(() => {
        if (!hasSchool && scope === "school") setScope("public");
    }, [hasSchool, scope]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        void ipLibraryApi
            .list({ scope, page, pageSize: PAGE_SIZE, keyword: deferredKeyword || undefined })
            .then((result) => {
                if (!active) return;
                setItems(result.items);
                setTotal(result.total);
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : "IP 库加载失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [deferredKeyword, message, page, scope]);

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)] text-[var(--gm-text)]" data-ip-library-page>
            <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
                <header className="flex min-w-0 flex-col gap-3 border-b border-[var(--gm-border)] pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5 sm:pb-6">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-[var(--gm-text-3)]">
                            <LibraryBig className="size-4" />
                            授权内容资源
                        </div>
                        <h1 className="mt-1.5 text-xl font-semibold sm:mt-2 sm:text-2xl">IP 库</h1>
                        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--gm-text-3)] sm:mt-2 sm:text-sm">查看可用的 IP 内容，用于教学、练习和创作。</p>
                    </div>
                    <Segmented<IpLibraryScope>
                        value={scope}
                        options={availableIpLibraryScopes(Boolean(hasSchool))}
                        onChange={(value) => {
                            setScope(value);
                            setPage(1);
                        }}
                    />
                </header>

                <div className="mt-4 flex min-w-0 items-center justify-end gap-3 sm:mt-6">
                    <span className="shrink-0 text-xs tabular-nums text-[var(--gm-text-3)]">共 {total} 项</span>
                    <Input
                        allowClear
                        value={keyword}
                        prefix={<Search className="size-4 text-[var(--gm-text-3)]" />}
                        placeholder="搜索 IP 名称或简介"
                        className="w-full sm:max-w-md"
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>

                {loading ? (
                    <GammaCardGridSkeleton count={10} media="aspect-[4/3]" className="mt-4 min-w-0 grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" label="正在加载 IP 库" />
                ) : items.length ? (
                    <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                        {items.map((item, index) => (
                            <GammaReveal key={item.id} index={index} animate={firstEntry} className="grid min-w-0">
                                <IpLibraryCard item={item} />
                            </GammaReveal>
                        ))}
                    </div>
                ) : (
                    <CompactEmptyState
                        title={deferredKeyword ? "没有匹配的 IP" : scope === "school" ? "本校暂未获得 IP 授权" : "暂无公共 IP"}
                        description={deferredKeyword ? "换个关键词再试试。" : "获得授权的 IP 内容会出现在这里。"}
                        icon={<LibraryBig className="size-4" />}
                        className="mt-3 min-h-24 sm:mt-6 sm:min-h-40"
                    />
                )}

                {total > PAGE_SIZE ? <Pagination className="mt-6 flex justify-center" current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} /> : null}
            </div>
        </main>
    );
}

function IpLibraryCard({ item }: { item: IpSummary }) {
    return (
        <Link
            href={`/ip-library/${encodeURIComponent(item.id)}`}
            className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] text-[var(--gm-text)] outline-none transition hover:-translate-y-px hover:border-[var(--gm-border-strong)] hover:shadow-[var(--gm-shadow)] focus-visible:border-[var(--gm-accent)] focus-visible:ring-2 focus-visible:ring-[var(--gm-accent-ring)]"
            data-ip-library-card={item.id}
        >
            <div className="aspect-[4/3] overflow-hidden border-b border-[var(--gm-border)] bg-[var(--gm-wash)]">
                {item.coverPreviewUrl ? (
                    <img src={item.coverPreviewUrl} alt={item.title} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                ) : (
                    <BookOpen className="m-auto size-8 h-full text-[var(--gm-text-3)]/50" />
                )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col p-3">
                <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 min-w-0 text-sm font-semibold leading-5 sm:text-[15px]">{item.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--gm-text-3)]">{item.summary || "暂无简介"}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--gm-border)] pt-2.5 text-xs text-[var(--gm-text-3)]">
                    <span className="truncate">{item.subIpCount > 1 ? `${item.subIpCount} 个子 IP` : "IP 内容"}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 transition group-hover:text-[var(--gm-text)]">
                        {item.accessibleSubIpCount && item.accessibleSubIpCount !== item.subIpCount ? `已授权 ${item.accessibleSubIpCount} 个` : "查看详情"}
                        <ArrowUpRight className="size-3.5" />
                    </span>
                </div>
            </div>
        </Link>
    );
}
