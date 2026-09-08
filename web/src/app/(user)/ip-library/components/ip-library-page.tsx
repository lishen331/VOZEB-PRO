"use client";

import { App, Empty, Input, Pagination, Segmented, Spin } from "antd";
import { BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

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
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-ip-library-page>
            <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
                <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
                    <div className="min-w-0">
                        <h1 className="mt-1.5 text-2xl font-semibold tracking-normal sm:text-3xl">IP库</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">查看可用的 IP 内容，用于教学、练习和创作。</p>
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
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">共 {total} 项</span>
                    <Input
                        allowClear
                        value={keyword}
                        prefix={<Search className="size-4 text-muted-foreground" />}
                        placeholder="搜索 IP 名称或简介"
                        className="w-full sm:max-w-md"
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>

                {loading ? (
                    <div className="grid min-h-56 place-items-center">
                        <Spin />
                    </div>
                ) : items.length ? (
                    <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                        {items.map((item) => (
                            <IpLibraryCard key={item.id} item={item} />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={scope === "school" ? "本校暂未获得 IP 授权" : "暂无公共 IP"} className="!my-12" />
                )}

                {total > PAGE_SIZE ? <Pagination className="mt-6 flex justify-center" current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} /> : null}
            </div>
        </main>
    );
}

function IpLibraryCard({ item }: { item: IpSummary }) {
    return (
        <Link href={`/ip-library/${encodeURIComponent(item.id)}`} className="group min-w-0 overflow-hidden border border-border bg-card text-foreground transition hover:border-foreground/30 hover:shadow-sm" data-ip-library-card={item.id}>
            <div className="aspect-[4/3] overflow-hidden bg-muted/50">
                {item.coverPreviewUrl ? (
                    <img src={item.coverPreviewUrl} alt={item.title} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                ) : (
                    <BookOpen className="m-auto size-8 h-full text-muted-foreground/50" />
                )}
            </div>
            <div className="min-w-0 p-3">
                <h2 className="line-clamp-2 min-w-0 text-sm font-semibold leading-5">{item.title}</h2>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary || "暂无简介"}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.subIpCount > 1 ? `${item.subIpCount} 个子 IP` : "IP 内容"}</span>
                    <span>{item.accessibleSubIpCount && item.accessibleSubIpCount !== item.subIpCount ? `已授权 ${item.accessibleSubIpCount} 个` : "查看详情"}</span>
                </div>
            </div>
        </Link>
    );
}
