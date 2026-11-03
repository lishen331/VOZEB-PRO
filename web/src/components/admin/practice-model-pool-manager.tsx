"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Checkbox, Spin } from "@/components/gamma-ui/gamma-ant";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Search } from "lucide-react";
import type { LogicalModelCapability, PracticePoolKind } from "@/lib/auth/store-types";

type PracticePoolCandidate = {
    upstreamModel: string;
    modelKey: string;
    capability: LogicalModelCapability;
    supportsImageInput: boolean;
    channelId: string;
    channelName: string;
    purpose: string;
    inPool: boolean;
};

type PoolStats = { total: number; inPool: number };
type CandidatesResponse = { pools: Record<PracticePoolKind, PracticePoolCandidate[]>; stats: Record<PracticePoolKind, PoolStats> };

const POOLS: Array<{ kind: PracticePoolKind; label: string; hint: string; emptyHint: string }> = [
    { kind: "text", label: "文本", hint: "练习画布 gamatext 从这里随机选", emptyHint: "打开某个文本渠道的「无限练习」开关后即可出现" },
    {
        kind: "vision",
        label: "文本 · 图片理解",
        hint: "只收声明了图片输入的文本模型；带图请求走这里",
        emptyHint: "文本渠道里还没有声明「支持图片输入」的模型，可在逻辑模型 → 路由设置里勾选",
    },
    { kind: "image", label: "图片", hint: "练习画布 gamaimage 从这里随机选", emptyHint: "打开某个图片渠道的「无限练习」开关后即可出现" },
    { kind: "video", label: "视频", hint: "练习画布 gamavideo 从这里随机选", emptyHint: "打开某个视频渠道的「无限练习」开关后即可出现" },
    { kind: "audio", label: "音频", hint: "配音 / 音乐模块从这里取模型", emptyHint: "打开某个音频渠道的「无限练习」开关后即可出现" },
];

export function PracticeModelPoolManager() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(true);
    const [pools, setPools] = useState<CandidatesResponse["pools"]>({ text: [], vision: [], image: [], video: [], audio: [] });
    const [stats, setStats] = useState<CandidatesResponse["stats"]>({
        text: { total: 0, inPool: 0 },
        vision: { total: 0, inPool: 0 },
        image: { total: 0, inPool: 0 },
        video: { total: 0, inPool: 0 },
        audio: { total: 0, inPool: 0 },
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [updating, setUpdating] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/admin/practice-model-pool/candidates");
            if (!response.ok) throw new Error("Failed to fetch candidates");
            const data: CandidatesResponse = await response.json();
            setPools(data.pools);
            setStats(data.stats);
        } catch (error) {
            message.error("加载练习模型池失败");
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        void load();
    }, [load]);

    const save = useCallback(
        async (pool: PracticePoolKind, modelKey: string, included: boolean) => {
            try {
                setUpdating(true);
                const response = await fetch("/api/admin/practice-model-pool", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pool, updates: { [modelKey]: included } }),
                });
                if (!response.ok) throw new Error("Failed to update pool");
                setPools((prev) => ({
                    ...prev,
                    [pool]: prev[pool].map((candidate) => (candidate.modelKey === modelKey ? { ...candidate, inPool: included } : candidate)),
                }));
                setStats((prev) => ({ ...prev, [pool]: { ...prev[pool], inPool: prev[pool].inPool + (included ? 1 : -1) } }));
                message.success("更新成功");
            } catch (error) {
                message.error("更新失败");
                console.error(error);
            } finally {
                setUpdating(false);
            }
        },
        [message],
    );

    const filtered = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return Object.fromEntries(
            POOLS.map(({ kind }) => [kind, query ? pools[kind].filter((candidate) => candidate.upstreamModel.toLowerCase().includes(query) || candidate.channelName.toLowerCase().includes(query)) : pools[kind]]),
        ) as CandidatesResponse["pools"];
    }, [pools, searchQuery]);

    if (loading) {
        return (
            <div className="mt-6 flex items-center justify-center py-12">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="mt-6 space-y-4">
            <Input
                placeholder="搜索模型名称或渠道（同时过滤五个池）"
                prefix={<Search className="size-4 text-[var(--gm-text-3)]" />}
                value={searchQuery}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
                allowClear
            />

            {POOLS.map(({ kind, label, hint, emptyHint }) => {
                const rows = filtered[kind];
                const poolStats = stats[kind];
                const checkedCount = rows.filter((row) => row.inPool).length;
                const allChecked = rows.length > 0 && checkedCount === rows.length;
                return (
                    <section key={kind} className="rounded-lg border border-[var(--gm-border)]">
                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--gm-border)] px-3 py-2.5">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-[var(--gm-text)]">{label}</span>
                                    <span className="rounded bg-[var(--gm-bg-2)] px-1.5 py-0.5 text-xs text-[var(--gm-text-3)]">
                                        已选 {poolStats.inPool} / 共 {poolStats.total}
                                    </span>
                                </div>
                                <div className="mt-1 text-xs text-[var(--gm-text-3)]">{hint}</div>
                            </div>
                            {rows.length > 0 ? (
                                <Checkbox
                                    checked={allChecked}
                                    indeterminate={checkedCount > 0 && !allChecked}
                                    disabled={updating}
                                    onChange={(event) => {
                                        const target = event.target.checked;
                                        rows.filter((row) => row.inPool !== target).forEach((row) => void save(kind, row.modelKey, target));
                                    }}
                                >
                                    全选
                                </Checkbox>
                            ) : null}
                        </header>
                        <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                            {rows.length === 0 ? (
                                <div className="py-6 text-center text-xs text-[var(--gm-text-3)]">{searchQuery ? "没有匹配的模型" : emptyHint}</div>
                            ) : (
                                rows.map((candidate) => (
                                    <div key={`${candidate.channelId}-${candidate.modelKey}`} className="flex items-center gap-3 rounded-md border border-[var(--gm-border)] bg-[var(--gm-bg-1)] p-2.5 transition-colors hover:bg-[var(--gm-bg-2)]">
                                        <Checkbox checked={candidate.inPool} disabled={updating} onChange={() => void save(kind, candidate.modelKey, !candidate.inPool)} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="truncate text-sm font-medium text-[var(--gm-text)]">{candidate.upstreamModel}</span>
                                                {kind === "vision" && candidate.supportsImageInput ? <span className="rounded bg-[rgba(147,51,234,0.1)] px-1.5 py-0.5 text-xs text-[rgb(147,51,234)]">可看图</span> : null}
                                            </div>
                                            <div className="mt-0.5 truncate text-xs text-[var(--gm-text-3)]">{candidate.channelName}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                );
            })}

            <div className="rounded-lg bg-[var(--gm-bg-2)] p-3 text-xs text-[var(--gm-text-3)]">
                <div className="font-medium text-[var(--gm-text-2)]">说明</div>
                <ul className="mt-2 space-y-1 pl-4">
                    <li>• 五个池子各自独立：取消某个池的勾选只影响该池，不影响渠道本身和其他池</li>
                    <li>• 「文本 · 图片理解」是文本池的子集，只收声明了图片输入的模型；带图的文本请求走这个池</li>
                    <li>• 练习画布请求 gamatext / gamaimage / gamavideo 时，从对应池里已勾选的模型中随机选择</li>
                    <li>• 未显式配置的模型默认在池中（向后兼容旧配置）</li>
                </ul>
            </div>
        </div>
    );
}
