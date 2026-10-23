"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { COMMERCIAL_ORDERS, type CommercialOrderItem, type CommercialOrderStatus } from "@/app/bluegamma/courses/teaching-workflow-data";

const STATUS_TONE: Record<CommercialOrderStatus, { label: string; tone: "blue" | "warning" | "success" | "neutral" }> = {
    assigned: { label: "待开始", tone: "neutral" },
    in_progress: { label: "制作中", tone: "blue" },
    submitted: { label: "待验收", tone: "warning" },
    revision_required: { label: "待修改", tone: "warning" },
    accepted: { label: "已验收", tone: "success" },
};

/**
 * 商单任务：对照线上 /teaching?tab=orders —— 列表 + 详情（制作要求/验收标准/参与学生/平台反馈）。
 * gamma-ui 没有抽屉组件，详情用 GammaModal 加宽模拟（线上是 Drawer，视觉形式不同但信息结构一致）。
 */
export function TeachingOrdersTab() {
    const [selected, setSelected] = useState<CommercialOrderItem | null>(null);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-[var(--gm-border)]">
                {COMMERCIAL_ORDERS.map((order) => {
                    const status = STATUS_TONE[order.status];
                    return (
                        <article key={order.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-sm font-medium text-[var(--gm-text)]">{order.title}</h3>
                                    <GammaBadge tone={status.tone}>{status.label}</GammaBadge>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--gm-text-3)]">{order.requirements}</p>
                                <p className="mt-1 text-xs text-[var(--gm-text-3)]">截止 {order.deadline}</p>
                            </div>
                            <GammaButton size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => setSelected(order)}>
                                查看任务
                            </GammaButton>
                        </article>
                    );
                })}
            </div>

            <GammaModal open={Boolean(selected)} title={selected?.title ?? "商单详情"} onClose={() => setSelected(null)} width={560}>
                {selected ? (
                    <div className="flex flex-col gap-4 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <GammaBadge tone={STATUS_TONE[selected.status].tone}>{STATUS_TONE[selected.status].label}</GammaBadge>
                            <span className="text-xs text-[var(--gm-text-3)]">截止 {selected.deadline}</span>
                        </div>
                        <section>
                            <h3 className="text-sm font-medium text-[var(--gm-text)]">制作要求</h3>
                            <p className="mt-1.5 leading-6 text-[var(--gm-text-2)]">{selected.requirements}</p>
                        </section>
                        <section>
                            <h3 className="text-sm font-medium text-[var(--gm-text)]">验收标准</h3>
                            <p className="mt-1.5 leading-6 text-[var(--gm-text-2)]">{selected.acceptanceCriteria}</p>
                        </section>
                        {selected.platformFeedback ? (
                            <section className="rounded-[var(--gm-radius)] bg-[color-mix(in_srgb,var(--gm-warning)_10%,transparent)] p-3">
                                <h3 className="text-sm font-medium text-[var(--gm-warning)]">平台反馈</h3>
                                <p className="mt-1.5 leading-6 text-[var(--gm-text-2)]">{selected.platformFeedback}</p>
                            </section>
                        ) : null}
                        <section className="border-t border-[var(--gm-border)] pt-3">
                            <h3 className="text-sm font-medium text-[var(--gm-text)]">参与学生</h3>
                            <div className="mt-2 flex flex-col divide-y divide-[var(--gm-border)]">
                                {selected.participants.map((person) => (
                                    <div key={person.name} className="flex items-center justify-between py-2">
                                        <span>{person.name}</span>
                                        <GammaBadge tone={person.submitted ? "success" : "neutral"}>{person.submitted ? "已交候选" : "待提交"}</GammaBadge>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                ) : null}
            </GammaModal>
        </div>
    );
}
