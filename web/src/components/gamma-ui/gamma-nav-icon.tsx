"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";

import { cn } from "@/lib/utils";

/*
 * 导航专用图标：统一 24×24 网格、圆头圆角描边，内容落在 3.5–20.5 安全区内。
 * 每个图标三层：
 *   outline  常驻轮廓
 *   fill     选中时出现的底色——必须与 outline 的外形完全一致（或是 outline 内部的一块），以自身中心放大
 *   spark    选中时"一笔画出来"的点亮笔画——必须完全落在 outline 内部，不许伸出去
 * 这三条规则是为了避免选中态错位（旧版素材图标的底色和横线都超出了文件夹轮廓）。
 */

interface IconSpec {
    label: string;
    outline: string;
    fill?: string;
    spark?: string;
}

const ICONS = {
    /* ───── BlueGamma 新导航 ───── */
    // 首页：房子，选中时门洞一笔画出
    home: {
        label: "首页",
        outline: "M4.5 10.2 12 4.2l7.5 6V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1Z",
        fill: "M4.5 10.2 12 4.2l7.5 6V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1Z",
        spark: "M10 20v-4.2a2 2 0 0 1 4 0V20",
    },
    // 专业：打开的书，右页填色，书脊点亮
    subjects: {
        label: "专业",
        outline: "M12 7.5C10.5 6 8.6 5.2 6 5.2A1.2 1.2 0 0 0 4.8 6.4v10.2c0 .7.5 1.2 1.2 1.2 2.6 0 4.5.8 6 2.2 1.5-1.4 3.4-2.2 6-2.2.7 0 1.2-.5 1.2-1.2V6.4c0-.7-.5-1.2-1.2-1.2-2.6 0-4.5.8-6 2.3Z",
        fill: "M12 7.5c1.5-1.5 3.4-2.3 6-2.3.7 0 1.2.5 1.2 1.2v10.2c0 .7-.5 1.2-1.2 1.2-2.6 0-4.5.8-6 2.2Z",
        spark: "M12 7.5V19.6",
    },
    // 工作台：显示器，屏幕填色，屏内两条进度
    courseware: {
        label: "工作台",
        outline: "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5ZM12 16v3.5M8.5 19.5h7",
        fill: "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5Z",
        spark: "M7 9h6M7 12h9",
    },
    // 课程：学士帽，帽顶填色，流苏点亮
    lessons: {
        label: "课程",
        outline: "M12 5 3.5 9.2 12 13.4l8.5-4.2ZM6.8 11v4.1c0 1.4 2.3 2.7 5.2 2.7s5.2-1.3 5.2-2.7V11",
        fill: "M12 5 3.5 9.2 12 13.4l8.5-4.2Z",
        spark: "M19 10v4.6",
    },
    // 素材：文件夹，整块填色，中间画出「＋」（加入素材库）
    assets: {
        label: "素材",
        outline: "M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z",
        fill: "M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z",
        spark: "M12 11v5M9.5 13.5h5",
    },
    // 提示词：对话气泡，填色，两行文字点亮
    prompts: {
        label: "提示词",
        outline: "M4.5 6.6a1.6 1.6 0 0 1 1.6-1.6h11.8a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H9.8L5.6 19v-3.6a1.1 1.1 0 0 1-1.1-1.1Z",
        fill: "M4.5 6.6a1.6 1.6 0 0 1 1.6-1.6h11.8a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H9.8L5.6 19v-3.6a1.1 1.1 0 0 1-1.1-1.1Z",
        spark: "M8 9.2h8M8 12.2h4.6",
    },
    // 作品广场：瀑布流四宫格，大块填色，小块里画出爱心
    plaza: {
        label: "作品广场",
        outline:
            "M5 4.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM14.5 4.5H19a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-4.5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1ZM5 15.5h4.5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM14.5 12H19a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-4.5a1 1 0 0 1-1-1V13a1 1 0 0 1 1-1Z",
        fill: "M5 4.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z",
        spark: "M16.75 18s-2.2-1.2-2.2-2.7a1.1 1.1 0 0 1 2.2-.5 1.1 1.1 0 0 1 2.2.5c0 1.5-2.2 2.7-2.2 2.7Z",
    },
    // 工作室：中心成员 + 两侧伙伴（伙伴画进轮廓里），选中时中心成员填色、肩线点亮
    classes: {
        label: "工作室",
        outline:
            "M12 11.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM6.8 19c0-2.6 2.3-4.4 5.2-4.4s5.2 1.8 5.2 4.4M5.6 12.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM18.4 12.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM3.6 18c0-1.6.9-2.8 2.4-3.2M20.4 18c0-1.6-.9-2.8-2.4-3.2",
        fill: "M12 6.2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z",
        spark: "M9.4 17.4c.7-.6 1.6-.9 2.6-.9s1.9.3 2.6.9",
    },
    // 设计系统：调色盘
    design: {
        label: "设计系统",
        outline: "M12 3.8c-4.5 0-8.2 3.5-8.2 7.9 0 4.3 3.4 6.6 6.3 6.6 1.6 0 2.2-.8 2.2-1.7 0-1-.9-1.3-.9-2.4 0-1.2 1-2.1 2.4-2.1h2.5c2.3 0 3.9-1.5 3.9-3.6 0-2.6-3.3-4.7-8.2-4.7Z",
        fill: "M12 3.8c-4.5 0-8.2 3.5-8.2 7.9 0 4.3 3.4 6.6 6.3 6.6 1.6 0 2.2-.8 2.2-1.7 0-1-.9-1.3-.9-2.4 0-1.2 1-2.1 2.4-2.1h2.5c2.3 0 3.9-1.5 3.9-3.6 0-2.6-3.3-4.7-8.2-4.7Z",
        spark: "M8 10.6h.01M10.6 7.6h.01M14.4 7.6h.01",
    },
    // 全部：九宫格
    all: {
        label: "全部",
        outline:
            "M5.5 4.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM15.5 4.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM5.5 14.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM15.5 14.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z",
        fill: "M15.5 4.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z",
        spark: "M17 15.6v2.8M15.6 17h2.8",
    },
    /* ───── 现有系统入口（navigation-tools） ───── */
    // 画布：无限画布上三个连线的节点，左节点填色，连线一笔画出
    canvas: {
        label: "画布",
        outline: "M5 4.5h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM15 4.5h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM10 14.5h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z",
        fill: "M5 4.5h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z",
        spark: "M7 9.5v1.5a2 2 0 0 0 2 2h1.2M17 9.5v1.5a2 2 0 0 1-2 2h-1.2",
    },
    // 短剧：竖屏手机 + 播放三角
    drama: {
        label: "短剧",
        outline: "M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5Z",
        fill: "M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5Z",
        spark: "M10.6 9.4v5.2l4.2-2.6Z",
    },
    // 作品：画框 + 山与太阳
    works: {
        label: "作品",
        outline: "M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM4.5 16l4.2-4.2a1 1 0 0 1 1.4 0l5.4 5.4M13.5 15l1.6-1.6a1 1 0 0 1 1.4 0l3 3",
        fill: "M4.5 16l4.2-4.2a1 1 0 0 1 1.4 0l5.4 5.4 1.1-1.1 2.9 2.4v.3a.7.7 0 0 1-.7.7H5.2a.7.7 0 0 1-.7-.7Z",
        spark: "M15.2 9.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z",
    },
    // 词库：叠放的卡片 + 书签
    library: {
        label: "词库",
        outline: "M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15l-6.5-3.6L5.5 20V5A1.5 1.5 0 0 1 7 3.5Z",
        fill: "M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15l-6.5-3.6L5.5 20V5A1.5 1.5 0 0 1 7 3.5Z",
        spark: "M9 8h6M9 11h4",
    },
    // IP 库：角色头像徽章（圆 + 星）
    ip: {
        label: "IP库",
        outline: "M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Z",
        fill: "M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Z",
        spark: "m12 7.6 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4Z",
    },
    // 主页：个人卡片
    profile: {
        label: "主页",
        outline: "M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM12 12.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM7.8 17c.6-1.7 2.2-2.8 4.2-2.8s3.6 1.1 4.2 2.8",
        fill: "M12 7.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z",
        spark: "M7.8 17c.6-1.7 2.2-2.8 4.2-2.8s3.6 1.1 4.2 2.8",
    },
    // 无限练习：∞ 环
    practice: {
        label: "无限练习",
        outline: "M8 8.6c-1.9 0-3.4 1.5-3.4 3.4s1.5 3.4 3.4 3.4c3.6 0 4.4-6.8 8-6.8 1.9 0 3.4 1.5 3.4 3.4s-1.5 3.4-3.4 3.4c-3.6 0-4.4-6.8-8-6.8Z",
        spark: "M16 8.6c1.9 0 3.4 1.5 3.4 3.4s-1.5 3.4-3.4 3.4c-3.6 0-4.4-6.8-8-6.8",
    },
    // 一键成片：胶片框 + 魔法闪光
    film: {
        label: "一键成片",
        outline: "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 5ZM3.5 9h17M7.5 5 9 9M12 5l1.5 4M16.5 5 18 9",
        fill: "M3.5 9h17v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z",
        spark: "M12 11.4c.3 1.6.9 2.2 2.4 2.5-1.5.3-2.1.9-2.4 2.5-.3-1.6-.9-2.2-2.4-2.5 1.5-.3 2.1-.9 2.4-2.5Z",
    },
    // 创作工坊：扳手 + 画笔交叉
    workshop: {
        label: "创作工坊",
        outline: "M14.6 4.6a3.6 3.6 0 0 0-4.5 4.5l-5 5a1.6 1.6 0 1 0 2.3 2.3l5-5a3.6 3.6 0 0 0 4.5-4.5l-2.2 2.2-2.2-.3-.3-2.2ZM14 14.2l3.6 3.6a1.4 1.4 0 0 1-2 2L12 16.2",
        fill: "M14.6 4.6a3.6 3.6 0 0 0-4.5 4.5l-5 5a1.6 1.6 0 1 0 2.3 2.3l5-5a3.6 3.6 0 0 0 4.5-4.5l-2.2 2.2-2.2-.3-.3-2.2Z",
        spark: "M7.4 15.6h.01",
    },
    // 教学中心：讲台黑板 + 教鞭
    teaching: {
        label: "教学中心",
        outline: "M4.5 5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM9 16l-2 4M15 16l2 4",
        fill: "M4.5 5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
        spark: "M7 12.4 10 9.4l2.4 2.4L17 8",
    },
    // 学习中心：书本（带书页厚度）+ 进度勾
    learning: {
        label: "学习中心",
        outline: "M7 4h11a1 1 0 0 1 1 1v11.5H7.2a1.75 1.75 0 0 0 0 3.5H19M5.5 18.2V5.5A1.5 1.5 0 0 1 7 4",
        fill: "M7 4h11a1 1 0 0 1 1 1v11.5H7.2a1.75 1.75 0 0 0-1.7 1.4V5.5A1.5 1.5 0 0 1 7 4Z",
        spark: "m9.4 10.4 2 2 4-4.2",
    },
    // 学校管理：校舍 + 旗
    school: {
        label: "学校管理",
        outline: "M3.5 20h17M5 20v-8.5l7-4 7 4V20M12 7.5V3.6M12 3.6h3.4l-.8 1.1.8 1.1H12",
        fill: "M5 20v-8.5l7-4 7 4V20Z",
        spark: "M10 20v-3.6a2 2 0 0 1 4 0V20",
    },
} satisfies Record<string, IconSpec>;

export type GammaNavIconName = keyof typeof ICONS;

const DRAW: Transition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] };
const SPRING: Transition = { type: "spring", stiffness: 420, damping: 26 };
const INSTANT: Transition = { duration: 0 };

export function GammaNavIcon({ name, active = false, size = 22, className }: { name: GammaNavIconName; active?: boolean; size?: number; className?: string }) {
    const reduce = useReducedMotion();
    const spec: IconSpec = ICONS[name];
    const spring = reduce ? INSTANT : SPRING;
    const draw = reduce ? INSTANT : DRAW;

    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden className={cn("overflow-visible", className)}>
            {spec.fill ? (
                <motion.path
                    d={spec.fill}
                    fill="currentColor"
                    stroke="none"
                    initial={false}
                    animate={{ opacity: active ? 0.2 : 0, scale: active ? 1 : 0.6 }}
                    transition={spring}
                    // 以填充块自己的中心放大，而不是画布中心——否则不对称的图形会先偏后正
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
            ) : null}
            <motion.path d={spec.outline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ strokeWidth: active ? 2 : 1.7 }} transition={spring} />
            {spec.spark ? <motion.path d={spec.spark} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} initial={false} animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }} transition={draw} /> : null}
        </svg>
    );
}

export const GAMMA_NAV_ICON_NAMES = Object.keys(ICONS) as GammaNavIconName[];

/** 图标默认文案（设计系统页展示用） */
export const GAMMA_NAV_ICON_LABELS = Object.fromEntries(GAMMA_NAV_ICON_NAMES.map((name) => [name, (ICONS[name] as IconSpec).label])) as Record<GammaNavIconName, string>;
