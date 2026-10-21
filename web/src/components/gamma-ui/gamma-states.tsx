"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, CircleDashed, Clock3, Heart, Loader2, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useGammaBurst } from "@/components/gamma-ui/gamma-burst";
import { GammaIconMorph } from "@/components/gamma-ui/gamma-icon-morph";
import { cn } from "@/lib/utils";

/*
 * 状态组件：本项目里生成任务、提交按钮、开关类图标的各种状态，统一外观和过渡。
 *   GammaStatusPill   任务状态徽标（排队 / 生成中 / 完成 / 失败 / 已退款 / 草稿）
 *   GammaStateButton  提交按钮：idle → loading → success / error，图标逐个形变过去
 *   GammaMorphToggle  两态图标按钮（收藏、播放暂停、静音……），切换时图标形变 + 可选粒子
 */

export type GammaTaskState = "draft" | "queued" | "running" | "done" | "failed" | "refunded";

const STATUS: Record<GammaTaskState, { label: string; icon: LucideIcon; tone: string; spin?: boolean; pulse?: boolean }> = {
    draft: { label: "草稿", icon: CircleDashed, tone: "bg-[var(--gm-wash)] text-[var(--gm-text-2)] ring-[var(--gm-border)]" },
    queued: { label: "排队中", icon: Clock3, tone: "bg-[var(--gm-wash)] text-[var(--gm-text)] ring-[var(--gm-border-strong)]", pulse: true },
    running: { label: "生成中", icon: Loader2, tone: "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-[var(--gm-accent-ring)]", spin: true },
    done: { label: "已完成", icon: Check, tone: "bg-[color-mix(in_srgb,var(--gm-success)_10%,transparent)] text-[var(--gm-success)] ring-[color-mix(in_srgb,var(--gm-success)_35%,transparent)]" },
    failed: { label: "失败", icon: AlertTriangle, tone: "bg-[color-mix(in_srgb,var(--gm-danger)_9%,transparent)] text-[var(--gm-danger)] ring-[color-mix(in_srgb,var(--gm-danger)_35%,transparent)]" },
    refunded: { label: "已退款", icon: Undo2, tone: "bg-[color-mix(in_srgb,var(--gm-warning)_9%,transparent)] text-[var(--gm-warning)] ring-[color-mix(in_srgb,var(--gm-warning)_35%,transparent)]" },
};

/** 状态切换时宽度跟着文字平滑变化，图标做形变而不是硬切 */
export function GammaStatusPill({ state, detail, className }: { state: GammaTaskState; detail?: string; className?: string }) {
    const reduce = useReducedMotion();
    const config = STATUS[state];
    return (
        <motion.span
            layout={!reduce}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 transition-colors duration-300", config.tone, className)}
        >
            <span className={cn("relative grid size-3.5 place-items-center", config.spin && "animate-spin", config.pulse && "animate-pulse")}>
                <GammaIconMorph icon={config.icon} size={14} strokeWidth={2.4} />
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={state} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                    {config.label}
                    {detail ? <span className="ml-1 opacity-70 tabular-nums">{detail}</span> : null}
                </motion.span>
            </AnimatePresence>
        </motion.span>
    );
}

export type GammaSubmitState = "idle" | "loading" | "success" | "error";

const SUBMIT_ICON: Record<GammaSubmitState, LucideIcon> = { idle: Sparkles, loading: RotateCcw, success: Check, error: X };

/** 提交按钮：状态由外部控制；按钮宽度随文字变化，背景色随状态渐变 */
export function GammaStateButton({ state, labels, onClick, className }: { state: GammaSubmitState; labels: Record<GammaSubmitState, string>; onClick: () => void; className?: string }) {
    const reduce = useReducedMotion();
    const busy = state === "loading";
    return (
        <motion.button
            type="button"
            layout={!reduce}
            onClick={onClick}
            disabled={busy}
            aria-live="polite"
            whileTap={reduce || busy ? undefined : { scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={cn(
                "relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full px-5 text-sm font-semibold text-white transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] disabled:cursor-progress",
                state === "success" ? "bg-[var(--gm-success)]" : state === "error" ? "bg-[var(--gm-danger)]" : "bg-[var(--gm-blue)] hover:bg-[var(--gm-blue-hover)]",
                className,
            )}
        >
            <span className={cn("grid size-4 place-items-center", busy && "animate-spin")}>
                <GammaIconMorph icon={SUBMIT_ICON[state]} size={16} strokeWidth={2.4} />
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={state} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    {labels[state]}
                </motion.span>
            </AnimatePresence>
            {busy ? <span aria-hidden className="gm-flow absolute inset-x-0 bottom-0 h-0.5" /> : null}
        </motion.button>
    );
}

/** 两态图标按钮：on / off 各一个 lucide 图标，切换时形变；hearts 粒子适合收藏 / 点赞 */
export function GammaMorphToggle({
    on,
    onChange,
    iconOn,
    iconOff,
    label,
    burst = false,
    tone = "accent",
    size = "md",
}: {
    on: boolean;
    onChange: (on: boolean) => void;
    iconOn: LucideIcon;
    iconOff: LucideIcon;
    label: string;
    burst?: boolean;
    tone?: "accent" | "danger";
    size?: "sm" | "md" | "lg";
}) {
    const fire = useGammaBurst();
    const reduce = useReducedMotion();
    const box = { sm: "size-8", md: "size-10", lg: "size-14" }[size];
    const icon = { sm: 16, md: 20, lg: 28 }[size];
    const activeColor = tone === "danger" ? "text-[#ff4d6d]" : "text-[var(--gm-accent)]";
    return (
        <motion.button
            type="button"
            aria-pressed={on}
            aria-label={label}
            onClick={(event) => {
                if (burst && !on) fire(event, iconOn === Heart ? "hearts" : "sparkle");
                onChange(!on);
            }}
            whileTap={reduce ? undefined : { scale: 0.86 }}
            transition={{ type: "spring", stiffness: 600, damping: 20 }}
            className={cn(
                "relative grid place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                box,
                on ? cn("bg-[var(--gm-wash-strong)]", activeColor) : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
            )}
        >
            <GammaIconMorph icon={on ? iconOn : iconOff} size={icon} spring="bouncy" />
        </motion.button>
    );
}
