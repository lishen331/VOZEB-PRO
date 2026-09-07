"use client";

import { App, Button, Pagination, Tag } from "antd";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ipAuthorizationLabel } from "@/lib/ip-library-domain";
import { schoolIpLibraryApi, type SchoolIpAccessItem } from "@/services/api/school-ip-library";

const PAGE_SIZE = 12;

export function SchoolIpAccessPanel() {
    const { message } = App.useApp();
    const [items, setItems] = useState<SchoolIpAccessItem[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await schoolIpLibraryApi.list({ page, pageSize: PAGE_SIZE });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "学校 IP 授权加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page]);
    useEffect(() => void load(), [load]);

    return (
        <section className="space-y-4 py-2" data-school-ip-access-panel>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-100">IP 授权</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">查看平台授予本校的子 IP；有效授权会直接提供给管理员、教师和学生。</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新 IP 授权" onClick={() => void load()} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                {items.map((item) => (
                    <article key={item.id} className="border border-zinc-200 p-4 dark:border-zinc-800">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <ShieldCheck className="size-4 shrink-0 text-zinc-500" />
                                    <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{item.title}</h3>
                                </div>
                                <p className="mt-1 truncate text-xs text-zinc-500">子 IP：{item.subIpTitle}</p>
                                {item.summary ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{item.summary}</p> : null}
                            </div>
                            <Tag color={item.effective ? "green" : statusColor(item.status)}>{item.effective ? "已生效" : statusLabel(item)}</Tag>
                        </div>
                        <dl className="mt-4 grid grid-cols-1 gap-3 border-y border-zinc-100 py-3 text-sm sm:grid-cols-2 dark:border-zinc-800">
                            <Fact label="授权类型" value={ipAuthorizationLabel(item.mode)} />
                            <Fact label="授权有效期" value={periodLabel(item.startsAt, item.endsAt)} />
                        </dl>
                        {item.ipStatus === "disabled" ? <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">IP 已停用，教师和学生暂不可访问。</p> : null}
                    </article>
                ))}
            </div>
            {!loading && !items.length ? <div className="py-12 text-center text-sm text-zinc-500">暂无平台授权的 IP</div> : null}
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />
        </section>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="mt-1 truncate text-sm text-zinc-800 dark:text-zinc-200" title={value}>
                {value}
            </dd>
        </div>
    );
}
function statusLabel(item: SchoolIpAccessItem) {
    if (item.ipStatus === "disabled") return "IP 已停用";
    if (item.status === "suspended") return "授权已暂停";
    if (item.status === "revoked") return "授权已撤销";
    if (item.status === "expired" || (item.endsAt && Date.parse(item.endsAt) <= Date.now())) return "授权已到期";
    if (Date.parse(item.startsAt) > Date.now()) return "尚未生效";
    return "暂不可用";
}
function statusColor(status: SchoolIpAccessItem["status"]) {
    return status === "suspended" ? "gold" : status === "active" ? "blue" : undefined;
}
function periodLabel(startsAt: string, endsAt?: string) {
    return `${formatDate(startsAt)} 至 ${endsAt ? formatDate(endsAt) : "长期"}`;
}
function formatDate(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(time);
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
