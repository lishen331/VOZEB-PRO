"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Plus, RefreshCcw, Search } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaErrorPage, type GammaErrorCode } from "@/components/gamma-ui/gamma-error-page";
import { GammaCostPreview, GammaInsufficientPoints, GammaModerationNotice, GammaPartialResult, GammaQueueCard } from "@/components/gamma-ui/gamma-generation-states";
import { GammaCourseGridSkeleton, GammaListSkeleton, GammaMasonrySkeleton, GammaPrepSkeleton } from "@/components/gamma-ui/gamma-skeletons";
import { GammaStateView, type GammaStateKind } from "@/components/gamma-ui/gamma-state-views";
import { cn } from "@/lib/utils";

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col gap-3 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]", className)}>
            <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {hint ? <p className="mt-0.5 text-xs text-[var(--gm-text-3)]">{hint}</p> : null}
            </div>
            {children}
        </div>
    );
}

const STATES: { kind: GammaStateKind; label: string; action?: ReactNode }[] = [
    {
        kind: "first-use",
        label: "首次使用",
        action: (
            <GammaButton size="sm" icon={<Plus className="size-4" />}>
                开始第一个作品
            </GammaButton>
        ),
    },
    {
        kind: "no-results",
        label: "搜索无结果",
        action: (
            <GammaButton size="sm" variant="ghost" icon={<Search className="size-4" />}>
                清空搜索
            </GammaButton>
        ),
    },
    {
        kind: "filtered",
        label: "筛选为空",
        action: (
            <GammaButton size="sm" variant="ghost">
                清空筛选
            </GammaButton>
        ),
    },
    {
        kind: "no-permission",
        label: "无权限",
        action: (
            <GammaButton size="sm" variant="soft">
                联系管理员
            </GammaButton>
        ),
    },
    {
        kind: "error",
        label: "加载失败",
        action: (
            <GammaButton size="sm" icon={<RefreshCcw className="size-4" />}>
                重试
            </GammaButton>
        ),
    },
    { kind: "offline", label: "离线" },
];

const SKELETONS = { course: "课程卡", masonry: "作品瀑布流", prep: "备课三栏", list: "列表" } as const;
type SkeletonKey = keyof typeof SKELETONS;

const ERRORS: GammaErrorCode[] = ["403", "404", "500", "maintenance"];

/** 极端数据：长标题 / 大数字 / 零值，看卡片会不会被撑破 */
function EdgeCases() {
    const rows = [
        { title: "AIGC + 室内设计全流程实训：从市场调研到 A1 竞赛展板的七步完整方案（2026 秋季毕设班专用）", points: 1234567, works: 0, badge: "官方课程" },
        { title: "短", points: 0, works: 99999, badge: "校本" },
    ];
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
                <div key={row.title} className="flex min-w-0 flex-col gap-2 rounded-[var(--gm-radius-lg)] bg-[var(--gm-wash)] p-4 ring-1 ring-[var(--gm-border)]">
                    <span className="w-fit rounded-full bg-[var(--gm-blue)] px-2 py-0.5 text-[11px] text-white">{row.badge}</span>
                    {/* 两行截断 + title 提示全文 */}
                    <p title={row.title} className="line-clamp-2 text-sm font-semibold break-words">
                        {row.title}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-[var(--gm-text-2)]">
                        <span className="tabular-nums">积分 {row.points >= 10000 ? `${(row.points / 10000).toFixed(row.points >= 1e6 ? 0 : 1)} 万` : row.points.toLocaleString()}</span>
                        <span className="tabular-nums">作品 {row.works === 0 ? "暂无" : row.works > 9999 ? "9999+" : row.works}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function DesignStateSpecs({ onNotice }: { onNotice: (message: string) => void }) {
    const [skeleton, setSkeleton] = useState<SkeletonKey>("course");
    const [error, setError] = useState<GammaErrorCode>("404");

    return (
        <div className="flex flex-col gap-4">
            <Panel title="空 / 异常状态" hint="六种情况各有插画与文案；规则：说清楚发生了什么 → 为什么 → 下一步做什么">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {STATES.map((item) => (
                        <div key={item.kind} className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-[var(--gm-text-3)]">{item.label}</span>
                            <GammaStateView kind={item.kind} size="sm" actions={item.action} traceId={item.kind === "error" ? "BG-7F3A-2210" : undefined} />
                        </div>
                    ))}
                </div>
            </Panel>

            <Panel title="生成类状态" hint="与计费直接相关：每个异常都说清楚退了多少积分、下一步怎么办">
                <div className="grid gap-3 lg:grid-cols-2">
                    <GammaQueueCard ahead={7} etaSeconds={150} onCancel={() => onNotice("已取消，积分已退回（演示）")} />
                    <GammaPartialResult cells={[{ status: "done" }, { status: "done" }, { status: "failed", reason: "超时" }, { status: "done" }]} refund={12} onRetryFailed={() => onNotice("已重新提交失败的 1 张（演示）")} />
                    <GammaModerationNotice refund={48} hint="去掉真实人物姓名，改成「一位年轻设计师」这类描述" onEdit={() => onNotice("回到提示词编辑（演示）")} />
                    <GammaInsufficientPoints need={200} balance={86} onRecharge={() => onNotice("去充值（演示）")} onCheaper={() => onNotice("已切换到 Seedream 4（演示）")} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] text-[var(--gm-text-3)]">点生成前的消耗预告</span>
                    <GammaCostPreview cost={48} balance={2680} />
                    <GammaCostPreview cost={200} balance={86} etaSeconds={90} />
                </div>
            </Panel>

            <Panel title="骨架屏" hint="按页面真实形状占位，内容加载完成时位置不跳动">
                <div role="tablist" aria-label="骨架屏类型" className="flex gap-1.5">
                    {(Object.keys(SKELETONS) as SkeletonKey[]).map((key) => (
                        <button key={key} type="button" role="tab" aria-selected={skeleton === key} onClick={() => setSkeleton(key)} className={cn("h-8 rounded-full px-3 text-xs ring-1 transition-colors", skeleton === key ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-[var(--gm-accent-ring)]" : "ring-[var(--gm-border)] hover:bg-[var(--gm-wash)]")}>
                            {SKELETONS[key]}
                        </button>
                    ))}
                </div>
                {skeleton === "course" ? <GammaCourseGridSkeleton /> : skeleton === "masonry" ? <GammaMasonrySkeleton /> : skeleton === "prep" ? <GammaPrepSkeleton /> : <GammaListSkeleton />}
            </Panel>

            <Panel title="错误页" hint="403 / 404 / 500 / 维护中；500 附带追踪编号，方便用户反馈">
                <div role="tablist" aria-label="错误页类型" className="flex gap-1.5">
                    {ERRORS.map((code) => (
                        <button key={code} type="button" role="tab" aria-selected={error === code} onClick={() => setError(code)} className={cn("h-8 rounded-full px-3 font-mono text-xs ring-1 transition-colors", error === code ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-[var(--gm-accent-ring)]" : "ring-[var(--gm-border)] hover:bg-[var(--gm-wash)]")}>
                            {code === "maintenance" ? "维护中" : code}
                        </button>
                    ))}
                </div>
                <div className="overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-bg)] ring-1 ring-[var(--gm-border)]">
                    <GammaErrorPage
                        key={error}
                        code={error}
                        compact
                        traceId={error === "500" ? "BG-500-91C2" : undefined}
                        actions={
                            <>
                                <GammaButton size="sm" variant="ghost">
                                    返回上一页
                                </GammaButton>
                                <GammaButton size="sm">{error === "500" ? "重新加载" : "回到首页"}</GammaButton>
                            </>
                        }
                    />
                </div>
            </Panel>

            <Panel title="极端数据" hint="40 字标题两行截断、7 位积分换算成「万」、0 作品写「暂无」、过万写 9999+">
                <EdgeCases />
            </Panel>
        </div>
    );
}
