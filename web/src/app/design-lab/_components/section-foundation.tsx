"use client";

import type { CSSProperties } from "react";

import { LabSectionTitle } from "@/components/vz-lab";

const COLORS: { group: string; items: [string, string][] }[] = [
    {
        group: "背景与容器",
        items: [
            ["bg", "页面背景"],
            ["surface-1", "一级容器"],
            ["surface-2", "二级容器"],
            ["surface-3", "三级容器"],
        ],
    },
    {
        group: "文本",
        items: [
            ["text-1", "主文本"],
            ["text-2", "次文本"],
            ["text-3", "弱化文本"],
        ],
    },
    {
        group: "品牌",
        items: [
            ["brand", "品牌主色"],
            ["accent", "辅助强调"],
            ["brand-soft", "品牌浅底"],
        ],
    },
    {
        group: "状态",
        items: [
            ["success", "成功"],
            ["warning", "警告"],
            ["danger", "错误"],
            ["info", "信息"],
        ],
    },
];
const TYPE = [
    ["vzl-display", "Display 32/650", "把想法变成画面"],
    ["vzl-h1", "H1 24/650", "我的创作项目"],
    ["vzl-h2", "H2 20/600", "生成参数"],
    ["vzl-h3", "H3 16/600", "参考素材"],
    ["vzl-body", "Body 14/400", "描述你想要的画面：主体、场景、风格、光线。"],
    ["vzl-caption", "Caption 12/400", "支持 JPG / PNG / WEBP，单个不超过 20MB"],
];
const RADII = [
    ["r-sm", 10, "按钮/输入"],
    ["r-md", 14, "控件"],
    ["r-lg", 18, "卡片"],
    ["r-xl", 24, "面板"],
    ["r-2xl", 28, "主容器"],
] as const;
const SPACE = [4, 8, 12, 16, 20, 24, 32, 48];
const grid = (min: string, gap = 10) => ({ "--min": min, gap }) as CSSProperties;

export function SectionFoundation() {
    return (
        <section id="vzl-sec-foundation" className="vzl-panel" style={{ scrollMarginTop: 80 }}>
            <LabSectionTitle eyebrow="Foundation" title="Design Token" desc="所有变量以 --vzl- 开头，仅在 .vzl 作用域内生效，不影响现有页面。" />
            <div className="vzl-stack" style={{ gap: 24 }}>
                {COLORS.map((group) => (
                    <div key={group.group} className="vzl-stack" style={{ gap: 10 }}>
                        <span className="vzl-eyebrow">{group.group}</span>
                        <div className="vzl-grid" style={grid("150px")}>
                            {group.items.map(([token, label]) => (
                                <div key={token} style={{ display: "grid", gap: 8, minWidth: 0 }}>
                                    <div style={{ height: 56, borderRadius: 14, background: `var(--vzl-${token})`, border: "1px solid var(--vzl-border)" }} />
                                    <span style={{ fontSize: 13, fontWeight: 560 }}>{label}</span>
                                    <code className="vzl-caption" style={{ fontFamily: "var(--vzl-mono)", overflowWrap: "anywhere" }}>{`--vzl-${token}`}</code>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                <div className="vzl-stack" style={{ gap: 10 }}>
                    <span className="vzl-eyebrow">品牌渐变 · 仅用于主操作、生成、进度与选中</span>
                    <div className="vzl-grid" style={grid("220px")}>
                        <div style={{ height: 56, borderRadius: 14, background: "var(--vzl-gradient)", boxShadow: "var(--vzl-glow)" }} />
                        <div style={{ height: 56, borderRadius: 14, background: "var(--vzl-gradient-glow)" }} />
                    </div>
                </div>
                <hr className="vzl-divider" />
                <div className="vzl-stack" style={{ gap: 14 }}>
                    <span className="vzl-eyebrow">字体层级 · SF Pro / 苹方 / 系统字体</span>
                    {TYPE.map(([cls, meta, sample]) => (
                        <div key={cls} style={{ display: "grid", gridTemplateColumns: "minmax(0, 120px) minmax(0, 1fr)", gap: 16, alignItems: "baseline" }}>
                            <code className="vzl-caption" style={{ fontFamily: "var(--vzl-mono)" }}>
                                {meta}
                            </code>
                            <span className={cls} style={{ overflowWrap: "anywhere" }}>
                                {sample}
                            </span>
                        </div>
                    ))}
                </div>
                <hr className="vzl-divider" />
                <div className="vzl-grid" style={grid("260px", 24)}>
                    <div className="vzl-stack">
                        <span className="vzl-eyebrow">圆角</span>
                        <div className="vzl-row" style={{ alignItems: "flex-end" }}>
                            {RADII.map(([token, px, use]) => (
                                <div key={token} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                                    <div style={{ width: 48, height: 48, borderRadius: `var(--vzl-${token})`, background: "var(--vzl-surface-3)", border: "1px solid var(--vzl-border-strong)" }} />
                                    <span className="vzl-caption vzl-num">{`${px}px`}</span>
                                    <span className="vzl-caption" style={{ fontSize: 11 }}>
                                        {use}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="vzl-stack">
                        <span className="vzl-eyebrow">阴影层级</span>
                        <div className="vzl-row" style={{ gap: 16 }}>
                            {[1, 2, 3].map((n) => (
                                <div key={n} style={{ display: "grid", placeItems: "center", width: 72, height: 72, borderRadius: 18, background: "var(--vzl-surface-2)", boxShadow: `var(--vzl-shadow-${n})`, border: "1px solid var(--vzl-border)" }}>
                                    <span className="vzl-caption">{`L${n}`}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="vzl-stack">
                        <span className="vzl-eyebrow">间距 · 4px 基准</span>
                        <div className="vzl-row" style={{ alignItems: "flex-end", gap: 8 }}>
                            {SPACE.map((s) => (
                                <div key={s} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                                    <div style={{ width: s, height: s, borderRadius: 3, background: "var(--vzl-brand)" }} />
                                    <span className="vzl-caption vzl-num" style={{ fontSize: 11 }}>
                                        {s}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
