"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";

import { cn } from "@/lib/utils";

/*
 * 导航专用图标：统一 24×24 网格、圆头圆角描边。
 * 每个图标分三层：outline（常驻轮廓）、fill（选中时由中心放大的镂空块）、spark（选中时生长的点亮笔画），
 * 点击选中时三层一起动，和 Logo 的 γ 笔画呼应。
 */

export type GammaNavIconName = "home" | "subjects" | "courseware" | "assets" | "prompts" | "plaza" | "classes" | "design" | "all";

interface IconSpec {
    outline: string;
    fill?: string;
    spark?: string;
}

const ICONS: Record<GammaNavIconName, IconSpec> = {
    // 首页：四瓣光标（品牌 γ 的旋转对称）
    home: {
        outline: "M12 3.5c0 4.7 1.8 6.5 6.5 6.5-4.7 0-6.5 1.8-6.5 6.5 0-4.7-1.8-6.5-6.5-6.5 4.7 0 6.5-1.8 6.5-6.5Z",
        fill: "M12 6.6c0 2.6 1 3.4 3.4 3.4-2.4 0-3.4 1-3.4 3.4 0-2.4-1-3.4-3.4-3.4 2.4 0 3.4-.8 3.4-3.4Z",
        spark: "M12 18.2v2.4M9.4 19.6h5.2",
    },
    // 专业：打开的书
    subjects: {
        outline: "M12 7.5C10.5 6 8.6 5.2 6 5.2A1.2 1.2 0 0 0 4.8 6.4v10.2c0 .7.5 1.2 1.2 1.2 2.6 0 4.5.8 6 2.2 1.5-1.4 3.4-2.2 6-2.2.7 0 1.2-.5 1.2-1.2V6.4c0-.7-.5-1.2-1.2-1.2-2.6 0-4.5.8-6 2.3Z",
        fill: "M12 7.5c1.5-1.5 3.4-2.3 6-2.3.7 0 1.2.5 1.2 1.2v10.2c0 .7-.5 1.2-1.2 1.2-2.6 0-4.5.8-6 2.2Z",
        spark: "M12 7.5V20",
    },
    // 工作台：屏幕
    courseware: {
        outline: "M4.5 5.2h15a1 1 0 0 1 1 1v8.1a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1ZM12 15.3v3.5M8.2 18.8h7.6",
        fill: "M7 8.4h6.2v3.8H7Z",
        spark: "M15.6 8.6h1.8M15.6 12h1.8",
    },
    // 资产：文件夹
    assets: {
        outline: "M3.8 7.4a1.4 1.4 0 0 1 1.4-1.4h3.4l2 2.2h6.4a1.4 1.4 0 0 1 1.4 1.4v7.6a1.4 1.4 0 0 1-1.4 1.4H5.2a1.4 1.4 0 0 1-1.4-1.4Z",
        fill: "M3.8 10.6h16.4v6.6a1.4 1.4 0 0 1-1.4 1.4H5.2a1.4 1.4 0 0 1-1.4-1.4Z",
        spark: "M3.8 10.6h16.4",
    },
    // 提示词：对话气泡
    prompts: {
        outline: "M4.5 6.6a1.6 1.6 0 0 1 1.6-1.6h11.8a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H9.8L5.6 19v-3.6a1.1 1.1 0 0 1-1.1-1.1Z",
        fill: "M4.5 6.6a1.6 1.6 0 0 1 1.6-1.6h11.8a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H9.8L5.6 19v-3.6a1.1 1.1 0 0 1-1.1-1.1Z",
        spark: "M8 9.4h8M8 12.2h4.6",
    },
    // 广场：罗盘指针
    plaza: {
        outline: "M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Z",
        fill: "M15.6 8.4 13.4 13.4 8.4 15.6l2.2-5Z",
        spark: "M15.6 8.4 10.6 10.6",
    },
    // 工作室：中心成员 + 两侧伙伴
    classes: {
        outline: "M12 11.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM6.6 18.6c0-2.6 2.4-4.4 5.4-4.4s5.4 1.8 5.4 4.4",
        fill: "M12 6.2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z",
        spark: "M4.4 12.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8M19.6 12.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8",
    },
    // 设计系统：调色盘
    design: {
        outline: "M12 3.8c-4.5 0-8.2 3.5-8.2 7.9 0 4.3 3.4 6.6 6.3 6.6 1.6 0 2.2-.8 2.2-1.7 0-1-.9-1.3-.9-2.4 0-1.2 1-2.1 2.4-2.1h2.5c2.3 0 3.9-1.5 3.9-3.6 0-2.6-3.3-4.7-8.2-4.7Z",
        fill: "M12 3.8c4.9 0 8.2 2.1 8.2 4.7 0 2.1-1.6 3.6-3.9 3.6H12.3Z",
        spark: "M8.2 9.3h.01M11.4 7.3h.01M7.4 13.3h.01",
    },
    // 全部：九宫格
    all: {
        outline: "M5 5h4.4v4.4H5ZM14.6 5H19v4.4h-4.4ZM5 14.6h4.4V19H5ZM14.6 14.6H19V19h-4.4Z",
        fill: "M14.6 5H19v4.4h-4.4Z",
        spark: "M11.6 12h.8",
    },
};

const DRAW: Transition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] };
const SPRING: Transition = { type: "spring", stiffness: 420, damping: 26 };
const INSTANT: Transition = { duration: 0 };

export function GammaNavIcon({ name, active = false, size = 22, className }: { name: GammaNavIconName; active?: boolean; size?: number; className?: string }) {
    const reduce = useReducedMotion();
    const spec = ICONS[name];
    const spring = reduce ? INSTANT : SPRING;
    const draw = reduce ? INSTANT : DRAW;

    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden className={cn("overflow-visible", className)}>
            {spec.fill ? (
                <motion.path d={spec.fill} fill="currentColor" stroke="none" initial={false} animate={{ opacity: active ? 0.22 : 0, scale: active ? 1 : 0.72 }} transition={spring} style={{ transformOrigin: "12px 12px" }} />
            ) : null}
            <motion.path d={spec.outline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ strokeWidth: active ? 2 : 1.7 }} transition={spring} />
            {spec.spark ? <motion.path d={spec.spark} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} initial={false} animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }} transition={draw} /> : null}
        </svg>
    );
}

export const GAMMA_NAV_ICON_NAMES = Object.keys(ICONS) as GammaNavIconName[];
