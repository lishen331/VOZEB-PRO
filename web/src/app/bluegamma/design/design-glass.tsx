"use client";

import { useState } from "react";
import { Download, Play, Share2, Sparkles, Wand2, Zap } from "lucide-react";

import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaCardCorners } from "@/components/gamma-ui/gamma-cards";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaGlass, GammaGlassButton, GammaGlassSegmented, GammaLiquidBackdrop } from "@/components/gamma-ui/gamma-glass";
import { GammaProgressRing } from "@/components/gamma-ui/gamma-motion";
import { cn } from "@/lib/utils";

type Quality = "fast" | "balanced" | "best";

const QUALITY_OPTIONS = [
    { value: "fast" as const, label: "极速" },
    { value: "balanced" as const, label: "均衡" },
    { value: "best" as const, label: "高质量" },
];

/** 液态玻璃范例：四个典型场景，都压在图片或液态光斑之上才能看出透光层次 */
export function DesignGlass() {
    const [quality, setQuality] = useState<Quality>("balanced");
    const [playing, setPlaying] = useState(false);

    return (
        <div className="flex flex-col gap-4">
            <figure className="relative m-0 overflow-hidden rounded-[var(--gm-radius-xl)] ring-1 ring-[var(--gm-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                <img src="/style-thumbs/sci-fi.jpg" alt="玻璃控制条示例背景" className="h-[260px] w-full object-cover" />
                <figcaption className="absolute inset-x-5 bottom-5 flex flex-wrap items-center gap-3">
                    <GammaGlass radius="xl" className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                        <GammaIconButton label={playing ? "暂停" : "播放"} onClick={() => setPlaying((value) => !value)}>
                            <Play className={cn("transition-transform", playing && "scale-90")} />
                        </GammaIconButton>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">太阳系行星运行 · 1080P</p>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.22)]">
                                <div className="gm-flow h-full w-2/5 rounded-full" />
                            </div>
                        </div>
                        <GammaIconButton label="分享">
                            <Share2 />
                        </GammaIconButton>
                        <GammaIconButton label="下载">
                            <Download />
                        </GammaIconButton>
                    </GammaGlass>
                    <GammaGlassButton icon={<Wand2 className="size-4" />}>做同款</GammaGlassButton>
                </figcaption>
                <span className="absolute top-5 left-5">
                    <GammaGlass radius="md" interactive={false} className="px-3 py-1.5 text-[11px] font-medium">
                        影视制作 · 概念镜头
                    </GammaGlass>
                </span>
            </figure>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="relative isolate overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-bg-elevated)] p-5 ring-1 ring-[var(--gm-border)]">
                    <GammaLiquidBackdrop />
                    <GammaGlass radius="lg" className="group relative flex flex-col gap-3 p-5">
                        <GammaCardCorners />
                        <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                                <Sparkles className="size-4 text-[var(--gm-accent)]" />
                                生成中
                            </span>
                            <GammaBadge tone="cyan">玻璃卡</GammaBadge>
                        </div>
                        <div className="flex items-center gap-3">
                            <GammaProgressRing value={62}>62%</GammaProgressRing>
                            <div className="min-w-0 text-xs text-[var(--gm-text-2)]">
                                <p className="truncate">新中式系列 · 第 3 套</p>
                                <p className="mt-0.5 text-[var(--gm-text-3)]">服装设计 · 效果图 · 约 3 秒</p>
                            </div>
                        </div>
                        <GammaGlassSegmented label="画质" options={QUALITY_OPTIONS} value={quality} onChange={setQuality} />
                    </GammaGlass>
                </div>

                <div className="relative isolate h-[232px] overflow-hidden rounded-[var(--gm-radius-xl)] ring-1 ring-[var(--gm-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                    <img src="/style-thumbs/ink-wash.jpg" alt="玻璃吸顶栏示例背景" className="size-full object-cover" />
                    <GammaGlass radius="md" interactive={false} className="absolute inset-x-0 top-0 flex items-center gap-3 rounded-none px-4 py-3">
                        <span className="text-[13px] font-medium">灵感广场</span>
                        <span className="ml-auto inline-flex items-center gap-1.5 text-xs">
                            <Zap className="size-3.5 fill-[var(--gm-cyan)] text-[var(--gm-cyan)]" />
                            2,680
                        </span>
                    </GammaGlass>
                    <div className="absolute inset-x-4 bottom-4">
                        {/* 玻璃压在浅色底图上时文字会糊，这里固定用深色玻璃保证可读 */}
                        <GammaGlass radius="md" className="px-4 py-3 text-xs leading-relaxed text-white [--gm-glass-bg:rgba(8,12,22,0.52)] [--gm-glass-inner:rgba(255,255,255,0.14)]">
                            玻璃压在图片上时，模糊 + 饱和会把底图颜色透上来，所以同一块玻璃在不同封面上颜色不同；压在浅色图上要换成深色玻璃，文字才清楚。
                        </GammaGlass>
                    </div>
                </div>

                <div className="relative isolate grid h-[232px] place-items-center overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-bg-elevated)] ring-1 ring-[var(--gm-border)]">
                    <GammaLiquidBackdrop />
                    <GammaGlass strong radius="xl" className="w-[86%] p-5">
                        <p className="text-sm font-semibold">厚玻璃浮层</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--gm-text-2)]">模糊 32px、底色更实，用于对话框与菜单——既透出背景的光，又保证文字可读。</p>
                        <div className="mt-4 flex gap-2">
                            <GammaButton size="sm" variant="glass">
                                取消
                            </GammaButton>
                            <GammaButton size="sm">确认</GammaButton>
                        </div>
                    </GammaGlass>
                </div>
            </div>

            <p className="text-xs leading-relaxed text-[var(--gm-text-3)]">
                玻璃由四层叠成：<span className="font-mono">gm-glass</span>（模糊 + 饱和 + 内侧亮暗边）、<span className="font-mono">gm-glass-sheen</span>（顶部高光）、<span className="font-mono">gm-glass-refract</span>（边缘折射描边）、
                <span className="font-mono">gm-glass-spec</span>（跟随鼠标的高光）。浅色主题下底色从 6% 白提到 55% 白，保证文字对比度；浏览器不支持 backdrop-filter 时降级为半透明底色，布局不变。
            </p>
        </div>
    );
}
