"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";

import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GAMMA_FONT_OPTIONS, loadGammaFontSheets } from "@/components/gamma-ui/gamma-fonts";
import { useGammaTheme } from "@/components/gamma-ui/gamma-theme";
import { cn } from "@/lib/utils";

const SAMPLE_TITLE = "把每个灵感，变成一件作品";
const SAMPLE_BODY = "选择专业方向，描述你的设计构想，布鲁伽马会生成效果图、概念镜头与成片。";
const SAMPLE_META = "2,680 积分 · 1080P · 12 个专业";

/** 字体方案对比：四套方案同时渲染同一段样例，点击即切换预览字体 */
export function DesignFonts() {
    const { fontId, setFontId } = useGammaTheme();

    // 对比区需要同时显示全部方案，这里把四套样式表都加载进来
    useEffect(() => {
        GAMMA_FONT_OPTIONS.forEach(loadGammaFontSheets);
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-2">
                {GAMMA_FONT_OPTIONS.map((option) => {
                    const current = option.id === fontId;
                    return (
                        <article
                            key={option.id}
                            className={cn(
                                "flex flex-col gap-4 rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-5 ring-1 transition-shadow duration-200",
                                current ? "shadow-[var(--gm-shadow)] ring-[var(--gm-accent-ring)]" : "ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)]",
                            )}
                        >
                            <header className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-[15px] font-semibold">{option.name}</h3>
                                        {option.recommended ? <GammaBadge tone="cyan">推荐</GammaBadge> : null}
                                        {current ? <GammaBadge tone="success">当前</GammaBadge> : null}
                                    </div>
                                    <p className="mt-1 text-xs text-[var(--gm-text-3)]">{option.mood}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFontId(option.id)}
                                    aria-pressed={current}
                                    className={cn(
                                        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                                        current ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]" : "bg-[var(--gm-wash)] text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]",
                                    )}
                                >
                                    {current ? <Check className="size-3.5" /> : null}
                                    {current ? "正在使用" : "应用到预览"}
                                </button>
                            </header>

                            <div className="flex flex-col gap-2.5 border-t border-[var(--gm-border)] pt-4">
                                <p className="text-[26px] leading-tight font-semibold" style={{ fontFamily: option.display }}>
                                    {SAMPLE_TITLE}
                                </p>
                                <p className="text-sm leading-relaxed text-[var(--gm-text-2)]" style={{ fontFamily: option.body }}>
                                    {SAMPLE_BODY}
                                </p>
                                <p className="text-[13px] tabular-nums text-[var(--gm-text-3)]" style={{ fontFamily: option.body }}>
                                    {SAMPLE_META}
                                </p>
                                <p className="text-xs text-[var(--gm-text-3)]" style={{ fontFamily: option.body }}>
                                    Aa Bb Cc 0123456789 — The quick brown fox
                                </p>
                            </div>

                            <footer className="flex flex-col gap-1.5 text-xs text-[var(--gm-text-3)]">
                                <p className="leading-relaxed">{option.note}</p>
                                <p>授权：{option.license}</p>
                            </footer>
                        </article>
                    );
                })}
            </div>
            <p className="text-xs leading-relaxed text-[var(--gm-text-3)]">
                字体已自托管在 <span className="font-mono">/public/fonts</span>，全部按 unicode-range 切片，浏览器只下载页面实际用到的那几片。顶栏（首页）或左侧栏底部（本页）的「Aa」按钮也能切换，选择会记在本地。
            </p>
        </div>
    );
}
