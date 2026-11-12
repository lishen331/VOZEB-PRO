"use client";

import { useState } from "react";
import useSWR from "swr";

import type { AdminSuccessRateGroup, AdminSuccessRatePanel, SuccessRateRange } from "@/lib/admin-generation-overview";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { Segmented } from "@/components/gamma-ui/gamma-ant";

const RANGE_OPTIONS: Array<{ label: string; value: SuccessRateRange }> = [
    { label: "1 天", value: "1d" },
    { label: "7 天", value: "7d" },
    { label: "1 个月", value: "30d" },
];

/** 经营看板的生成成功率：按类型 / 渠道 / 平台看成功率，切时间窗只重取这一块。 */
export function AdminSuccessRatePanel() {
    const [range, setRange] = useState<SuccessRateRange>("7d");
    const { data, isLoading } = useSWR<{ data?: AdminSuccessRatePanel }>(`/api/admin/generation-overview?range=${range}`, (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json()), {
        revalidateOnFocus: false,
    });
    const panel = data?.data;
    const channelsNote = panel?.channelsMerged ? `另有 ${panel.channelsMerged} 个渠道并入「其他」` : undefined;

    return (
        <Panel>
            <PanelHeader title="生成成功率" description="成功率只统计已结束的调用（成功 + 失败），生成中的任务单独列出；按上海自然日对齐。" actions={<Segmented<SuccessRateRange> size="small" value={range} options={RANGE_OPTIONS} onChange={setRange} />} />
            <div className="grid gap-3 p-3 sm:gap-4 sm:p-5 lg:grid-cols-3">
                <SuccessRateBlock title="按类型" rows={panel?.kinds} loading={isLoading} emptyText="暂无调用" />
                <SuccessRateBlock title="按模型渠道" rows={panel?.channels} loading={isLoading} emptyText="暂无调用" footnote={channelsNote} />
                <SuccessRateBlock title="按平台" rows={panel?.profiles} loading={isLoading} emptyText="暂无调用" />
            </div>
            {panel?.topFailureReason ? (
                <div className="border-t border-[var(--gm-border)] px-3 py-2.5 text-[11px] text-[var(--gm-text-2)] sm:px-5 sm:text-xs">
                    失败最多：<span className="font-medium text-[var(--gm-text)]">{shortReason(panel.topFailureReason)}</span>
                    {panel.topFailureCount ? ` ×${panel.topFailureCount}` : ""}
                </div>
            ) : null}
        </Panel>
    );
}

function SuccessRateBlock({ title, rows, loading, emptyText, footnote }: { title: string; rows?: AdminSuccessRateGroup[]; loading: boolean; emptyText: string; footnote?: string }) {
    const items = (rows || []).filter((row) => row.settled + row.pending > 0);
    return (
        <section className="min-w-0 rounded-lg border border-[var(--gm-border)]">
            <div className="border-b border-[var(--gm-border)] px-3 py-2 text-xs font-medium text-[var(--gm-text-2)]">{title}</div>
            {loading && !rows ? (
                <div className="px-3 py-8 text-center text-xs text-[var(--gm-text-3)]">统计中…</div>
            ) : items.length ? (
                <div className="divide-y divide-[var(--gm-border)]">
                    {items.map((row) => (
                        <div key={row.label} className="px-3 py-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate font-medium text-[var(--gm-text)]">{row.label}</span>
                                <span className="shrink-0 tabular-nums font-semibold text-[var(--gm-text)]">{row.successRate === null ? "—" : `${row.successRate}%`}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[var(--gm-text-3)]">
                                <span>
                                    成功 {row.success} / {row.settled}
                                </span>
                                <span>失败 {row.failed}</span>
                                {row.pending ? <span>生成中 {row.pending}</span> : null}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="px-3 py-8 text-center text-xs text-[var(--gm-text-3)]">{emptyText}</div>
            )}
            {footnote ? <div className="border-t border-[var(--gm-border)] px-3 py-1.5 text-[10px] text-[var(--gm-text-3)]">{footnote}</div> : null}
        </section>
    );
}

/** 失败原因可能带着长堆栈，列表只给一行开头，详情仍以调用记录为准。 */
function shortReason(reason: string) {
    const [firstLine] = reason.split("\n");
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}
