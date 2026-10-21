"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Clock3, Crown, Hourglass, RotateCcw, ShieldAlert, Undo2, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { cn } from "@/lib/utils";

/*
 * 生成类特有状态（和计费 / 退款策略直接相关）：
 *   GammaQueueCard          排队：前面还有几位、预计开始时间，可取消
 *   GammaPartialResult      部分成功：4 张里 1 张失败，写清楚已退积分
 *   GammaModerationNotice   审核未通过：不展示图，说明原因与已退款，给出修改建议
 *   GammaInsufficientPoints 积分不足拦截：差多少、去充值 / 换便宜的模型
 *   GammaCostPreview        点生成前的消耗预告（本次 / 余额 / 生成后剩余）
 */

type Tone = "neutral" | "warning" | "danger" | "accent";

const TONE: Record<Tone, string> = {
    neutral: "ring-[var(--gm-border)] [--tone:var(--gm-text-2)]",
    accent: "ring-[var(--gm-accent-ring)] [--tone:var(--gm-accent)]",
    warning: "ring-[color-mix(in_srgb,var(--gm-warning)_40%,transparent)] [--tone:var(--gm-warning)]",
    danger: "ring-[color-mix(in_srgb,var(--gm-danger)_40%,transparent)] [--tone:var(--gm-danger)]",
};

function Shell({ tone = "neutral", icon, title, children, actions, className }: { tone?: Tone; icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode; className?: string }) {
    return (
        <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} className={cn("flex flex-col gap-3 rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-4 ring-1", TONE[tone], className)}>
            <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] text-[var(--tone)] [&_svg]:size-[18px]">{icon}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-semibold">{title}</p>
                    <div className="text-xs leading-relaxed text-[var(--gm-text-2)]">{children}</div>
                </div>
            </div>
            {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        </div>
    );
}

export function GammaQueueCard({ ahead, etaSeconds, onCancel }: { ahead: number; etaSeconds: number; onCancel?: () => void }) {
    const reduce = useReducedMotion();
    const minutes = Math.max(1, Math.round(etaSeconds / 60));
    const cancel = onCancel ? (
        <GammaButton size="sm" variant="ghost" onClick={onCancel}>
            取消并退回积分
        </GammaButton>
    ) : undefined;
    return (
        <Shell tone="accent" icon={<Hourglass />} title={`排队中 · 前面还有 ${ahead} 个任务`} actions={cancel}>
            预计 {minutes} 分钟内开始，可以先去做别的，完成后会通知你。
            {/* 排队点阵：每个点是一个前序任务，最右的亮点是你 */}
            <span className="mt-3 flex items-center gap-1.5" aria-hidden>
                {Array.from({ length: Math.min(ahead, 12) }, (_, index) => (
                    <motion.span key={index} className="size-2 rounded-full bg-[var(--gm-wash-heavy)]" animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity, delay: index * 0.12 }} />
                ))}
                {ahead > 12 ? <span className="text-[11px] text-[var(--gm-text-3)]">+{ahead - 12}</span> : null}
                <span className="ml-1 size-2.5 rounded-full bg-[var(--gm-accent)] shadow-[0_0_10px_var(--gm-accent)]" />
            </span>
        </Shell>
    );
}

export interface PartialCell {
    status: "done" | "failed";
    reason?: string;
}

export function GammaPartialResult({ cells, refund, onRetryFailed }: { cells: readonly PartialCell[]; refund: number; onRetryFailed?: () => void }) {
    const failed = cells.filter((cell) => cell.status === "failed").length;
    const retry = onRetryFailed ? (
        <GammaButton size="sm" variant="soft" icon={<RotateCcw className="size-4" />} onClick={onRetryFailed}>
            只重试失败的
        </GammaButton>
    ) : undefined;
    return (
        <Shell tone="warning" icon={<AlertTriangle />} title={`${cells.length - failed} 张成功，${failed} 张失败`} actions={retry}>
            失败的部分已退回 <b className="text-[var(--gm-text)]">{refund}</b> 积分，成功的已保存到素材库。
            <span className="mt-3 grid grid-cols-4 gap-2">
                {cells.map((cell, index) => (
                    <span
                        key={index}
                        className={cn(
                            "relative grid aspect-square place-items-center overflow-hidden rounded-[10px] text-[11px]",
                            cell.status === "done" ? "bg-[image:var(--gm-gradient)] text-white" : "border border-dashed border-[color-mix(in_srgb,var(--gm-danger)_50%,transparent)] bg-[var(--gm-wash)] text-[var(--gm-danger)]",
                        )}
                    >
                        {cell.status === "done" ? (
                            <Check className="size-4" />
                        ) : (
                            <span className="flex flex-col items-center gap-0.5 px-1 text-center">
                                <AlertTriangle className="size-3.5" />
                                {cell.reason ?? "失败"}
                            </span>
                        )}
                    </span>
                ))}
            </span>
        </Shell>
    );
}

export function GammaModerationNotice({ refund, hint, onEdit }: { refund: number; hint: string; onEdit?: () => void }) {
    const edit = onEdit ? (
        <GammaButton size="sm" onClick={onEdit}>
            修改提示词
        </GammaButton>
    ) : undefined;
    return (
        <Shell tone="danger" icon={<ShieldAlert />} title="内容未通过安全审核" actions={edit}>
            本次未生成图片，<b className="text-[var(--gm-text)]">{refund}</b> 积分已全额退回。
            <span className="mt-2 block rounded-[8px] bg-[var(--gm-wash)] px-2.5 py-2 text-[var(--gm-text)]">建议：{hint}</span>
        </Shell>
    );
}

export function GammaInsufficientPoints({ need, balance, onRecharge, onCheaper }: { need: number; balance: number; onRecharge?: () => void; onCheaper?: () => void }) {
    const actions = (
        <>
            {onCheaper ? (
                <GammaButton size="sm" variant="ghost" onClick={onCheaper}>
                    换用更省的模型
                </GammaButton>
            ) : null}
            {onRecharge ? (
                <GammaButton size="sm" icon={<Crown className="size-4" />} onClick={onRecharge}>
                    充值 / 升级
                </GammaButton>
            ) : null}
        </>
    );
    return (
        <Shell tone="warning" icon={<Zap />} title={`积分不足，还差 ${need - balance} 积分`} actions={actions}>
            本次需要 {need} 积分，当前余额 {balance}。每日签到可领 50 积分。
        </Shell>
    );
}

export function GammaCostPreview({ cost, balance, etaSeconds = 20, refundPolicy = "失败自动退回" }: { cost: number; balance: number; etaSeconds?: number; refundPolicy?: string }) {
    const after = balance - cost;
    const short = after < 0;
    return (
        <div className="inline-flex flex-wrap items-center gap-3 rounded-full bg-[var(--gm-wash)] py-1.5 pr-3 pl-1.5 text-xs ring-1 ring-[var(--gm-border)]">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--gm-accent-soft)] px-2 font-medium text-[var(--gm-accent)]">
                <Zap className="size-3 fill-current" />
                {cost}
            </span>
            <span className="text-[var(--gm-text-2)]">
                余额 {balance.toLocaleString()} → <b className={short ? "text-[var(--gm-danger)]" : "text-[var(--gm-text)]"}>{short ? "不足" : after.toLocaleString()}</b>
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--gm-text-3)]">
                <Undo2 className="size-3" />
                {refundPolicy}
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--gm-text-3)]">
                <Clock3 className="size-3" />约 {etaSeconds} 秒
            </span>
        </div>
    );
}
