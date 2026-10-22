"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/*
 * 错误页：403 / 404 / 500 / 维护中。大号描边数字 + 背后流动光晕，文案说明原因与下一步。
 * 只负责版式，按钮由页面传入（返回首页、重试、联系管理员）。
 */

export type GammaErrorCode = "403" | "404" | "500" | "maintenance";

const COPY: Record<GammaErrorCode, { big: string; title: string; description: string }> = {
    "403": { big: "403", title: "没有访问权限", description: "这个页面需要老师或管理员身份，如果你认为是误判，请联系学校管理员开通。" },
    "404": { big: "404", title: "页面走丢了", description: "链接可能已经失效，或者内容已被作者删除。" },
    "500": { big: "500", title: "服务开了个小差", description: "我们已经收到报错并在处理，稍后刷新即可；你未保存的内容不会丢失。" },
    maintenance: { big: "升级中", title: "蓝色伽马正在升级", description: "预计 30 分钟内完成，升级期间生成任务会暂停排队，不会扣除积分。" },
};

export function GammaErrorPage({ code, actions, traceId, className, compact = false }: { code: GammaErrorCode; actions?: ReactNode; traceId?: string; className?: string; compact?: boolean }) {
    const reduce = useReducedMotion();
    const copy = COPY[code];
    const danger = code === "500";
    const bigSize = code === "maintenance" ? (compact ? "text-4xl" : "text-7xl") : compact ? "text-6xl" : "text-[120px]";
    return (
        <section aria-labelledby={`err-${code}`} className={cn("relative isolate flex flex-col items-center justify-center overflow-hidden text-center", compact ? "gap-2 px-6 py-10" : "min-h-[60vh] gap-3 px-6 py-20", className)}>
            <motion.span
                aria-hidden
                animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.35, 0.5, 0.35] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className={cn("absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]", compact ? "size-56" : "size-[420px]", danger ? "bg-[var(--gm-danger)]" : "bg-[var(--gm-blue)]")}
            />
            <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
                style={{
                    backgroundImage: "linear-gradient(var(--gm-text) 1px, transparent 1px), linear-gradient(90deg, var(--gm-text) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                    maskImage: "radial-gradient(circle at center, #000, transparent 70%)",
                }}
            />
            <motion.p
                aria-hidden
                initial={reduce ? false : { opacity: 0, y: 12, letterSpacing: "0.3em" }}
                animate={{ opacity: 1, y: 0, letterSpacing: "0.04em" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={cn("font-mono leading-none font-bold text-transparent [-webkit-text-stroke:1.5px_var(--gm-accent)]", bigSize)}
            >
                {copy.big}
            </motion.p>
            <h2 id={`err-${code}`} className={cn("font-semibold", compact ? "text-base" : "text-2xl")}>
                {copy.title}
            </h2>
            <p className={cn("max-w-md leading-relaxed text-[var(--gm-text-2)]", compact ? "text-xs" : "text-sm")}>{copy.description}</p>
            {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
            {traceId ? <p className="mt-1 font-mono text-[11px] text-[var(--gm-text-3)]">追踪编号 {traceId} · 反馈问题时附上它</p> : null}
        </section>
    );
}
