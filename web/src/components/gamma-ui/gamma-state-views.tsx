"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/*
 * 状态视图：六种空 / 异常状态，统一插画语言（细线 + 品牌蓝青光晕 + 一个强调色块）。
 * 文案原则：说清楚发生了什么、为什么、下一步做什么；不甩锅给用户，不用技术术语。
 */

export type GammaStateKind = "first-use" | "no-results" | "filtered" | "no-permission" | "error" | "offline";

const ART: Record<GammaStateKind, ReactNode> = {
    // 首次使用：空白画布上一支笔 + 星光
    "first-use": (
        <>
            <rect x="22" y="26" width="76" height="56" rx="10" className="gm-art-line" />
            <path d="M34 70l14-16 10 10 8-7 14 13" className="gm-art-line" />
            <circle cx="78" cy="42" r="5" className="gm-art-fill" />
            <path d="M92 18c0 5 2 7 7 7-5 0-7 2-7 7 0-5-2-7-7-7 5 0 7-2 7-7Z" className="gm-art-accent" />
        </>
    ),
    // 搜索无结果：放大镜里一个问号
    "no-results": (
        <>
            <circle cx="54" cy="50" r="24" className="gm-art-line" />
            <path d="m72 68 18 18" className="gm-art-line gm-art-thick" />
            <path d="M47 44a7 7 0 1 1 10 6c-2 1-3 3-3 5" className="gm-art-accent-line" />
            <circle cx="54" cy="62" r="1.8" className="gm-art-accent" />
        </>
    ),
    // 筛选后为空：漏斗 + 空托盘
    filtered: (
        <>
            <path d="M26 24h68l-26 30v22l-16 8V54Z" className="gm-art-line" />
            <path d="M40 34h40" className="gm-art-accent-line" />
            <rect x="30" y="90" width="60" height="6" rx="3" className="gm-art-fill" />
        </>
    ),
    // 无权限：锁 + 盾
    "no-permission": (
        <>
            <path d="M60 18 88 28v22c0 18-12 30-28 36-16-6-28-18-28-36V28Z" className="gm-art-line" />
            <rect x="48" y="48" width="24" height="18" rx="4" className="gm-art-fill" />
            <path d="M53 48v-5a7 7 0 0 1 14 0v5" className="gm-art-accent-line" />
        </>
    ),
    // 出错：断开的连线 + 闪电
    error: (
        <>
            <path d="M22 60h22M76 60h22" className="gm-art-line" />
            <circle cx="50" cy="60" r="6" className="gm-art-line" />
            <circle cx="70" cy="60" r="6" className="gm-art-line" />
            <path d="m62 30-8 16h10l-8 16" className="gm-art-accent-line" />
        </>
    ),
    // 离线：云 + 斜杠
    offline: (
        <>
            <path d="M38 76a16 16 0 0 1 2-32 22 22 0 0 1 42 6 13 13 0 0 1-2 26Z" className="gm-art-line" />
            <path d="m30 28 60 60" className="gm-art-accent-line gm-art-thick" />
        </>
    ),
};

export function GammaStateArt({ kind, size = 120, className }: { kind: GammaStateKind; size?: number; className?: string }) {
    const reduce = useReducedMotion();
    return (
        <motion.svg
            viewBox="0 0 120 110"
            width={size}
            height={(size * 110) / 120}
            aria-hidden
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn("gm-state-art overflow-visible", className)}
        >
            <ellipse cx="60" cy="102" rx="34" ry="4" className="gm-art-shadow" />
            {ART[kind]}
        </motion.svg>
    );
}

const COPY: Record<GammaStateKind, { title: string; description: string }> = {
    "first-use": { title: "还没有作品", description: "从一个专业开始，画布会一步步带你做完一整套方案" },
    "no-results": { title: "没有找到相关内容", description: "换个关键词，或者少输几个字试试" },
    filtered: { title: "当前筛选下没有内容", description: "放宽筛选条件，或者清空筛选看看全部" },
    "no-permission": { title: "暂无权限查看", description: "这部分内容需要老师或学校管理员开通，可以联系他们为你添加" },
    error: { title: "加载失败", description: "可能是网络波动，稍后重试即可；问题持续的话请联系我们" },
    offline: { title: "网络已断开", description: "已为你保留当前编辑内容，联网后会自动同步" },
};

export interface GammaStateViewProps {
    kind: GammaStateKind;
    title?: string;
    description?: ReactNode;
    actions?: ReactNode;
    /** 错误时附带的追踪编号，方便用户反馈 */
    traceId?: string;
    size?: "sm" | "md";
    framed?: boolean;
    className?: string;
}

export function GammaStateView({ kind, title, description, actions, traceId, size = "md", framed = true, className }: GammaStateViewProps) {
    const copy = COPY[kind];
    const alarming = kind === "error" || kind === "offline";
    return (
        <div
            role={alarming ? "alert" : "status"}
            className={cn(
                "relative flex flex-col items-center justify-center overflow-hidden text-center",
                size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-12",
                framed && "rounded-[var(--gm-radius-xl)] border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)]",
                className,
            )}
        >
            <span aria-hidden className={cn("gm-aurora pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded-full blur-3xl", alarming ? "bg-[var(--gm-danger)] opacity-[0.12]" : "bg-[var(--gm-blue)] opacity-20", size === "sm" ? "size-28" : "size-44")} />
            <GammaStateArt kind={kind} size={size === "sm" ? 84 : 120} className="relative" />
            <h3 className={cn("relative font-semibold", size === "sm" ? "text-sm" : "text-base")}>{title ?? copy.title}</h3>
            <p className={cn("relative max-w-sm leading-relaxed text-[var(--gm-text-2)]", size === "sm" ? "text-xs" : "text-[13px]")}>{description ?? copy.description}</p>
            {actions ? <div className="relative mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
            {traceId ? <p className="relative font-mono text-[11px] text-[var(--gm-text-3)]">追踪编号 {traceId}</p> : null}
        </div>
    );
}
