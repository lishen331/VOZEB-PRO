"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, GripVertical, Heart, RefreshCw, Trash2, Upload } from "lucide-react";

import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaMorphIcon } from "@/components/gamma-ui/gamma-morph-icon";
import { GammaCountUp, GM_EASE } from "@/components/gamma-ui/gamma-motion";
import { cn } from "@/lib/utils";

/*
 * 交互动效清单：每格一个可直接点的独立交互。
 * 这些是"替换组件时要一起带走"的行为规范——布局之外的动态部分都在这里。
 */

const BURST_MS = 800;
const CONFIRM_MS = 1400;
const SKELETON_MS = 1400;
const UNDO_MS = 3000;
const INITIAL_LIKES = 2318;
const DEMO_ITEMS = ["望庐山瀑布", "唐长安复原", "分子结构"];

function Cell({ title, spec, children, className }: { title: string; spec: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]", className)}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--gm-border)] px-4 py-2.5">
                <span className="text-[13px] font-medium">{title}</span>
                <span className="truncate font-mono text-[10px] text-[var(--gm-text-3)]">{spec}</span>
            </div>
            <div className="flex flex-1 items-center justify-center gap-3 p-5">{children}</div>
        </div>
    );
}

/** 01 点赞：缩放回弹 + 爱心飘起 */
function LikeBurst() {
    const [liked, setLiked] = useState(false);
    const [bursts, setBursts] = useState<number[]>([]);
    const seq = useRef(0);
    return (
        <button
            type="button"
            aria-pressed={liked}
            onClick={() => {
                setLiked((value) => !value);
                if (liked) return;
                seq.current += 1;
                const id = seq.current;
                setBursts((list) => [...list, id]);
                window.setTimeout(() => setBursts((list) => list.filter((item) => item !== id)), BURST_MS);
            }}
            className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ring-1 ring-[var(--gm-border-strong)] transition-colors hover:bg-[var(--gm-wash)]"
        >
            <motion.span animate={{ scale: liked ? [1, 1.35, 1] : 1 }} transition={{ duration: 0.4, ease: GM_EASE }}>
                <Heart className={cn("size-4", liked && "fill-[#ff6b8a] text-[#ff6b8a]")} />
            </motion.span>
            <GammaCountUp value={liked ? INITIAL_LIKES + 1 : INITIAL_LIKES} />
            <AnimatePresence>
                {bursts.map((id) => (
                    <motion.span
                        key={id}
                        initial={{ opacity: 1, y: 0, scale: 0.6 }}
                        animate={{ opacity: 0, y: -34, scale: 1.1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: BURST_MS / 1000, ease: "easeOut" }}
                        className="pointer-events-none absolute top-0 left-4 text-[#ff6b8a]"
                    >
                        <Heart className="size-3.5 fill-current" />
                    </motion.span>
                ))}
            </AnimatePresence>
        </button>
    );
}

/** 02 加入素材库：图标形变为对勾 */
function AddConfirm() {
    const [done, setDone] = useState(false);
    useEffect(() => {
        if (!done) return;
        const timer = window.setTimeout(() => setDone(false), CONFIRM_MS);
        return () => window.clearTimeout(timer);
    }, [done]);
    return (
        <GammaButton size="sm" variant="soft" icon={<GammaMorphIcon name={done ? "check" : "plus"} size={16} />} onClick={() => setDone(true)}>
            {done ? "已加入素材库" : "加入素材库"}
        </GammaButton>
    );
}

/** 03 列表删除：高度收起 + 左滑淡出 */
function ListRemove() {
    const [items, setItems] = useState(DEMO_ITEMS);
    return (
        <div className="flex w-full max-w-xs flex-col gap-2">
            <AnimatePresence initial={false}>
                {items.map((item) => (
                    <motion.div
                        key={item}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 36 }}
                        exit={{ opacity: 0, height: 0, x: -24 }}
                        transition={{ duration: 0.3, ease: GM_EASE }}
                        className="flex items-center gap-2 overflow-hidden rounded-[var(--gm-radius-sm)] bg-[var(--gm-surface-2)] px-3 text-[13px]"
                    >
                        <GripVertical className="size-3.5 shrink-0 text-[var(--gm-text-3)]" />
                        <span className="flex-1 truncate">{item}</span>
                        <GammaIconButton label={`删除 ${item}`} size="sm" onClick={() => setItems((list) => list.filter((entry) => entry !== item))}>
                            <Trash2 />
                        </GammaIconButton>
                    </motion.div>
                ))}
            </AnimatePresence>
            {items.length < DEMO_ITEMS.length ? (
                <GammaButton size="xs" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => setItems(DEMO_ITEMS)}>
                    复原
                </GammaButton>
            ) : null}
        </div>
    );
}

/** 04 骨架屏 → 内容 */
function SkeletonSwap() {
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!loading) return;
        const timer = window.setTimeout(() => setLoading(false), SKELETON_MS);
        return () => window.clearTimeout(timer);
    }, [loading]);
    return (
        <div className="flex w-full max-w-xs flex-col gap-3">
            <AnimatePresence mode="wait" initial={false}>
                {loading ? (
                    <motion.div key="skeleton" exit={{ opacity: 0 }} className="flex flex-col gap-2">
                        <span className="gm-shimmer block h-20 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)]" />
                        <span className="gm-shimmer block h-3 w-2/3 rounded-full bg-[var(--gm-surface-2)]" />
                    </motion.div>
                ) : (
                    <motion.div key="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: GM_EASE }} className="flex flex-col gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                        <img src="/style-thumbs/watercolor.jpg" alt="" aria-hidden className="h-20 w-full rounded-[var(--gm-radius)] object-cover" />
                        <p className="text-xs text-[var(--gm-text-2)]">星月夜校园范画 · 美术</p>
                    </motion.div>
                )}
            </AnimatePresence>
            <GammaButton size="xs" variant="ghost" onClick={() => setLoading(true)}>
                重新加载
            </GammaButton>
        </div>
    );
}

/** 05 拖拽上传 */
function DropZone() {
    const [over, setOver] = useState(false);
    const [dropped, setDropped] = useState(false);
    return (
        <motion.div
            onDragOver={(event) => {
                event.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
                event.preventDefault();
                setOver(false);
                setDropped(true);
            }}
            animate={{ scale: over ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={cn(
                "grid h-28 w-full max-w-xs place-items-center rounded-[var(--gm-radius)] border border-dashed text-center text-xs transition-colors",
                over ? "border-[var(--gm-accent)] bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]" : "border-[var(--gm-border-strong)] text-[var(--gm-text-3)]",
            )}
        >
            <span className="flex flex-col items-center gap-1.5">
                {dropped ? <Check className="size-5 text-[var(--gm-success)]" /> : <Upload className="size-5" />}
                {dropped ? "已接收（演示）" : over ? "松手上传" : "拖拽参考图到这里"}
            </span>
        </motion.div>
    );
}

const STEPS = ["选专业", "写描述", "生成中", "完成"];

/** 06 步骤推进 */
function StepFlow() {
    const [step, setStep] = useState(1);
    return (
        <div className="flex w-full flex-col gap-4">
            <div className="flex items-center">
                {STEPS.map((label, index) => (
                    <div key={label} className={cn("flex items-center", index < STEPS.length - 1 && "flex-1")}>
                        <span className="flex flex-col items-center gap-1.5">
                            <motion.span
                                animate={{ scale: index === step ? 1.15 : 1 }}
                                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                                className={cn("grid size-7 place-items-center rounded-full text-[11px] font-semibold transition-colors", index <= step ? "bg-[var(--gm-blue)] text-white" : "bg-[var(--gm-surface-3)] text-[var(--gm-text-3)]")}
                            >
                                {index < step ? <Check className="size-3.5" /> : index + 1}
                            </motion.span>
                            <span className={cn("text-[10px] whitespace-nowrap", index <= step ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)]")}>{label}</span>
                        </span>
                        {index < STEPS.length - 1 ? (
                            <span className="mx-1.5 mb-4 h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--gm-surface-3)]">
                                <motion.span className="block h-full rounded-full bg-[var(--gm-cyan)]" initial={false} animate={{ width: index < step ? "100%" : "0%" }} transition={{ duration: 0.45, ease: GM_EASE }} />
                            </span>
                        ) : null}
                    </div>
                ))}
            </div>
            <div className="flex justify-center gap-2">
                <GammaButton size="xs" variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))}>
                    上一步
                </GammaButton>
                <GammaButton size="xs" onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}>
                    下一步
                </GammaButton>
            </div>
        </div>
    );
}

const STAGES = [
    { tone: "warning" as const, label: "排队中" },
    { tone: "cyan" as const, label: "生成中" },
    { tone: "success" as const, label: "已完成" },
];

/** 07 状态流转 */
function StatusFlip() {
    const [index, setIndex] = useState(0);
    const stage = STAGES[index];
    return (
        <div className="flex flex-col items-center gap-3">
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={stage.label} initial={{ opacity: 0, y: 6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.92 }} transition={{ duration: 0.22 }}>
                    <GammaBadge tone={stage.tone}>{stage.label}</GammaBadge>
                </motion.span>
            </AnimatePresence>
            <GammaButton size="xs" variant="outline" onClick={() => setIndex((value) => (value + 1) % STAGES.length)}>
                推进状态
            </GammaButton>
        </div>
    );
}

/** 08 校验抖动 */
function ShakeValidate() {
    const reduce = useReducedMotion();
    const [value, setValue] = useState("");
    const [shake, setShake] = useState(0);
    return (
        <div className="flex w-full max-w-xs flex-col gap-2">
            <motion.input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="写点什么再提交"
                aria-label="演示输入框"
                key={shake}
                animate={reduce || !shake ? undefined : { x: [0, -6, 6, -4, 0] }}
                transition={{ duration: 0.32 }}
                className="h-10 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] px-3 text-sm outline-none ring-1 ring-[var(--gm-border)] transition-shadow focus:ring-[var(--gm-accent)]"
            />
            <GammaButton size="sm" onClick={() => (value.trim() ? setValue("") : setShake((count) => count + 1))}>
                提交
            </GammaButton>
        </div>
    );
}

/** 09 撤销条 */
function UndoBar() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => setOpen(false), UNDO_MS);
        return () => window.clearTimeout(timer);
    }, [open]);
    return (
        <div className="relative grid h-24 w-full place-items-center">
            <GammaButton size="sm" variant="outline" onClick={() => setOpen(true)}>
                删除一个作品
            </GammaButton>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-x-2 bottom-0 flex items-center gap-3 overflow-hidden rounded-[var(--gm-radius)] bg-[var(--gm-surface-3)] px-3 py-2 text-xs"
                    >
                        <span className="flex-1">已删除「森林生态链」</span>
                        <button type="button" onClick={() => setOpen(false)} className="font-medium text-[var(--gm-accent)]">
                            撤销
                        </button>
                        <motion.span initial={{ width: "100%" }} animate={{ width: 0 }} transition={{ duration: UNDO_MS / 1000, ease: "linear" }} className="absolute bottom-0 left-0 h-0.5 bg-[var(--gm-accent)]" />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

export function DesignInteractions() {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Cell title="01 · 点赞" spec="scale 1→1.35→1 · 飘起 0.8s">
                <LikeBurst />
            </Cell>
            <Cell title="02 · 加入素材库" spec="图标形变 spring 380/26">
                <AddConfirm />
            </Cell>
            <Cell title="03 · 列表删除" spec="layout + 高度收起 0.3s">
                <ListRemove />
            </Cell>
            <Cell title="04 · 骨架屏 → 内容" spec="流光 1.6s · 淡入 0.35s">
                <SkeletonSwap />
            </Cell>
            <Cell title="05 · 拖拽上传" spec="scale 1.02 · 描边转品牌色">
                <DropZone />
            </Cell>
            <Cell title="06 · 步骤推进" spec="连接线 width 0.45s">
                <StepFlow />
            </Cell>
            <Cell title="07 · 状态流转" spec="徽标交叉淡入 0.22s">
                <StatusFlip />
            </Cell>
            <Cell title="08 · 校验抖动" spec="x 轴 ±6px · 0.32s">
                <ShakeValidate />
            </Cell>
            <Cell title="09 · 撤销条" spec="底部滑入 + 3s 倒计时">
                <UndoBar />
            </Cell>
        </div>
    );
}
