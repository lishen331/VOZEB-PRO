"use client";

import type { CSSProperties } from "react";

import { VzSectionTitle } from "@/components/vozeb-ds";

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
        group: "品牌与强调",
        items: [
            ["brand", "品牌主色"],
            ["accent", "辅助强调"],
            ["brand-soft", "品牌浅底"],
        ],
    },
    {
        group: "状态 · 图形与填充",
        items: [
            ["success", "成功"],
            ["warning", "警告"],
            ["danger", "错误"],
            ["info", "信息"],
        ],
    },
    {
        group: "语义文本 · 浅色主题独立加深",
        items: [
            ["accent-text", "强调文字"],
            ["success-text", "成功文字"],
            ["warning-text", "警告文字"],
            ["danger-text", "错误文字"],
            ["info-text", "信息文字"],
        ],
    },
    {
        group: "边界与焦点",
        items: [
            ["border", "装饰边框"],
            ["control-border", "控件边界"],
            ["focus-color", "键盘焦点"],
            ["divider", "分割线"],
        ],
    },
];

const TYPE = [
    ["vz-h-display", "Display · 24–32 / 650", "text-size-3xl", "leading-tight", "把想法变成画面"],
    ["vz-h1", "H1 · 24 / 650", "text-size-2xl", "leading-title", "我的创作项目"],
    ["vz-h2", "H2 · 20 / 600", "text-size-xl", "leading-heading", "生成参数"],
    ["vz-h3", "H3 · 16 / 600", "text-size-lg", "leading-heading", "参考素材"],
    ["vz-body", "Body · 14 / 400", "text-size-md", "leading-body", "描述你想要的画面：主体、场景、风格、光线。"],
    ["vz-caption", "Caption · 12 / 400", "text-size-xs", "leading-relaxed", "支持 JPG / PNG / WEBP，单个不超过 20MB"],
];
const RADII = [
    ["r-sm", 10, "紧凑控件"],
    ["r-md", 14, "按钮 / 输入"],
    ["r-lg", 18, "卡片"],
    ["r-xl", 24, "面板"],
    ["r-2xl", 28, "主容器"],
] as const;
const SPACE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const LEADING = [
    ["leading-tight", "标题 1.2"],
    ["leading-body", "正文 1.55"],
    ["leading-relaxed", "长文 1.65"],
];
const GRADIENTS = [
    ["gradient", "主操作"],
    ["gradient-success", "成功反馈"],
    ["gradient-danger", "错误反馈"],
    ["gradient-glow", "装饰光泽 · 不承载正文"],
];
const codeStyle: CSSProperties = { fontFamily: "var(--vz-font-mono)", overflowWrap: "anywhere" };

export function SectionFoundation() {
    return (
        <section id="vz-sec-foundation" className="vz-panel" style={{ scrollMarginTop: 80 }}>
            <VzSectionTitle eyebrow="Foundation" title="Design Token" desc="颜色、字体、圆角、阴影与间距。所有变量以 --vz- 开头，仅在 .vz-ds 作用域内生效。" />
            <div className="vz-stack" style={{ gap: "var(--vz-space-6)" }}>
                <p className="vz-body">普通文字与三层实色容器对比度 ≥ 4.5:1；控件边界与键盘焦点 ≥ 3:1。装饰性分隔与卡片边框保留低对比，避免界面过重。</p>
                {COLORS.map((group) => (
                    <div key={group.group} className="vz-stack" style={{ gap: "var(--vz-space-3)" }}>
                        <span className="vz-eyebrow">{group.group}</span>
                        <div className="vz-grid" style={{ "--min": "150px", gap: "var(--vz-space-3)" } as CSSProperties}>
                            {group.items.map(([token, label]) => (
                                <div key={token} className="vz-stack" style={{ gap: "var(--vz-space-2)" }}>
                                    <div style={{ height: 56, borderRadius: "var(--vz-r-md)", background: `var(--vz-${token})`, border: "1px solid var(--vz-border)", boxShadow: "var(--vz-highlight)" }} />
                                    <div className="vz-stack" style={{ gap: 0 }}>
                                        <span style={{ fontSize: "var(--vz-text-size-sm)", fontWeight: 560 }}>{label}</span>
                                        <code className="vz-caption" style={codeStyle}>{`--vz-${token}`}</code>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                <div className="vz-stack" style={{ gap: "var(--vz-space-3)" }}>
                    <span className="vz-eyebrow">功能渐变与装饰光泽分离</span>
                    <div className="vz-grid" style={{ "--min": "180px", gap: "var(--vz-space-3)" } as CSSProperties}>
                        {GRADIENTS.map(([token, label]) => (
                            <div key={token} className="vz-stack" style={{ gap: "var(--vz-space-2)" }}>
                                <div style={{ height: 56, borderRadius: "var(--vz-r-md)", background: `var(--vz-${token})` }} />
                                <span className="vz-caption">{label}</span>
                                <code className="vz-caption" style={codeStyle}>{`--vz-${token}`}</code>
                            </div>
                        ))}
                    </div>
                </div>

                <hr className="vz-divider" />
                <div className="vz-stack" style={{ gap: "var(--vz-space-4)" }}>
                    <span className="vz-eyebrow">字体层级 · 系统 / SF Pro / 苹方</span>
                    {TYPE.map(([cls, meta, size, leading, sample]) => (
                        <div key={cls} className="vz-grid" style={{ "--min": "240px", gap: "var(--vz-space-3)", alignItems: "baseline" } as CSSProperties}>
                            <div className="vz-stack" style={{ gap: "var(--vz-space-1)" }}>
                                <span className="vz-caption">{meta}</span>
                                <code className="vz-caption" style={codeStyle}>{`--vz-${size}`}</code>
                                <code className="vz-caption" style={codeStyle}>{`--vz-${leading}`}</code>
                            </div>
                            <span className={cls} style={{ overflowWrap: "anywhere" }}>
                                {sample}
                            </span>
                        </div>
                    ))}
                    <div className="vz-grid" style={{ "--min": "180px" } as CSSProperties}>
                        {LEADING.map(([token, label]) => (
                            <div key={token} className="vz-card" style={{ padding: "var(--vz-space-4)" }}>
                                <code className="vz-caption" style={codeStyle}>{`--vz-${token}`}</code>
                                <p className="vz-body" style={{ marginTop: "var(--vz-space-2)", lineHeight: `var(--vz-${token})` }}>
                                    {label}
                                    <br />
                                    统一行高，让内容更易浏览。
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <hr className="vz-divider" />
                <div className="vz-grid" style={{ "--min": "280px", gap: "var(--vz-space-6)" } as CSSProperties}>
                    <div className="vz-stack">
                        <span className="vz-eyebrow">圆角</span>
                        <div className="vz-row" style={{ alignItems: "flex-end" }}>
                            {RADII.map(([token, size, label]) => (
                                <div key={token} className="vz-stack" style={{ gap: "var(--vz-space-2)", justifyItems: "center" }}>
                                    <div style={{ width: 52, height: 52, borderRadius: `var(--vz-${token})`, background: "var(--vz-surface-3)", border: "1px solid var(--vz-border-strong)" }} />
                                    <span className="vz-caption vz-num">{`${size}px`}</span>
                                    <span className="vz-caption">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="vz-stack">
                        <span className="vz-eyebrow">阴影层级</span>
                        <div className="vz-row" style={{ gap: "var(--vz-space-4)" }}>
                            {["shadow-1", "shadow-2", "shadow-3"].map((token, index) => (
                                <div
                                    key={token}
                                    style={{ display: "grid", placeItems: "center", width: 72, height: 72, borderRadius: "var(--vz-r-lg)", background: "var(--vz-surface-2)", boxShadow: `var(--vz-${token})`, border: "1px solid var(--vz-border)" }}
                                >
                                    <span className="vz-caption">{`L${index + 1}`}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="vz-stack">
                    <span className="vz-eyebrow">间距 · 4px 基准 / 8px 节奏</span>
                    <div className="vz-grid" style={{ "--min": "124px", gap: "var(--vz-space-3)", alignItems: "end" } as CSSProperties}>
                        {SPACE.map((step) => (
                            <div key={step} className="vz-stack" style={{ gap: "var(--vz-space-2)", justifyItems: "start" }}>
                                <div style={{ width: `var(--vz-space-${step})`, height: `var(--vz-space-${step})`, borderRadius: 3, background: "var(--vz-brand)" }} />
                                <code className="vz-caption" style={codeStyle}>{`--vz-space-${step}`}</code>
                                <span className="vz-caption vz-num">{`${step * 4}px`}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
