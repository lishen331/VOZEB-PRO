"use client";

import type { CSSProperties } from "react";

import { LabSectionTitle, LabTag } from "@/components/vz-lab";

const RULES = [
    ["≥ 1280px", "桌面", "侧栏展开 248px，左右双栏工作区"],
    ["1101–1279px", "小桌面", "侧栏收为 76px 图标栏，悬停显示 Tooltip"],
    ["768–1100px", "平板", "工作区改单栏，按钮矩阵可横向滑动"],
    ["< 768px", "手机", "侧栏改抽屉、顶栏精简、生成按钮通栏、操作区换行"],
];
const CHECKS = ["1440px 桌面", "1280px 桌面", "430px 手机", "390px 手机"];

export function SectionResponsive() {
    return (
        <section id="vzl-sec-responsive" className="vzl-panel" style={{ scrollMarginTop: 80 }}>
            <LabSectionTitle eyebrow="Responsive" title="响应式规则" desc="本页即为真实响应式实现，直接缩放浏览器窗口即可验收。" />
            <div className="vzl-grid" style={{ "--min": "220px", gap: 10 } as CSSProperties}>
                {RULES.map(([bp, device, rule]) => (
                    <div key={bp} className="vzl-card" style={{ padding: 14, display: "grid", gap: 6 }}>
                        <div className="vzl-row" style={{ gap: 6 }}>
                            <LabTag tone="brand" className="vzl-num">
                                {bp}
                            </LabTag>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{device}</span>
                        </div>
                        <span className="vzl-caption">{rule}</span>
                    </div>
                ))}
            </div>
            <div className="vzl-row" style={{ marginTop: 16 }}>
                <span className="vzl-caption">已检查宽度：</span>
                {CHECKS.map((c) => (
                    <LabTag key={c} tone="success" dot>
                        {c}
                    </LabTag>
                ))}
            </div>
        </section>
    );
}
