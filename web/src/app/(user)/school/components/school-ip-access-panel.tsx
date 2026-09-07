"use client";

import { App, Button, Pagination, Tag } from "antd";
import { FolderTree, RefreshCw, ShieldCheck } from "lucide-react";
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
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">查看平台授予本校的 IP 与子 IP；有效授权会直接提供给管理员、教师和学生。</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新 IP 授权" onClick={() => void load()} />
            </div>
            <div className="grid gap-3">
                {items.map((item) => (
                    <article key={item.id} className="overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <FolderTree className="size-4 shrink-0 text-zinc-500" />
                                        <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{item.title}</h3>
                                        <Tag className="!m-0">{item.subIps.length} 个子 IP</Tag>
                                    </div>
                                    {item.summary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{item.summary}</p> : null}
                                </div>
                                <Tag color={item.effective ? "green" : item.ipStatus === "disabled" ? "default" : "gold"} className="!m-0 shrink-0">
                                    {item.effective ? "部分或全部已生效" : item.ipStatus === "disabled" ? "IP 已停用" : "暂无有效授权"}
                                </Tag>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800 sm:max-w-md">
                                <Fact label="IP 状态" value={item.ipStatus === "enabled" ? "已启用" : "已停用"} />
                                <Fact label="最近更新" value={formatDate(item.updatedAt)} />
                            </dl>
                            {item.ipStatus === "disabled" ? <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">IP 已停用，教师和学生暂不可访问。</p> : null}
                        </div>
                        <div className="border-t border-zinc-200 dark:border-zinc-800">
                            {item.subIps.map((subIp) => (
                                <section key={subIp.id} className="border-b border-zinc-100 px-4 py-4 last:border-b-0 dark:border-zinc-800 sm:px-5" aria-label={`${item.title} - ${subIp.title}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                                                <h4 className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{subIp.title}</h4>
                                                {subIp.grants.length > 1 ? <Tag className="!m-0">{subIp.grants.length} 条授权记录</Tag> : null}
                                            </div>
                                            {subIp.summary ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{subIp.summary}</p> : null}
                                        </div>
                                        <Tag color={subIp.effective ? "green" : statusColor(subIp.grants[0]?.status)} className="!m-0 shrink-0">
                                            {subIp.effective ? "已生效" : statusLabel(subIp.grants[0])}
                                        </Tag>
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {subIp.grants.map((grant) => (
                                            <div key={grant.id} className="min-w-0 border-l-2 border-zinc-200 pl-3 text-xs dark:border-zinc-700">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-700 dark:text-zinc-200">
                                                    <span>{ipAuthorizationLabel(grant.mode)}</span>
                                                    <span className="text-zinc-400">{periodLabel(grant.startsAt, grant.endsAt)}</span>
                                                </div>
                                                {!grant.effective ? <p className="mt-1 text-zinc-500">{statusLabel(grant)}</p> : null}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
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
function statusLabel(item?: SchoolIpAccessItem["subIps"][number]["grants"][number]) {
    if (!item) return "授权记录不可用";
    if (item.status === "suspended") return "授权已暂停";
    if (item.status === "revoked") return "授权已撤销";
    if (item.status === "expired" || (item.endsAt && Date.parse(item.endsAt) <= Date.now())) return "授权已到期";
    if (Date.parse(item.startsAt) > Date.now()) return "尚未生效";
    return "暂不可用";
}
function statusColor(status?: SchoolIpAccessItem["subIps"][number]["grants"][number]["status"]) {
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
