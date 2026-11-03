"use client";

import { AlertOctagon, CheckCircle2, FolderPlus, ImageOff, RotateCcw, Upload, Wand2 } from "lucide-react";
import { useState } from "react";

import { VzAudioPreview, VzButton, VzCard, VzMediaCard, VzSectionTitle, VzSkeleton, VzStateBlock, VzTag, VzVideoPreview } from "@/components/vozeb-ds";

import { GALLERY, IMG } from "./mock-data";

export function SectionCards() {
    const [selected, setSelected] = useState<string[]>(["g2"]);
    const [filtered, setFiltered] = useState(true);
    const [loadError, setLoadError] = useState(true);
    const [cardSelected, setCardSelected] = useState(false);
    const toggle = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

    return (
        <section id="vz-sec-cards" className="vz-panel" style={{ scrollMarginTop: 80, display: "grid", gap: 32 }}>
            <div>
                <VzSectionTitle eyebrow="Cards" title="卡片" desc="普通卡片、可交互卡片（鼠标跟随光晕 + 轻微上浮）与选中态。" />
                <div className="vz-grid" style={{ "--min": "220px" } as React.CSSProperties}>
                    <VzCard>
                        <div className="vz-stack" style={{ gap: 8 }}>
                            <VzTag tone="info">普通卡片</VzTag>
                            <span className="vz-h3">本周创作概览</span>
                            <span className="vz-h-display vz-num">128</span>
                            <span className="vz-caption">较上周 +24%</span>
                        </div>
                    </VzCard>
                    <VzCard
                        interactive
                        selected={cardSelected}
                        role="button"
                        aria-pressed={cardSelected}
                        onClick={() => setCardSelected((value) => !value)}
                        onKeyDown={(event) => {
                            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                                event.preventDefault();
                                setCardSelected((value) => !value);
                            }
                        }}
                    >
                        <div className="vz-stack" style={{ gap: 8 }}>
                            <Wand2 aria-hidden style={{ width: 22, height: 22, color: "var(--vz-brand-text)" }} />
                            <span className="vz-h3">可交互卡片</span>
                            <span className="vz-caption">移动鼠标查看光晕，点击或 Enter 切换选中。</span>
                        </div>
                    </VzCard>
                    <VzCard interactive force="hover">
                        <div className="vz-stack" style={{ gap: 8 }}>
                            <VzTag>Hover</VzTag>
                            <span className="vz-h3">悬停态</span>
                            <span className="vz-caption">上浮 2px，边框与阴影加强。</span>
                        </div>
                    </VzCard>
                    <VzCard interactive selected>
                        <div className="vz-stack" style={{ gap: 8 }}>
                            <VzTag tone="brand">Selected</VzTag>
                            <span className="vz-h3">选中态</span>
                            <span className="vz-caption">品牌色描边 + 外光环。</span>
                        </div>
                    </VzCard>
                    <VzCard interactive disabled>
                        <div className="vz-stack" style={{ gap: 8 }}>
                            <VzTag>Disabled</VzTag>
                            <span className="vz-h3">不可用</span>
                            <span className="vz-caption">降低透明度，不响应交互。</span>
                        </div>
                    </VzCard>
                </div>
            </div>

            <div>
                <VzSectionTitle eyebrow="Media" title="媒体卡片" desc="点击多选；可放大、收藏和下载。所有状态仅保留在当前预览。" extra={<VzTag tone="brand" className="vz-num">{`已选 ${selected.length}`}</VzTag>} />
                <div className="vz-grid" style={{ "--min": "220px" } as React.CSSProperties}>
                    {GALLERY.map((item) => (
                        <VzMediaCard key={item.id} {...item} selected={selected.includes(item.id)} onSelect={() => toggle(item.id)} />
                    ))}
                </div>
            </div>

            <div>
                <VzSectionTitle eyebrow="Preview" title="图片 · 视频 · 音频预览" />
                <div className="vz-grid" style={{ "--min": "280px" } as React.CSSProperties}>
                    <VzMediaCard src={IMG.hero} title="图片预览 · 横幅海报" meta="2048 × 1152 · PNG · 3.2MB" ratio="16 / 9" />
                    <VzVideoPreview src={IMG.video} poster={IMG.hero} title="视频预览 · 开场镜头" />
                    <VzAudioPreview title="音频预览 · 本地合成音景" />
                </div>
            </div>

            <div>
                <VzSectionTitle eyebrow="States" title="Loading · Skeleton · Empty · Error" />
                <div className="vz-grid" style={{ "--min": "240px" } as React.CSSProperties}>
                    <VzCard style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="加载中">
                        <VzSkeleton height={140} radius={14} />
                        <VzSkeleton width="70%" />
                        <VzSkeleton width="45%" height={12} />
                        <div className="vz-row">
                            <VzSkeleton width={64} height={24} radius={8} />
                            <VzSkeleton width={88} height={24} radius={8} />
                        </div>
                    </VzCard>
                    <VzStateBlock
                        icon={FolderPlus}
                        title="还没有作品"
                        desc="从一句提示词开始；跳转到本页创作演示。"
                        action={
                            <VzButton
                                size="sm"
                                variant="primary"
                                icon={Wand2}
                                onClick={() => document.getElementById("vz-sec-workflow")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}
                            >
                                开始创作
                            </VzButton>
                        }
                    />
                    <VzStateBlock
                        icon={filtered ? ImageOff : CheckCircle2}
                        title={filtered ? "没有匹配的结果" : "筛选已清除"}
                        desc={filtered ? "换个关键词，或清除筛选条件（本地状态演示）。" : `已恢复 ${GALLERY.length} 个本地样例，不会请求素材库。`}
                        action={
                            <VzButton size="sm" variant="secondary" onClick={() => setFiltered((value) => !value)}>
                                {filtered ? "清除筛选" : "重新展示空态"}
                            </VzButton>
                        }
                    />
                    <VzStateBlock
                        tone={loadError ? "danger" : undefined}
                        icon={loadError ? AlertOctagon : CheckCircle2}
                        title={loadError ? "加载失败" : "加载完成"}
                        desc={loadError ? "网络错误状态样例，点击重试查看恢复反馈。" : "本地样例已恢复；未调用真实接口。"}
                        action={
                            <VzButton size="sm" variant="secondary" icon={RotateCcw} onClick={() => setLoadError((value) => !value)}>
                                {loadError ? "重试" : "再次模拟失败"}
                            </VzButton>
                        }
                    />
                    <VzStateBlock icon={Upload} title="加载中…" desc="正在同步你的素材库" action={<span className="vz-spinner" style={{ color: "var(--vz-brand-text)" }} aria-label="加载中" />} />
                </div>
            </div>
        </section>
    );
}
