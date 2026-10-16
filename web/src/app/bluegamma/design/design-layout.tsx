"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { cn } from "@/lib/utils";

/*
 * 布局规范：五种页面骨架 + 间距阶梯 + 断点栅格。
 * 骨架是等比缩小的线框，标注了真实尺寸，排版新页面时直接对照。
 */

type LayoutId = "home" | "workspace" | "gallery" | "detail" | "settings";

const LAYOUTS: readonly { id: LayoutId; label: string; note: string }[] = [
    { id: "home", label: "首页", note: "76px 图标栏 + 64px 玻璃顶栏 + 1360px 内容区，区块间距 48px" },
    { id: "workspace", label: "工作台", note: "左 280px 参数面板 + 中间画面 + 右 320px 历史，侧栏可折叠" },
    { id: "gallery", label: "作品广场", note: "顶部筛选吸顶，瀑布流 2/3/4/5 列随宽度变化，卡片间距 16px" },
    { id: "detail", label: "作品详情", note: "左侧作品占 2/3，右侧 1/3 为作者、提示词与操作" },
    { id: "settings", label: "设置", note: "左 220px 分组导航 + 右侧最大 720px 表单，单列阅读" },
];

const SPACING = [
    { token: 4, use: "图标与文字" },
    { token: 8, use: "同组控件" },
    { token: 12, use: "卡片内元素" },
    { token: 16, use: "卡片之间" },
    { token: 24, use: "区块内边距" },
    { token: 48, use: "区块之间" },
];

/** 间距条在示意图里放大的倍数 */
const SPACING_SCALE = 3;

const BREAKPOINTS = [
    { name: "md", width: 768, columns: "2" },
    { name: "lg", width: 1024, columns: "3" },
    { name: "xl", width: 1280, columns: "4–6" },
    { name: "2xl", width: 1536, columns: "6" },
];

/** 瀑布流示意的每列上下两块高度比（写成完整类名，Tailwind 才能扫描到） */
const MASONRY_SPLIT = [
    ["flex-[3]", "flex-[2]"],
    ["flex-[2]", "flex-[3]"],
    ["flex-[4]", "flex-[2]"],
    ["flex-[2]", "flex-[4]"],
    ["flex-[3]", "flex-[3]"],
] as const;

function Box({ className, children, label }: { className?: string; children?: ReactNode; label?: string }) {
    return (
        <div className={cn("relative rounded-md bg-[var(--gm-wash-strong)] ring-1 ring-[var(--gm-border-strong)]", className)}>
            {label ? <span className="absolute top-1 left-1.5 font-mono text-[9px] text-[var(--gm-text-3)]">{label}</span> : null}
            {children}
        </div>
    );
}

function Accent({ className, label }: { className?: string; label?: string }) {
    return <div className={cn("relative rounded-md bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]", className)}>{label ? <span className="absolute top-1 left-1.5 font-mono text-[9px] text-[var(--gm-accent)]">{label}</span> : null}</div>;
}

function Wireframe({ id }: { id: LayoutId }) {
    const rail = <Box className="w-8 shrink-0" label="76" />;
    if (id === "home") {
        return (
            <div className="flex h-full gap-2">
                {rail}
                <div className="flex flex-1 flex-col gap-2">
                    <Box className="h-6" label="顶栏 64" />
                    <div className="grid grid-cols-[1.35fr_1fr] gap-2">
                        <Accent className="h-16" label="轮播" />
                        <Box className="h-16" label="推广" />
                    </div>
                    <Accent className="h-12" label="创作输入" />
                    <div className="grid grid-cols-6 gap-1.5">
                        {Array.from({ length: 6 }, (_, index) => (
                            <Box key={index} className="h-7" />
                        ))}
                    </div>
                    <div className="grid flex-1 grid-cols-4 gap-1.5">
                        {Array.from({ length: 4 }, (_, index) => (
                            <Box key={index} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    if (id === "workspace") {
        return (
            <div className="flex h-full gap-2">
                {rail}
                <Box className="w-20 shrink-0" label="参数 280" />
                <Accent className="flex-1" label="画面" />
                <Box className="w-24 shrink-0" label="历史 320" />
            </div>
        );
    }
    if (id === "gallery") {
        return (
            <div className="flex h-full gap-2">
                {rail}
                <div className="flex flex-1 flex-col gap-2">
                    <Accent className="h-7" label="筛选（吸顶）" />
                    <div className="grid flex-1 grid-cols-5 gap-1.5">
                        {MASONRY_SPLIT.map(([top, bottom], column) => (
                            <div key={column} className="flex flex-col gap-1.5">
                                <Box className={top} />
                                <Box className={bottom} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    if (id === "detail") {
        return (
            <div className="flex h-full gap-2">
                {rail}
                <Accent className="flex-[2]" label="作品 2/3" />
                <div className="flex flex-1 flex-col gap-2">
                    <Box className="h-10" label="作者" />
                    <Box className="flex-1" label="提示词" />
                    <Accent className="h-7" label="做同款" />
                </div>
            </div>
        );
    }
    return (
        <div className="flex h-full gap-2">
            {rail}
            <Box className="w-16 shrink-0" label="导航 220" />
            <div className="flex max-w-[60%] flex-1 flex-col gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                    <Box key={index} className="h-8" />
                ))}
                <Accent className="h-7 w-24" label="保存" />
            </div>
        </div>
    );
}

export function DesignLayout() {
    const [layout, setLayout] = useState<LayoutId>("home");
    const current = LAYOUTS.find((item) => item.id === layout) ?? LAYOUTS[0];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
                <GammaTabs label="页面骨架" options={LAYOUTS.map((item) => ({ value: item.id, label: item.label }))} value={layout} onChange={setLayout} />
                <span className="text-xs text-[var(--gm-text-3)]">{current.note}</span>
            </div>
            <div className="aspect-[16/7] rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
                <Wireframe id={layout} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                    <p className="text-[13px] font-medium">间距阶梯（px）</p>
                    <div className="mt-4 flex flex-col gap-2.5">
                        {SPACING.map((item) => (
                            <div key={item.token} className="flex items-center gap-3 text-xs">
                                <span className="w-6 font-mono text-[var(--gm-text-3)]">{item.token}</span>
                                <span className="h-2.5 rounded-sm bg-[image:var(--gm-gradient)]" style={{ width: item.token * SPACING_SCALE }} />
                                <span className="text-[var(--gm-text-2)]">{item.use}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                    <p className="text-[13px] font-medium">断点与栅格</p>
                    <table className="mt-3 w-full text-left text-xs">
                        <thead className="text-[var(--gm-text-3)]">
                            <tr>
                                <th scope="col" className="py-1.5 font-medium">
                                    断点
                                </th>
                                <th scope="col" className="py-1.5 font-medium">
                                    最小宽度
                                </th>
                                <th scope="col" className="py-1.5 font-medium">
                                    卡片列数
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--gm-border)]">
                            {BREAKPOINTS.map((item) => (
                                <tr key={item.name}>
                                    <td className="py-2 font-mono text-[var(--gm-accent)]">{item.name}</td>
                                    <td className="py-2 font-mono">{item.width}px</td>
                                    <td className="py-2">{item.columns}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-3 text-[11px] leading-relaxed text-[var(--gm-text-3)]">内容区最大宽度 1360px、左右 32px 内边距；图标栏固定 76px，不随断点变化。</p>
                </div>
            </div>
        </div>
    );
}
