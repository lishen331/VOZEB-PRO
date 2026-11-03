"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** 每个池里已勾选的模型键，供「默认模型」下拉过滤使用。 */
export type PracticePoolSelection = Record<PracticePoolKind, Set<string>>;

export function PracticeModelPoolManager({ onSelectionChange }: { onSelectionChange?: (selection: PracticePoolSelection) => void } = {}) {
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
    const [activeKind, setActiveKind] = useState<PracticePoolKind>("text");
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

    // 把「每个池里勾了哪些模型」上报给父组件，供「默认模型」下拉过滤。
    // 用 ref 持有回调，避免父组件传内联函数时反复触发。
    const selectionCallbackRef = useRef(onSelectionChange);
    selectionCallbackRef.current = onSelectionChange;
    const selection = useMemo(() => Object.fromEntries(POOLS.map(({ kind }) => [kind, new Set(pools[kind].filter((candidate) => candidate.inPool).map((candidate) => candidate.modelKey))])) as PracticePoolSelection, [pools]);
    useEffect(() => {
        selectionCallbackRef.current?.(selection);
    }, [selection]);

    if (loading) {
        return (
            <div className="mt-4 flex items-center justify-center py-8">
                <Spin size="large" />
            </div>
        );
    }

    const active = POOLS.find((pool) => pool.kind === activeKind) ?? POOLS[0];
    const activeRows = filtered[active.kind];
    const activeStats = stats[active.kind];
    const activeChecked = activeRows.filter((row) => row.inPool).length;
    const activeAllChecked = activeRows.length > 0 && activeChecked === activeRows.length;

    return (
        <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
                {POOLS.map(({ kind, label }) => {
                    const selected = kind === activeKind;
                    const count = stats[kind];
                    return (
                        <button
                            key={kind}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setActiveKind(kind)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                selected ? "border-[var(--gm-accent)] bg-[var(--gm-accent)]/10 text-[var(--gm-accent)]" : "border-[var(--gm-border)] text-[var(--gm-text-2)] hover:bg-[var(--gm-bg-2)]"
                            }`}
                        >
                            {label}
                            <span className={`rounded px-1 text-[11px] ${selected ? "bg-[var(--gm-accent)]/15" : "bg-[var(--gm-bg-2)] text-[var(--gm-text-3)]"}`}>
                                {count.inPool}/{count.total}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="min-w-0 flex-1"
                    placeholder={`在「${active.label}」里搜索模型或渠道`}
                    prefix={<Search className="size-4 text-[var(--gm-text-3)]" />}
                    value={searchQuery}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
                    allowClear
                />
                {activeRows.length > 0 ? (
                    <Checkbox
                        checked={activeAllChecked}
                        indeterminate={activeChecked > 0 && !activeAllChecked}
                        disabled={updating}
                        onChange={(event) => {
                            const target = event.target.checked;
                            activeRows.filter((row) => row.inPool !== target).forEach((row) => void save(active.kind, row.modelKey, target));
                        }}
                    >
                        全选
                    </Checkbox>
                ) : null}
            </div>

            <div className="text-xs text-[var(--gm-text-3)]">{active.hint}</div>

            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-[var(--gm-border)] p-2.5">
                {activeRows.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--gm-text-3)]">{searchQuery ? "没有匹配的模型" : active.emptyHint}</div>
                ) : (
                    activeRows.map((candidate) => (
                        <div key={`${candidate.channelId}-${candidate.modelKey}`} className="flex items-center gap-3 rounded-md border border-[var(--gm-border)] bg-[var(--gm-bg-1)] p-2.5 transition-colors hover:bg-[var(--gm-bg-2)]">
                            <Checkbox checked={candidate.inPool} disabled={updating} onChange={() => void save(active.kind, candidate.modelKey, !candidate.inPool)} />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-medium text-[var(--gm-text)]">{candidate.upstreamModel}</span>
                                    {active.kind === "vision" && candidate.supportsImageInput ? <span className="rounded bg-[rgba(147,51,234,0.1)] px-1.5 py-0.5 text-xs text-[rgb(147,51,234)]">可看图</span> : null}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-[var(--gm-text-3)]">{candidate.channelName}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="rounded-lg bg-[var(--gm-bg-2)] p-3 text-xs text-[var(--gm-text-3)]">
                <ul className="space-y-1 pl-4">
                    <li>• 五个池子各自独立：取消某个池的勾选只影响该池，不影响渠道本身和其他池</li>
                    <li>• 「文本 · 图片理解」是文本池的子集，只收声明了图片输入的模型；带图的文本请求走这个池</li>
                    <li>• 练习画布请求 gamatext / gamaimage / gamavideo 时，从对应池里已勾选的模型中随机选择</li>
                </ul>
            </div>
        </div>
    );
}
