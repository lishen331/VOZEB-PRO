"use client";

import type { PointerEvent, ReactNode } from "react";
import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/*
 * 液态玻璃面板。四层结构：
 *   1. gm-glass         背景模糊 + 饱和、内侧亮边/暗边
 *   2. gm-glass-sheen   顶部弧形高光
 *   3. gm-glass-refract 边缘折射描边
 *   4. gm-glass-spec    跟随鼠标的高光
 * 背后的彩色光斑由 GammaLiquidBackdrop 提供，玻璃才有"透出东西"的层次。
 */

const RADIUS = { md: "rounded-[var(--gm-radius)]", lg: "rounded-[var(--gm-radius-lg)]", xl: "rounded-[var(--gm-radius-xl)]" } as const;

/** 把指针位置写进 CSS 变量，供 gm-glass-spec 的 radial-gradient 使用 */
function trackSpecular(node: HTMLElement | null, event: PointerEvent<HTMLElement>) {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--gm-gx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    node.style.setProperty("--gm-gy", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

export function GammaGlass({ children, className, strong = false, interactive = true, radius = "lg" }: { children: ReactNode; className?: string; strong?: boolean; interactive?: boolean; radius?: keyof typeof RADIUS }) {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <div
            ref={ref}
            onPointerMove={interactive ? (event) => trackSpecular(ref.current, event) : undefined}
            className={cn("gm-glass gm-glass-sheen gm-glass-refract", strong && "gm-glass-strong", interactive && "gm-glass-spec", RADIUS[radius], className)}
        >
            {children}
        </div>
    );
}

/** 玻璃背后的液态光斑；放在 relative 容器里，玻璃压在上面才看得出透光 */
export function GammaLiquidBackdrop({ className }: { className?: string }) {
    return (
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
            <span className="gm-liquid absolute -top-10 -left-6 size-56 rounded-full bg-[var(--gm-blue)] opacity-50 blur-3xl" />
            <span className="gm-liquid absolute -right-8 bottom-0 size-48 rounded-full bg-[var(--gm-cyan)] opacity-30 blur-3xl [animation-delay:-6s]" />
            <span className="gm-liquid absolute bottom-6 left-1/3 size-40 rounded-full bg-[#7c5cff] opacity-30 blur-3xl [animation-delay:-11s]" />
        </div>
    );
}

/** 玻璃胶囊按钮：按压回弹 + 高光随指针移动 */
export function GammaGlassButton({ children, icon, onClick, className }: { children: ReactNode; icon?: ReactNode; onClick?: () => void; className?: string }) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLButtonElement>(null);
    return (
        <motion.button
            ref={ref}
            type="button"
            onClick={onClick}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
            onPointerMove={(event) => trackSpecular(ref.current, event)}
            className={cn(
                "gm-glass gm-glass-sheen gm-glass-refract gm-glass-spec inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium text-[var(--gm-text)] transition-shadow duration-200 hover:shadow-[0_22px_48px_rgba(2,6,20,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                className,
            )}
        >
            <span className="relative z-[1] inline-flex items-center gap-2">
                {icon}
                {children}
            </span>
        </motion.button>
    );
}

/** 玻璃底分段控件：选中块是一片更亮的玻璃，在选项间滑动 */
export function GammaGlassSegmented<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (value: T) => void; label: string }) {
    const reduce = useReducedMotion();
    return (
        <div role="radiogroup" aria-label={label} className="gm-glass gm-glass-refract inline-flex items-center gap-1 rounded-full p-1">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                            active ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:text-[var(--gm-text-2)]",
                        )}
                    >
                        {active ? <motion.span layoutId={`${label}-glass-pill`} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 34 }} className="gm-glass gm-glass-sheen absolute inset-0 rounded-full" /> : null}
                        <span className="relative z-[1]">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
