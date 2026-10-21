"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { GammaCountUp } from "@/components/gamma-ui/gamma-motion";
import { arcPath, delta, heatColor, monotonePath, niceMax, ticks } from "@/components/gamma-ui/gamma-chart-core";
import { cn } from "@/lib/utils";

/*
 * 数据大屏风格图表（纯 SVG，无依赖）：
 *   GammaAreaChart  发光折线 + 渐变面积 + 悬停十字线与数值气泡
 *   GammaBarChart   渐变柱 + 柱顶光点，入场逐根升起
 *   GammaRingGauge  环形仪表：刻度圈 + 渐变弧 + 中心大数字
 *   GammaHeatmap    行 × 列 热力格（学生 × 步骤：谁卡在哪一步）
 *   GammaSparkline  卡片里的小趋势线
 *   GammaMetric     大数字指标卡（数字滚动 + 环比）
 * 每张图都带 role="img" + aria-label 的文字摘要，读屏能听到数据。
 */

const TONES = {
    blue: { line: "#1a7dff", glow: "rgba(26,125,255,0.55)" },
    cyan: { line: "#28ebfa", glow: "rgba(40,235,250,0.55)" },
    violet: { line: "#9b7cf6", glow: "rgba(155,124,246,0.55)" },
} as const;
export type GammaChartTone = keyof typeof TONES;

export interface GammaSeries {
    name: string;
    values: readonly number[];
    tone?: GammaChartTone;
}

/** 量容器宽度：让 viewBox 宽 = 实际像素宽，文字保持原大小，只有绘图区拉伸 */
function useBoxWidth(fallback: number) {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(fallback);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

export function GammaAreaChart({ labels, series, unit = "", height = 220, className }: { labels: readonly string[]; series: readonly GammaSeries[]; unit?: string; height?: number; className?: string }) {
    const reduce = useReducedMotion();
    const gid = useId().replace(/[^a-z0-9]/gi, "");
    const [hover, setHover] = useState<number | null>(null);
    const [boxRef, VB_W] = useBoxWidth(640);
    const pad = { top: 18, right: 14, bottom: 26, left: 36 };
    const innerW = VB_W - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax(series.flatMap((item) => item.values));
    const x = (index: number) => pad.left + (labels.length <= 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
    const y = (value: number) => pad.top + innerH - (value / max) * innerH;
    const summary = series.map((item) => `${item.name}：${item.values.map((value, index) => `${labels[index]} ${value}${unit}`).join("，")}`).join("；");

    return (
        <div ref={boxRef} className={cn("relative", className)}>
            <svg
                viewBox={`0 0 ${VB_W} ${height}`}
                height={height}
                className="w-full overflow-visible"
                role="img"
                aria-label={summary}
                onPointerMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const px = ((event.clientX - rect.left) / rect.width) * VB_W;
                    const index = Math.round(((px - pad.left) / innerW) * (labels.length - 1));
                    setHover(Math.max(0, Math.min(labels.length - 1, index)));
                }}
                onPointerLeave={() => setHover(null)}
            >
                <defs>
                    {series.map((item, index) => {
                        const tone = TONES[item.tone ?? (index === 1 ? "cyan" : "blue")];
                        return (
                            <linearGradient key={item.name} id={`${gid}-f${index}`} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={tone.line} stopOpacity="0.42" />
                                <stop offset="100%" stopColor={tone.line} stopOpacity="0" />
                            </linearGradient>
                        );
                    })}
                    <filter id={`${gid}-glow`} x="-10%" y="-30%" width="120%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {/* 网格与 Y 轴刻度 */}
                {ticks(max).map((tick) => (
                    <g key={tick}>
                        <line x1={pad.left} x2={VB_W - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--gm-border)" strokeDasharray={tick === 0 ? undefined : "3 5"} />
                        <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-[var(--gm-text-3)] font-mono text-[11px]">
                            {tick >= 1000 ? `${tick / 1000}k` : tick}
                        </text>
                    </g>
                ))}
                {labels.map((label, index) => (
                    <text key={label} x={x(index)} y={height - 6} textAnchor="middle" className={cn("text-[10px]", hover === index ? "fill-[var(--gm-text)]" : "fill-[var(--gm-text-3)]")}>
                        {label}
                    </text>
                ))}
                {series.map((item, index) => {
                    const tone = TONES[item.tone ?? (index === 1 ? "cyan" : "blue")];
                    const points = item.values.map((value, pointIndex) => [x(pointIndex), y(value)] as [number, number]);
                    const line = monotonePath(points);
                    const area = `${line}L${x(item.values.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`;
                    return (
                        <g key={item.name}>
                            <motion.path d={area} fill={`url(#${gid}-f${index})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 + index * 0.15 }} />
                            <motion.path
                                d={line}
                                fill="none"
                                stroke={tone.line}
                                strokeWidth={2.4}
                                strokeLinecap="round"
                                filter={`url(#${gid}-glow)`}
                                initial={reduce ? false : { pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1.1, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
                            />
                        </g>
                    );
                })}
                {hover !== null ? (
                    <g pointerEvents="none">
                        <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} stroke="var(--gm-accent)" strokeOpacity={0.5} strokeDasharray="2 4" />
                        {series.map((item, index) => {
                            const tone = TONES[item.tone ?? (index === 1 ? "cyan" : "blue")];
                            return <circle key={item.name} cx={x(hover)} cy={y(item.values[hover])} r={4.5} fill="var(--gm-bg)" stroke={tone.line} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 6px ${tone.glow})` }} />;
                        })}
                    </g>
                ) : null}
            </svg>
            {hover !== null ? (
                <div className="gm-glass pointer-events-none absolute top-0 z-10 min-w-[120px] -translate-x-1/2 rounded-[10px] px-3 py-2 text-xs" style={{ left: `${(x(hover) / VB_W) * 100}%` }}>
                    <p className="mb-1 font-medium">{labels[hover]}</p>
                    {series.map((item, index) => (
                        <p key={item.name} className="flex items-center gap-2 text-[var(--gm-text-2)]">
                            <span className="size-2 rounded-full" style={{ background: TONES[item.tone ?? (index === 1 ? "cyan" : "blue")].line }} />
                            {item.name}
                            <b className="ml-auto pl-3 font-mono text-[var(--gm-text)] tabular-nums">
                                {item.values[hover]}
                                {unit}
                            </b>
                        </p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function GammaBarChart({ items, unit = "", height = 200, highlight, className }: { items: readonly { label: string; value: number }[]; unit?: string; height?: number; highlight?: number; className?: string }) {
    const reduce = useReducedMotion();
    const gid = useId().replace(/[^a-z0-9]/gi, "");
    const [hover, setHover] = useState<number | null>(null);
    const [boxRef, VB_W] = useBoxWidth(640);
    const pad = { top: 22, bottom: 26, side: 8 };
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax(items.map((item) => item.value));
    const slot = (VB_W - pad.side * 2) / items.length;
    const barW = Math.min(36, slot * 0.52);
    return (
        <div ref={boxRef} className={className}>
            <svg viewBox={`0 0 ${VB_W} ${height}`} height={height} className="w-full overflow-visible" role="img" aria-label={items.map((item) => `${item.label} ${item.value}${unit}`).join("，")} onPointerLeave={() => setHover(null)}>
                <defs>
                    <linearGradient id={`${gid}-bar`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#28ebfa" />
                        <stop offset="100%" stopColor="#0050f5" stopOpacity="0.55" />
                    </linearGradient>
                    <linearGradient id={`${gid}-bar-dim`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#1a7dff" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#0050f5" stopOpacity="0.2" />
                    </linearGradient>
                </defs>
                <line x1={pad.side} x2={VB_W - pad.side} y1={pad.top + innerH} y2={pad.top + innerH} stroke="var(--gm-border)" />
                {items.map((item, index) => {
                    const h = (item.value / max) * innerH;
                    const cx = pad.side + slot * index + slot / 2;
                    const strong = hover === index || highlight === index;
                    return (
                        <g key={item.label} onPointerEnter={() => setHover(index)}>
                            <rect x={cx - slot / 2} y={pad.top} width={slot} height={innerH} fill="transparent" />
                            <motion.rect
                                x={cx - barW / 2}
                                width={barW}
                                rx={barW / 4}
                                fill={`url(#${gid}-${strong ? "bar" : "bar-dim"})`}
                                initial={reduce ? false : { y: pad.top + innerH, height: 0 }}
                                animate={{ y: pad.top + innerH - h, height: h }}
                                transition={{ duration: 0.7, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                            />
                            {/* 柱顶光点 */}
                            <motion.circle
                                cx={cx}
                                r={strong ? 3.5 : 2.5}
                                fill="#e9fdff"
                                style={{ filter: "drop-shadow(0 0 6px rgba(40,235,250,0.9))" }}
                                initial={reduce ? false : { cy: pad.top + innerH, opacity: 0 }}
                                animate={{ cy: pad.top + innerH - h, opacity: 1 }}
                                transition={{ duration: 0.7, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                            />
                            {strong ? (
                                <text x={cx} y={pad.top + innerH - h - 10} textAnchor="middle" className="fill-[var(--gm-text)] font-mono text-[11px] font-semibold">
                                    {item.value}
                                    {unit}
                                </text>
                            ) : null}
                            <text x={cx} y={height - 6} textAnchor="middle" className={cn("text-[10px]", strong ? "fill-[var(--gm-text)]" : "fill-[var(--gm-text-3)]")}>
                                {item.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export function GammaRingGauge({ value, label, sub, size = 148, tone = "cyan" }: { value: number; label: string; sub?: string; size?: number; tone?: GammaChartTone }) {
    const reduce = useReducedMotion();
    const gid = useId().replace(/[^a-z0-9]/gi, "");
    const t = Math.max(0, Math.min(1, value / 100));
    const c = size / 2;
    const r = c - 12;
    const ticksCount = 48;
    return (
        <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label} ${value}%${sub ? `，${sub}` : ""}`}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 overflow-visible">
                <defs>
                    <linearGradient id={`${gid}-ring`} x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="#0050f5" />
                        <stop offset="100%" stopColor={TONES[tone].line} />
                    </linearGradient>
                </defs>
                {/* 外圈刻度：已达部分点亮 */}
                {Array.from({ length: ticksCount }, (_, index) => {
                    const angle = (index / ticksCount) * Math.PI * 2 - Math.PI / 2;
                    const lit = index / ticksCount < t;
                    // 三角函数结果保留 2 位：服务端与浏览器浮点末位不同会导致 hydration 不一致
                    const at = (radius: number, fn: (value: number) => number) => Math.round((c + radius * fn(angle)) * 100) / 100;
                    return (
                        <line
                            key={index}
                            x1={at(r + 6, Math.cos)}
                            y1={at(r + 6, Math.sin)}
                            x2={at(r + 10, Math.cos)}
                            y2={at(r + 10, Math.sin)}
                            stroke={lit ? TONES[tone].line : "var(--gm-border-strong)"}
                            strokeWidth={1.5}
                            strokeLinecap="round"
                            opacity={lit ? 0.9 : 0.6}
                        />
                    );
                })}
                <circle cx={c} cy={c} r={r} fill="none" stroke="var(--gm-wash-strong)" strokeWidth={8} />
                <motion.path
                    d={arcPath(c, c, r, 0, Math.max(t, 0.001))}
                    fill="none"
                    stroke={`url(#${gid}-ring)`}
                    strokeWidth={8}
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 8px ${TONES[tone].glow})` }}
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                />
            </svg>
            <div className="relative flex flex-col items-center leading-none">
                <span className="font-mono text-[28px] font-bold tabular-nums">
                    <GammaCountUp value={value} />
                    <span className="text-sm text-[var(--gm-text-3)]">%</span>
                </span>
                <span className="mt-1.5 text-[11px] text-[var(--gm-text-2)]">{label}</span>
                {sub ? <span className="mt-0.5 text-[10px] text-[var(--gm-text-3)]">{sub}</span> : null}
            </div>
        </div>
    );
}

/** 行 × 列热力格：值为 0..1；null 表示「还没到这一步」 */
export function GammaHeatmap({
    rows,
    columns,
    values,
    onCell,
    rowWidth = 72,
    className,
}: {
    rows: readonly string[];
    columns: readonly string[];
    values: readonly (readonly (number | null)[])[];
    onCell?: (row: number, column: number) => void;
    rowWidth?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const [hover, setHover] = useState<[number, number] | null>(null);
    return (
        <div className={cn("flex flex-col gap-1", className)} role="grid" aria-label="完成度热力图">
            <div className="grid gap-1" style={{ gridTemplateColumns: `${rowWidth}px repeat(${columns.length}, minmax(0,1fr))` }} role="row">
                <span />
                {columns.map((column, index) => (
                    <span key={column} role="columnheader" className={cn("truncate text-center text-[10px]", hover?.[1] === index ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)]")}>
                        {column}
                    </span>
                ))}
            </div>
            {rows.map((row, rowIndex) => (
                <div key={row} className="grid gap-1" style={{ gridTemplateColumns: `${rowWidth}px repeat(${columns.length}, minmax(0,1fr))` }} role="row">
                    <span role="rowheader" className={cn("truncate pr-1 text-[11px] leading-6", hover?.[0] === rowIndex ? "text-[var(--gm-text)]" : "text-[var(--gm-text-2)]")}>
                        {row}
                    </span>
                    {columns.map((column, columnIndex) => {
                        const value = values[rowIndex]?.[columnIndex] ?? null;
                        const label = value === null ? "未开始" : `${Math.round(value * 100)}%`;
                        return (
                            <motion.button
                                key={column}
                                type="button"
                                role="gridcell"
                                aria-label={`${row} · ${column} · ${label}`}
                                onPointerEnter={() => setHover([rowIndex, columnIndex])}
                                onPointerLeave={() => setHover(null)}
                                onClick={() => onCell?.(rowIndex, columnIndex)}
                                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3, delay: (rowIndex + columnIndex) * 0.02 }}
                                className={cn(
                                    "h-6 rounded-[5px] ring-1 transition-transform hover:z-10 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                                    value === null ? "ring-[var(--gm-border)] [background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--gm-wash-strong)_3px_4px)]" : "ring-transparent",
                                )}
                                style={value === null ? undefined : { background: heatColor(value), boxShadow: value > 0.85 ? "0 0 10px rgba(40,235,250,0.45)" : undefined }}
                            />
                        );
                    })}
                </div>
            ))}
            <div className="mt-2 flex items-center justify-end gap-2 text-[10px] text-[var(--gm-text-3)]">
                <span>未开始</span>
                <span className="h-2.5 w-4 rounded-[3px] ring-1 ring-[var(--gm-border)] [background-image:repeating-linear-gradient(135deg,transparent_0_2px,var(--gm-wash-strong)_2px_3px)]" />
                <span className="ml-2">0%</span>
                {[0.15, 0.4, 0.65, 0.9].map((value) => (
                    <span key={value} className="h-2.5 w-4 rounded-[3px]" style={{ background: heatColor(value) }} />
                ))}
                <span>100%</span>
            </div>
        </div>
    );
}

export function GammaSparkline({ values, tone = "cyan", width = 96, height = 28 }: { values: readonly number[]; tone?: GammaChartTone; width?: number; height?: number }) {
    const gid = useId().replace(/[^a-z0-9]/gi, "");
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const points = values.map((value, index) => [(index / Math.max(1, values.length - 1)) * width, height - 3 - ((value - min) / span) * (height - 6)] as [number, number]);
    const line = monotonePath(points);
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
            <defs>
                <linearGradient id={`${gid}-s`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={TONES[tone].line} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={TONES[tone].line} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`${line}L${width} ${height}L0 ${height}Z`} fill={`url(#${gid}-s)`} />
            <path d={line} fill="none" stroke={TONES[tone].line} strokeWidth={1.6} strokeLinecap="round" />
            <circle cx={points.at(-1)?.[0]} cy={points.at(-1)?.[1]} r={2.5} fill={TONES[tone].line} style={{ filter: `drop-shadow(0 0 4px ${TONES[tone].glow})` }} />
        </svg>
    );
}

/** 指标卡：标签 + 滚动大数字 + 环比 + 迷你趋势 */
export function GammaMetric({
    label,
    value,
    unit,
    previous,
    trend,
    icon,
    tone = "cyan",
    invert = false,
}: {
    label: string;
    value: number;
    unit?: string;
    previous?: number;
    trend?: readonly number[];
    icon?: ReactNode;
    tone?: GammaChartTone;
    invert?: boolean;
}) {
    const change = previous === undefined ? null : delta(previous, value);
    // invert：数字变小才是好事（例如「卡住的学生」）
    const good = change === null ? null : invert ? change <= 0 : change >= 0;
    return (
        <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
            <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-2xl" style={{ background: TONES[tone].glow, opacity: 0.35 }} />
            <span className="relative flex items-center gap-1.5 text-xs text-[var(--gm-text-2)] [&_svg]:size-3.5">
                {icon}
                {label}
            </span>
            <span className="relative flex items-end justify-between gap-2">
                <span className="font-mono text-[28px] leading-none font-bold tabular-nums">
                    <GammaCountUp value={value} />
                    {unit ? <span className="ml-0.5 text-sm font-medium text-[var(--gm-text-3)]">{unit}</span> : null}
                </span>
                {trend ? <GammaSparkline values={trend} tone={tone} /> : null}
            </span>
            {change !== null ? (
                <span className={cn("relative inline-flex items-center gap-1 text-[11px]", good ? "text-[var(--gm-success)]" : "text-[var(--gm-danger)]")}>
                    {change >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {change >= 0 ? "+" : ""}
                    {change}% <span className="text-[var(--gm-text-3)]">较上周</span>
                </span>
            ) : null}
        </div>
    );
}
