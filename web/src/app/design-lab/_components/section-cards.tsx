"use client";

import { AlertOctagon, FolderPlus, ImageOff, RotateCcw, Wand2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";

import { LabAudioPreview, LabButton, LabCard, LabMediaCard, LabSectionTitle, LabSkeleton, LabState, LabTag, LabVideoPreview } from "@/components/vz-lab";

import { GALLERY, IMG } from "./mock-data";

const grid = (min: string) => ({ "--min": min }) as CSSProperties;

export function SectionCards() {
    const [selected, setSelected] = useState<string[]>(["g2"]);
    const toggle = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

    return (
        <section id="vzl-sec-cards" className="vzl-panel" style={{ scrollMarginTop: 80, display: "grid", gap: 32 }}>
            <div>
                <LabSectionTitle eyebrow="Cards" title="卡片" desc="普通卡片、可交互卡片（鼠标跟随光晕 + 上浮 2px）、选中与禁用态。" />
                <div className="vzl-grid" style={grid("200px")}>
                    <LabCard>
                        <div className="vzl-stack" style={{ gap: 8 }}>
                            <LabTag tone="info">普通卡片</LabTag>
                            <span className="vzl-h3">本周创作</span>
                            <span className="vzl-display vzl-num">128</span>
                            <span className="vzl-caption">较上周 +24%</span>
                        </div>
                    </LabCard>
                    <LabCard interactive>
                        <div className="vzl-stack" style={{ gap: 8 }}>
                            <Wand2 aria-hidden style={{ width: 22, height: 22, color: "var(--vzl-brand-text)" }} />
                            <span className="vzl-h3">可交互卡片</span>
                            <span className="vzl-caption">移动鼠标看跟随光晕，Tab 可聚焦。</span>
                        </div>
                    </LabCard>
                    <LabCard interactive force="hover">
                        <div className="vzl-stack" style={{ gap: 8 }}>
                            <LabTag>Hover</LabTag>
                            <span className="vzl-h3">悬停态</span>
                            <span className="vzl-caption">上浮、边框与阴影加强。</span>
                        </div>
                    </LabCard>
                    <LabCard interactive selected>
                        <div className="vzl-stack" style={{ gap: 8 }}>
                            <LabTag tone="brand">Selected</LabTag>
                            <span className="vzl-h3">选中态</span>
                            <span className="vzl-caption">品牌色描边 + 外光环。</span>
                        </div>
                    </LabCard>
                    <LabCard interactive disabled>
                        <div className="vzl-stack" style={{ gap: 8 }}>
                            <LabTag>Disabled</LabTag>
                            <span className="vzl-h3">不可用</span>
                            <span className="vzl-caption">降低透明度，不响应交互。</span>
                        </div>
                    </LabCard>
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="Media" title="媒体卡片" desc="点击或按空格切换多选，悬停显示操作栏。" extra={<LabTag tone="brand" className="vzl-num">{`已选 ${selected.length}`}</LabTag>} />
                <div className="vzl-grid" style={grid("200px")}>
                    {GALLERY.map((item) => (
                        <LabMediaCard key={item.id} {...item} selected={selected.includes(item.id)} onSelect={() => toggle(item.id)} />
                    ))}
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="Preview" title="图片 · 视频 · 音频预览" />
                <div className="vzl-grid" style={grid("280px")}>
                    <LabMediaCard src={IMG.hero} title="图片预览 · 横幅海报" meta="2048 × 1152 · PNG · 3.2MB" ratio="16 / 9" />
                    <LabVideoPreview src={IMG.video} poster={IMG.hero} title="视频预览 · 开场镜头" />
                    <LabAudioPreview title="音频预览 · 旁白第 1 段" />
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="States" title="Loading · Skeleton · Empty · Error" />
                <div className="vzl-grid" style={grid("220px")}>
                    <LabCard style={{ display: "grid", gap: 12, alignContent: "start" }} aria-busy="true" aria-label="内容加载中">
                        <LabSkeleton height={120} radius={14} />
                        <LabSkeleton width="70%" />
                        <LabSkeleton width="45%" height={12} />
                        <div className="vzl-row">
                            <LabSkeleton width={64} height={24} radius={8} />
                            <LabSkeleton width={88} height={24} radius={8} />
                        </div>
                    </LabCard>
                    <LabState
                        icon={FolderPlus}
                        title="还没有作品"
                        desc="从一句提示词开始第一次创作。"
                        action={
                            <LabButton size="sm" variant="primary" icon={Wand2}>
                                开始创作
                            </LabButton>
                        }
                    />
                    <LabState icon={ImageOff} title="没有匹配的结果" desc="换个关键词，或清除筛选条件。" action={<LabButton size="sm">清除筛选</LabButton>} />
                    <LabState
                        tone="danger"
                        icon={AlertOctagon}
                        title="加载失败"
                        desc="网络连接中断（502），请稍后重试。"
                        action={
                            <LabButton size="sm" icon={RotateCcw}>
                                重试
                            </LabButton>
                        }
                    />
                </div>
            </div>
        </section>
    );
}
