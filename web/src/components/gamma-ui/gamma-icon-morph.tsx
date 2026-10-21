"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { MORPH_SAMPLES, absolutizeMove, interpolatePairs, pairShapes, shapesToPath, type MorphPair, type MorphShape, type Pt } from "@/components/gamma-ui/gamma-path-morph";
import { cn } from "@/lib/utils";

/*
 * 任意 lucide 图标之间的形变（参考 morphicons）：
 *   <GammaIconMorph icon={open ? X : Menu} />
 * 图标当作数据用（读 lucide 的 iconNode），在浏览器里用 getPointAtLength 采样，
 * 子路径配对与插值见 gamma-path-morph.ts；动画用弹簧，外推出一点回弹。
 */

type IconNode = readonly (readonly [string, Record<string, string | number>])[];

export const MORPH_SPRINGS = {
    snappy: { type: "spring", stiffness: 420, damping: 30, mass: 0.8 },
    smooth: { type: "spring", stiffness: 180, damping: 26, mass: 1 },
    bouncy: { type: "spring", stiffness: 360, damping: 14, mass: 0.9 },
} as const;
export type MorphSpring = keyof typeof MORPH_SPRINGS;

/** 读出 lucide 组件内部的 iconNode（lucide-react 1.x：render 出的元素带 iconNode prop） */
export function lucideIconNode(icon: LucideIcon): IconNode {
    const render = (icon as unknown as { render?: (props: object, ref: null) => { props?: { iconNode?: IconNode } } }).render;
    return render?.({}, null)?.props?.iconNode ?? [];
}

/** 把一个图元转成 path d：path 原样，circle / rect / line / polyline / ellipse 手工展开 */
function elementToD(tag: string, attrs: Record<string, string | number>): string | null {
    const n = (key: string, fallback = 0) => Number(attrs[key] ?? fallback);
    switch (tag) {
        case "path":
            return String(attrs.d ?? "");
        case "circle": {
            const [cx, cy, r] = [n("cx"), n("cy"), n("r")];
            return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
        }
        case "ellipse": {
            const [cx, cy, rx, ry] = [n("cx"), n("cy"), n("rx"), n("ry")];
            return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
        }
        case "rect": {
            const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")];
            const r = Math.min(n("rx", n("ry")), w / 2, h / 2);
            if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
            return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
        }
        case "line":
            return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
        case "polyline":
        case "polygon": {
            const points = String(attrs.points ?? "").trim();
            return points ? `M${points.replace(/\s+/g, " ").replace(/ (?=[\d-])/g, "L")}${tag === "polygon" ? "Z" : ""}` : null;
        }
        default:
            return null;
    }
}

/** 把一条 d 按 M 拆成子路径，每段用离屏 path 元素按弧长采样 */
function sampleD(d: string, svg: SVGSVGElement): MorphShape[] {
    const parts = d.trim().match(/[Mm][^Mm]*/g) ?? [];
    const shapes: MorphShape[] = [];
    let cursor: Pt = [0, 0];
    for (const [index, raw] of parts.entries()) {
        const part = absolutizeMove(raw, cursor, index === 0);
        const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
        element.setAttribute("d", part);
        svg.appendChild(element);
        const length = element.getTotalLength();
        const points: Pt[] = [];
        for (let i = 0; i <= MORPH_SAMPLES; i += 1) {
            const point = element.getPointAtLength((length * i) / MORPH_SAMPLES);
            points.push([point.x, point.y]);
        }
        svg.removeChild(element);
        if (points.length > 0) cursor = points[points.length - 1];
        shapes.push({ points, closed: /z\s*$/i.test(raw) });
    }
    return shapes;
}

let measureSvg: SVGSVGElement | null = null;
const cache = new WeakMap<object, MorphShape[]>();

/** 图标 → 子路径点列（同一个图标只采样一次） */
export function sampleIcon(icon: LucideIcon): MorphShape[] {
    const cached = cache.get(icon);
    if (cached) return cached;
    if (!measureSvg) {
        measureSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        measureSvg.setAttribute("aria-hidden", "true");
        measureSvg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
        document.body.appendChild(measureSvg);
    }
    const svg = measureSvg;
    const shapes = lucideIconNode(icon).flatMap(([tag, attrs]) => {
        const d = elementToD(tag, attrs);
        return d ? sampleD(d, svg) : [];
    });
    cache.set(icon, shapes);
    return shapes;
}

export interface GammaIconMorphProps {
    icon: LucideIcon;
    size?: number;
    strokeWidth?: number;
    spring?: MorphSpring;
    /** 动画快慢倍率（1 = 正常） */
    speed?: number;
    className?: string;
    /** 形变完成回调（演示页用来显示 t） */
    onProgress?: (t: number) => void;
}

/**
 * 形变图标。首帧（含 SSR）直接渲染静态 lucide 图标；挂载后切换 icon 时逐点弹簧插值。
 * 动画中途再切换，会从当前的中间形态继续变过去，不会跳回起点。
 */
export function GammaIconMorph({ icon: Icon, size = 20, strokeWidth = 2, spring = "snappy", speed = 1, className, onProgress }: GammaIconMorphProps) {
    const reduce = useReducedMotion();
    const pathRef = useRef<SVGPathElement>(null);
    const current = useRef<MorphShape[] | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!mounted) return;
        const target = sampleIcon(Icon);
        const path = pathRef.current;
        const from = current.current;
        if (!path || !from || reduce) {
            current.current = target;
            path?.setAttribute("d", shapesToPath(target));
            onProgress?.(1);
            return;
        }
        const pairs: MorphPair[] = pairShapes(from, target);
        const base = MORPH_SPRINGS[spring];
        const controls = animate(0, 1, {
            ...base,
            stiffness: base.stiffness * speed * speed,
            onUpdate: (t) => {
                const shapes = interpolatePairs(pairs, t);
                current.current = shapes;
                path.setAttribute("d", shapesToPath(shapes));
                onProgress?.(t);
            },
            onComplete: () => {
                current.current = target;
                path.setAttribute("d", shapesToPath(target));
            },
        });
        return () => controls.stop();
        // onProgress 只用于显示，变化时不重启动画
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Icon, mounted, reduce, spring, speed]);

    if (!mounted) return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("shrink-0 overflow-visible", className)}>
            <path ref={pathRef} />
        </svg>
    );
}
