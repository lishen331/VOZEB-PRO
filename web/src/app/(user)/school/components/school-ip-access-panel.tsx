"use client";

import { App, Button, Pagination, Switch, Tag } from "antd";
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
    const [savingId, setSavingId] = useState<string>();

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

    const updateAccess = async (item: SchoolIpAccessItem, enabled: boolean) => {
        setSavingId(item.id);
        try {
            const updated = await schoolIpLibraryApi.updateMemberAccess(item.id, enabled);
            setItems((current) => current.map((value) => (value.id === item.id ? updated : value)));
            message.success(enabled ? "已向本校成员开放" : "已关闭本校成员访问");
        } catch (error) {
            message.error(errorMessage(error, "校内开放状态更新失败"));
        } finally {
            setSavingId(undefined);
        }
    };

    return (
        <section className="space-y-4 py-2" data-school-ip-access-panel>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-100">IP 开放</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">管理平台已授权给本校的整套 IP。</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新 IP 授权" onClick={() => void load()} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                {items.map((item) => (
                    <article key={item.id} className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <ShieldCheck className="size-4 shrink-0 text-zinc-500" />
                                    <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{item.title}</h3>
                                </div>
                                {item.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.summary}</p> : null}
                            </div>
                            <Tag color={item.effective ? "green" : statusColor(item.status)}>{item.effective ? "已生效" : statusLabel(item)}</Tag>
                        </div>
                        <dl className="mt-4 grid grid-cols-1 gap-3 border-y border-zinc-100 py-3 text-sm sm:grid-cols-2 dark:border-zinc-800">
                            <Fact label="授权类型" value={ipAuthorizationLabel(item.mode)} />
                            <Fact label="授权有效期" value={periodLabel(item.startsAt, item.endsAt)} />
                        </dl>
                        <div className="mt-3 flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">校内开放</div>
                                <div className="mt-0.5 text-xs text-zinc-500">整套开放给本校老师和学生</div>
                            </div>
                            <Switch
                                checked={item.memberAccessEnabled}
                                loading={savingId === item.id}
                                disabled={savingId !== undefined || item.status === "revoked" || item.status === "expired"}
                                aria-label={`${item.title}校内开放`}
                                onChange={(enabled) => void updateAccess(item, enabled)}
                            />
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

function statusLabel(item: SchoolIpAccessItem) {
    if (item.ipStatus !== "published") return "IP 已停用";
    if (item.status === "suspended") return "授权已暂停";
    if (item.status === "revoked") return "授权已撤销";
    if (item.status === "expired" || (item.endsAt && Date.parse(item.endsAt) <= Date.now())) return "授权已到期";
    if (Date.parse(item.startsAt) > Date.now()) return "尚未生效";
    return item.memberAccessEnabled ? "暂不可用" : "校内未开放";
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
