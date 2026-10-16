"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { GAMMA_SUBJECTS } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

const SCROLL_STEP = 320;
const EDGE_EPSILON = 4;
const EDGE_FADE = "48px";

/**
 * 专业方向切换条（对应产品截图里的 12 个专业胶囊）。
 * 选中项是一片发光的品牌青玻璃，在胶囊之间滑动；超出宽度时横向滚动，两端渐隐并出现翻页按钮。
 */
export function GammaMajorTabs({ value, onChange, className }: { value: string; onChange: (slug: string) => void; className?: string }) {
    const reduce = useReducedMotion();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });

    useEffect(() => {
        const node = scrollerRef.current;
        if (!node) return;
        const update = () => setEdges({ start: node.scrollLeft > EDGE_EPSILON, end: node.scrollLeft + node.clientWidth < node.scrollWidth - EDGE_EPSILON });
        update();
        node.addEventListener("scroll", update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => {
            node.removeEventListener("scroll", update);
            observer.disconnect();
        };
    }, []);

    // 选中项滚进可见区域
    useEffect(() => {
        scrollerRef.current?.querySelector<HTMLElement>(`[data-slug="${value}"]`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest", inline: "nearest" });
    }, [reduce, value]);

    const scrollByStep = (direction: 1 | -1) => scrollerRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: reduce ? "auto" : "smooth" });
    const fadeMask = `linear-gradient(90deg, ${edges.start ? "transparent" : "#000"} 0, #000 ${EDGE_FADE}, #000 calc(100% - ${EDGE_FADE}), ${edges.end ? "transparent" : "#000"} 100%)`;

    return (
        <div className={cn("relative", className)}>
            <div ref={scrollerRef} role="tablist" aria-label="专业方向" className="hide-scrollbar flex gap-2 overflow-x-auto py-1" style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}>
                {GAMMA_SUBJECTS.map((subject) => {
                    const active = subject.slug === value;
                    const Icon = subject.icon;
                    return (
                        <button
                            key={subject.slug}
                            data-slug={subject.slug}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onChange(subject.slug)}
                            className={cn(
                                "group relative inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--gm-radius)] px-4 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                                active ? "text-[var(--gm-accent)]" : "bg-[var(--gm-surface)] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)] hover:bg-[var(--gm-surface-2)] hover:text-[var(--gm-text)] hover:ring-[var(--gm-border-strong)]",
                            )}
                        >
                            {active ? (
                                <motion.span
                                    layoutId="gm-major-indicator"
                                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 34 }}
                                    className="gm-glass-sheen absolute inset-0 rounded-[inherit] bg-[var(--gm-accent-soft)] shadow-[inset_0_0_0_1px_var(--gm-accent-ring),0_0_18px_var(--gm-accent-soft)]"
                                />
                            ) : null}
                            <Icon className={cn("relative size-4 transition-transform duration-200", active ? "scale-110" : "group-hover:-translate-y-px")} strokeWidth={1.8} />
                            <span className="relative">{subject.name}</span>
                        </button>
                    );
                })}
            </div>
            {edges.start ? (
                <button
                    type="button"
                    aria-label="向左滚动"
                    onClick={() => scrollByStep(-1)}
                    className="gm-glass absolute top-1/2 left-0 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] transition-transform hover:scale-105"
                >
                    <ChevronLeft className="size-4" />
                </button>
            ) : null}
            {edges.end ? (
                <button
                    type="button"
                    aria-label="向右滚动"
                    onClick={() => scrollByStep(1)}
                    className="gm-glass absolute top-1/2 right-0 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] transition-transform hover:scale-105"
                >
                    <ChevronRight className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
