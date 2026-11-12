"use client";

import { useState } from "react";
import useSWR from "swr";

import type { AdminSuccessRateGroup, AdminSuccessRatePanel, SuccessRateRange } from "@/lib/admin-generation-overview";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { Segmented } from "@/components/gamma-ui/gamma-ant";
import { Select } from "@/components/gamma-ui/gamma-ant-select";

type SuccessRateDimension = "kinds" | "channels" | "profiles";

const RANGE_OPTIONS: Array<{ label: string; value: SuccessRateRange }> = [
    { label: "1 天", value: "1d" },
    { label: "7 天", value: "7d" },
    { label: "1 个月", value: "30d" },
];

const DIMENSION_OPTIONS: Array<{ label: string; value: SuccessRateDimension }> = [
    { label: "按类型", value: "kinds" },
    { label: "按模型渠道", value: "channels" },
    { label: "按平台", value: "profiles" },
];

/**
 * 经营看板的生成成功率：数据与「调用记录」同源（generation_logs），
 * 右上角选维度和时间窗，左边环形图显示该维度总成功率，右边逐项列出。
 */
export function AdminSuccessRatePanel() {
    const [range, setRange] = useState<SuccessRateRange>("7d");
    const [dimension, setDimension] = useState<SuccessRateDimension>("kinds");
    const { data, isLoading } = useSWR<{ data?: AdminSuccessRatePanel }>(`/api/admin/generation-overview?range=${range}`, (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json()), {
        revalidateOnFocus: false,
    });
    const panel = data?.data;
    const rows = (panel?.[dimension] || []).filter((row) => row.settled + row.pending > 0);
    const success = rows.reduce((sum, row) => sum + row.success, 0);
    const failed = rows.reduce((sum, row) => sum + row.failed, 0);
    const pending = rows.reduce((sum, row) => sum + row.pending, 0);
    const overall = success + failed ? Math.round((success / (success + failed)) * 100) : null;

    return (
        <Panel>
            <PanelHeader
                title="生成成功率"
                description="与调用记录同一数据源；成功率只算已结束的调用（成功 + 失败），生成中单独列出，按上海自然日对齐。"
                actions={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="block w-[128px]">
                            <Select<SuccessRateDimension> size="small" className="w-full" value={dimension} options={DIMENSION_OPTIONS} onChange={(value) => setDimension(value)} aria-label="成功率维度" />
                        </span>
                        <Segmented<SuccessRateRange> size="small" value={range} options={RANGE_OPTIONS} onChange={setRange} aria-label="成功率时间窗" />
                    </div>
                }
            />
            <div className="grid gap-3 p-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-5 sm:p-5">
                <div className="flex items-center justify-center">
                    <SuccessRateRing percent={overall} loading={isLoading && !panel} />
                </div>
                <div className="min-w-0 self-center">
                    {isLoading && !panel ? (
                        <div className="py-8 text-center text-xs text-[var(--gm-text-3)]">统计中…</div>
                    ) : rows.length ? (
                        <>
                            {rows.map((row, index) => (
                                <SuccessRateRow key={row.label} row={row} color={chartColor(index)} />
                            ))}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-3 text-[11px] tabular-nums text-[var(--gm-text-3)]">
                                <span>
                                    合计 成功 {success} / 失败 {failed}
                                </span>
                                {pending ? <span>生成中 {pending}</span> : null}
                                {dimension === "channels" && panel?.channelsMerged ? <span>另有 {panel.channelsMerged} 个渠道并入「其他」</span> : null}
                            </div>
                        </>
                    ) : (
                        <div className="py-8 text-center text-xs text-[var(--gm-text-3)]">暂无调用</div>
                    )}
                </div>
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

/** 环形图：绿色弧长 = 成功率，灰色为失败部分；中间是数字。 */
function SuccessRateRing({ percent, loading }: { percent: number | null; loading: boolean }) {
    const size = 150;
    const radius = 54;
    const stroke = 20;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const filled = percent === null ? 0 : (percent / 100) * circumference;
    return (
        <div className="relative size-32 sm:size-44">
            <svg className="size-full -rotate-90" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" style={{ color: "var(--admin-chart-track)" }} strokeWidth={stroke} />
                {filled > 0 ? (
                    <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" style={{ color: "var(--admin-chart-1)" }} strokeWidth={stroke} strokeDasharray={`${filled} ${Math.max(0, circumference - filled)}`} strokeLinecap="round" />
                ) : null}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                    <div className="text-lg font-semibold text-[var(--gm-text)] sm:text-2xl">{loading ? "…" : percent === null ? "—" : `${percent}%`}</div>
                    <div className="mt-1 text-[10px] text-[var(--gm-text-2)] sm:text-[11px]">总成功率</div>
                </div>
            </div>
        </div>
    );
}

function SuccessRateRow({ row, color }: { row: AdminSuccessRateGroup; color: string }) {
    return (
        <div className="min-w-0 border-b border-[var(--gm-border)] px-1 py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 truncate font-medium text-[var(--gm-text)]">{row.label}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-[var(--gm-text)]">{row.successRate === null ? "—" : `${row.successRate}%`}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--gm-text-3)]">
                <span>
                    成功 {row.success} / {row.settled}
                </span>
                <span>失败 {row.failed}</span>
                {row.pending ? <span>生成中 {row.pending}</span> : null}
            </div>
        </div>
    );
}

function chartColor(index: number) {
    return `var(--admin-chart-${(index % 6) + 1})`;
}

/** 失败原因可能带长堆栈，这里只给一行开头，详情仍以调用记录为准。 */
function shortReason(reason: string) {
    const [firstLine] = reason.split("\n");
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}
