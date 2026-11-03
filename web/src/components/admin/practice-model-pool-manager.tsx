"use client";

import { useState, useEffect, useMemo } from "react";
import { Input, Segmented, Checkbox, Spin, message } from "@gamma-app/ui";
import { Search } from "lucide-react";
import type { LogicalModelCapability } from "@/lib/auth/store-types";

type PracticePoolCandidate = {
    upstreamModel: string;
    capability: LogicalModelCapability;
    channelId: string;
    channelName: string;
    purpose: string;
    inPool: boolean;
};

type PracticePoolStats = {
    total: number;
    inPool: number;
    text: number;
    image: number;
    video: number;
    audio: number;
};

type CandidatesResponse = {
    candidates: PracticePoolCandidate[];
    stats: PracticePoolStats;
};

const CAPABILITY_LABELS: Record<LogicalModelCapability, string> = {
    text: "文本",
    image: "图片",
    video: "视频",
    audio: "音频",
};

const CAPABILITY_COLORS: Record<LogicalModelCapability, string> = {
    text: "text",
    image: "image",
    video: "video",
    audio: "audio",
};

export function PracticeModelPoolManager() {
    const [loading, setLoading] = useState(true);
    const [candidates, setCandidates] = useState<PracticePoolCandidate[]>([]);
    const [stats, setStats] = useState<PracticePoolStats>({ total: 0, inPool: 0, text: 0, image: 0, video: 0, audio: 0 });
    const [capabilityFilter, setCapabilityFilter] = useState<"all" | LogicalModelCapability>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        fetchCandidates();
    }, []);

    async function fetchCandidates() {
        try {
            setLoading(true);
            const response = await fetch("/api/admin/practice-model-pool/candidates");
            if (!response.ok) throw new Error("Failed to fetch candidates");
            const data: CandidatesResponse = await response.json();
            setCandidates(data.candidates);
            setStats(data.stats);
        } catch (error) {
            message.error("加载练习模型池失败");
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleToggle(modelName: string, currentValue: boolean) {
        try {
            setUpdating(true);
            const response = await fetch("/api/admin/practice-model-pool", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates: { [modelName]: !currentValue } }),
            });
            if (!response.ok) throw new Error("Failed to update pool");

            // Update local state
            setCandidates(prev => prev.map(c =>
                c.upstreamModel === modelName ? { ...c, inPool: !currentValue } : c
            ));

            // Update stats
            setStats(prev => ({
                ...prev,
                inPool: prev.inPool + (currentValue ? -1 : 1),
            }));

            message.success("更新成功");
        } catch (error) {
            message.error("更新失败");
            console.error(error);
        } finally {
            setUpdating(false);
        }
    }

    const filteredCandidates = useMemo(() => {
        return candidates.filter(candidate => {
            const matchesCapability = capabilityFilter === "all" || candidate.capability === capabilityFilter;
            const matchesSearch = !searchQuery || candidate.upstreamModel.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCapability && matchesSearch;
        });
    }, [candidates, capabilityFilter, searchQuery]);

    if (loading) {
        return (
            <div className="mt-6 flex items-center justify-center py-12">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="mt-6 space-y-4">
            {/* Statistics Bar */}
            <div className="grid grid-cols-6 gap-3 rounded-lg bg-[var(--gm-bg-2)] p-4">
                <div className="text-center">
                    <div className="text-xs text-[var(--gm-text-3)]">总计</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--gm-text-1)]">{stats.total}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-[var(--gm-text-3)]">已选</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--gm-success)]">{stats.inPool}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-[var(--gm-text-3)]">文本</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--gm-text-1)]">{stats.text}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-[var(--gm-text-3)]">图片</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--gm-text-1)]">{stats.image}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-[var(--gm-text-3)]">视频</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--gm-text-1)]">{stats.video}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-[var(--gm-text-3)]">音频</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--gm-text-1)]">{stats.audio}</div>
                </div>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-3">
                <Segmented
                    value={capabilityFilter}
                    onChange={(value) => setCapabilityFilter(value as "all" | LogicalModelCapability)}
                    options={[
                        { label: "全部", value: "all" },
                        { label: "文本", value: "text" },
                        { label: "图片", value: "image" },
                        { label: "视频", value: "video" },
                        { label: "音频", value: "audio" },
                    ]}
                />
                <Input
                    placeholder="搜索模型名称"
                    prefix={<Search className="size-4 text-[var(--gm-text-3)]" />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                    allowClear
                />
            </div>

            {/* Model List */}
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-[var(--gm-border)] p-3">
                {filteredCandidates.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[var(--gm-text-3)]">
                        没有符合条件的模型
                    </div>
                ) : (
                    filteredCandidates.map((candidate) => (
                        <div
                            key={`${candidate.channelId}-${candidate.upstreamModel}`}
                            className="flex items-center gap-3 rounded-md border border-[var(--gm-border)] bg-[var(--gm-bg-1)] p-3 transition-colors hover:bg-[var(--gm-bg-2)]"
                        >
                            <Checkbox
                                checked={candidate.inPool}
                                onChange={() => handleToggle(candidate.upstreamModel, candidate.inPool)}
                                disabled={updating}
                            />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-[var(--gm-text-1)]">
                                        {candidate.upstreamModel}
                                    </span>
                                    <span
                                        className={`rounded px-1.5 py-0.5 text-xs font-medium capability-tag-${CAPABILITY_COLORS[candidate.capability]}`}
                                        style={{
                                            background: candidate.capability === "text"
                                                ? "rgba(59, 130, 246, 0.1)"
                                                : candidate.capability === "image"
                                                ? "rgba(147, 51, 234, 0.1)"
                                                : candidate.capability === "video"
                                                ? "rgba(236, 72, 153, 0.1)"
                                                : "rgba(34, 197, 94, 0.1)",
                                            color: candidate.capability === "text"
                                                ? "rgb(59, 130, 246)"
                                                : candidate.capability === "image"
                                                ? "rgb(147, 51, 234)"
                                                : candidate.capability === "video"
                                                ? "rgb(236, 72, 153)"
                                                : "rgb(34, 197, 94)",
                                        }}
                                    >
                                        {CAPABILITY_LABELS[candidate.capability]}
                                    </span>
                                </div>
                                <div className="mt-1 text-xs text-[var(--gm-text-3)]">
                                    {candidate.channelName}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Info Footer */}
            <div className="rounded-lg bg-[var(--gm-bg-2)] p-3 text-xs text-[var(--gm-text-3)]">
                <div className="font-medium text-[var(--gm-text-2)]">说明</div>
                <ul className="mt-2 space-y-1 pl-4">
                    <li>• 练习池模型供无限练习画布使用，用户请求 gamaimage / gamavideo / gamatext 时从池中随机选择</li>
                    <li>• 未显式配置的模型默认加入练习池（向后兼容）</li>
                    <li>• 取消勾选的模型将不会被练习画布使用</li>
                </ul>
            </div>
        </div>
    );
}

