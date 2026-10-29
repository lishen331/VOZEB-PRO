"use client";

import { motion, useReducedMotion } from "motion/react";

/*
 * 形变图标：参考 morphicons 的思路——所有图标共用 24×24 网格、2px 描边，
 * 每个图标由同样数量（3 条）的线段组成，切换时逐条做弹簧插值，看起来是线条"长"成新图标。
 */

type Segment = readonly [x1: number, y1: number, x2: number, y2: number];
type Shape = readonly [Segment, Segment, Segment];

const C = 12;
const HIDDEN: Segment = [C, C, C, C];

export const GAMMA_MORPH_SHAPES = {
    menu: [
        [4, 6, 20, 6],
        [4, 12, 20, 12],
        [4, 18, 20, 18],
    ],
    close: [[6, 6, 18, 18], HIDDEN, [6, 18, 18, 6]],
    plus: [[C, 5, C, 19], HIDDEN, [5, C, 19, C]],
    minus: [[5, C, 19, C], HIDDEN, [5, C, 19, C]],
    check: [
        [5, 12.5, 10, 17.5],
        [10, 17.5, 19, 7],
        [10, 17.5, 19, 7],
    ],
    arrowRight: [
        [5, C, 19, C],
        [13, 6, 19, C],
        [13, 18, 19, C],
    ],
    arrowDown: [
        [C, 5, C, 19],
        [6, 13, C, 19],
        [18, 13, C, 19],
    ],
    chevronDown: [
        [6, 9, C, 15],
        [C, 15, 18, 9],
        [C, 15, 18, 9],
    ],
    play: [
        [8, 5, 8, 19],
        [8, 5, 19, C],
        [8, 19, 19, C],
    ],
    pause: [[9, 5, 9, 19], HIDDEN, [15, 5, 15, 19]],
    sparkle: [[C, 3, C, 21], [3, C, 21, C], HIDDEN],
} as const satisfies Record<string, Shape>;

export type GammaMorphName = keyof typeof GAMMA_MORPH_SHAPES;

const SPRING = { type: "spring", stiffness: 380, damping: 26, mass: 0.7 } as const;

export function GammaMorphIcon({ name, size = 20, strokeWidth = 2, className }: { name: GammaMorphName; size?: number; strokeWidth?: number; className?: string }) {
    const reduce = useReducedMotion();
    const shape: Shape = GAMMA_MORPH_SHAPES[name];
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
            {shape.map(([x1, y1, x2, y2], index) => (
                <motion.line key={index} initial={false} animate={{ x1, y1, x2, y2, opacity: x1 === x2 && y1 === y2 ? 0 : 1 }} transition={reduce ? { duration: 0 } : SPRING} />
            ))}
        </svg>
    );
}
