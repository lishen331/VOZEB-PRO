"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";

import "@/components/gamma-ui/gamma-effects.css";
import { cn } from "@/lib/utils";

/*
 * 苹果风材质组件（gm-material：大圆角 + 连续曲率 + 极细上亮下暗描边 + 强模糊高饱和）。
 *   GammaDock            macOS Dock：图标随鼠标距离放大
 *   GammaControlTile     控制中心方块：开关态底色变实
 *   GammaIosSwitch       iOS 开关：拇指按下会拉长
 *   GammaVolumeSlider    控制中心竖向音量条：拖动 / 键盘
 *   GammaGlassNotice     顶部通知：从上方弹入，可滑走
 */

const SPRING = { type: "spring", stiffness: 420, damping: 30 } as const;

/* ───── Dock ───── */

export interface GammaDockItem {
    key: string;
    label: string;
    icon: ReactNode;
    active?: boolean;
    onClick?: () => void;
}

const DOCK_BASE = 44;
const DOCK_MAX = 68;
const DOCK_RANGE = 140;

function DockIcon({ item, mouseX }: { item: GammaDockItem; mouseX: MotionValue<number> }) {
    const ref = useRef<HTMLButtonElement>(null);
    const distance = useTransform(mouseX, (x) => {
        const rect = ref.current?.getBoundingClientRect();
        return rect ? x - (rect.left + rect.width / 2) : DOCK_RANGE * 2;
    });
    const size = useSpring(useTransform(distance, [-DOCK_RANGE, 0, DOCK_RANGE], [DOCK_BASE, DOCK_MAX, DOCK_BASE]), { stiffness: 380, damping: 26, mass: 0.4 });
    return (
        <motion.button
            ref={ref}
            type="button"
            aria-label={item.label}
            onClick={item.onClick}
            style={{ width: size, height: size }}
            whileTap={{ scale: 0.88 }}
            className="group gm-squircle relative grid shrink-0 place-items-center rounded-[14px] bg-gradient-to-b from-[#3d7bff] to-[#0050f5] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_10px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            {/* 图标占按钮的一半，随 Dock 放大一起放大 */}
            <span className="absolute inset-[26%] [&_svg]:size-full">{item.icon}</span>
            <span className="gm-material pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-[8px] px-2 py-1 text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">{item.label}</span>
            {item.active ? <span className="absolute -bottom-2 size-1 rounded-full bg-[var(--gm-text)]" /> : null}
        </motion.button>
    );
}

export function GammaDock({ items, className }: { items: readonly GammaDockItem[]; className?: string }) {
    const reduce = useReducedMotion();
    const mouseX = useMotionValue(Number.POSITIVE_INFINITY);
    return (
        <nav
            aria-label="快捷入口"
            onPointerMove={(event) => !reduce && mouseX.set(event.clientX)}
            onPointerLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
            className={cn("gm-material gm-material-thick gm-squircle flex h-[68px] items-end gap-2.5 rounded-[24px] px-3 pb-3", className)}
        >
            {items.map((item) => (
                <DockIcon key={item.key} item={item} mouseX={mouseX} />
            ))}
        </nav>
    );
}

/* ───── 控制中心方块 ───── */

export function GammaControlTile({ icon, label, detail, on, onToggle, wide = false }: { icon: ReactNode; label: string; detail?: string; on: boolean; onToggle: () => void; wide?: boolean }) {
    const reduce = useReducedMotion();
    return (
        <motion.button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onToggle}
            whileTap={reduce ? undefined : { scale: 0.94 }}
            transition={SPRING}
            className={cn(
                "gm-material gm-squircle flex items-center gap-3 rounded-[22px] p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                wide ? "col-span-2 h-[68px]" : "aspect-square flex-col items-start justify-between",
            )}
        >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-300 [&_svg]:size-[18px]", on ? "bg-[var(--gm-blue)] text-white" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text)]")}>{icon}</span>
            <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold">{label}</span>
                {detail ? <span className="truncate text-[11px] text-[var(--gm-text-2)]">{on ? detail : "关闭"}</span> : null}
            </span>
        </motion.button>
    );
}

/* ───── iOS 开关 ───── */

export function GammaIosSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    const reduce = useReducedMotion();
    const [pressed, setPressed] = useState(false);
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            className={cn(
                "gm-ios-switch relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-bg)]",
                checked ? "justify-end bg-[#34c759]" : "justify-start bg-[var(--gm-wash-heavy)]",
            )}
        >
            {/* 按住时拇指横向拉长，松手弹回，这是 iOS 开关最有辨识度的细节 */}
            <motion.span layout transition={reduce ? { duration: 0 } : SPRING} animate={{ width: pressed ? 34 : 27 }} className="h-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.18),0_3px_1px_rgba(0,0,0,0.06)]" />
        </button>
    );
}

/* ───── 控制中心竖向滑条 ───── */

export function GammaVolumeSlider({ value, onChange, icon, label, height = 148 }: { value: number; onChange: (value: number) => void; icon: ReactNode; label: string; height?: number }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const setFromPointer = (clientY: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        onChange(Math.round(Math.min(100, Math.max(0, ((rect.bottom - clientY) / rect.height) * 100))));
    };
    return (
        <motion.div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            animate={{ scaleX: dragging ? 1.06 : 1 }}
            transition={SPRING}
            onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
                setFromPointer(event.clientY);
            }}
            onPointerMove={(event) => dragging && setFromPointer(event.clientY)}
            onPointerUp={() => setDragging(false)}
            onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowRight") onChange(Math.min(100, value + 5));
                if (event.key === "ArrowDown" || event.key === "ArrowLeft") onChange(Math.max(0, value - 5));
            }}
            style={{ height }}
            className="gm-material gm-squircle relative w-[68px] cursor-ns-resize touch-none overflow-hidden rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            {/* 填充色取正文色：深色主题下是白条，浅色主题下是深条，两边都看得清 */}
            <motion.span className="absolute inset-x-0 bottom-0 bg-[var(--gm-text)] opacity-90" animate={{ height: `${value}%` }} transition={dragging ? { duration: 0 } : SPRING} />
            <span className={cn("absolute bottom-3 left-1/2 -translate-x-1/2 transition-colors [&_svg]:size-5", value > 14 ? "text-[var(--gm-bg)]" : "text-[var(--gm-text)]")}>{icon}</span>
        </motion.div>
    );
}

/* ───── 顶部玻璃通知（灵动岛风格：从顶部胶囊展开） ───── */

export function GammaGlassNotice({ open, icon, title, body, action, onClose }: { open: boolean; icon: ReactNode; title: string; body: string; action?: ReactNode; onClose: () => void }) {
    const reduce = useReducedMotion();
    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    role="status"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.6, borderRadius: 999 }}
                    animate={{ opacity: 1, y: 0, scale: 1, borderRadius: 24 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    drag={reduce ? false : "y"}
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0.6, bottom: 0.1 }}
                    onDragEnd={(_, info) => info.offset.y < -30 && onClose()}
                    className="gm-material gm-material-thick gm-squircle flex w-[360px] max-w-full items-center gap-3 p-3 pr-4"
                >
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[image:var(--gm-gradient)] text-white [&_svg]:size-5">{icon}</span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate text-[13px] font-semibold">{title}</span>
                        <span className="truncate text-xs text-[var(--gm-text-2)]">{body}</span>
                    </span>
                    {action}
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
