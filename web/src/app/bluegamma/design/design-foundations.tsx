"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { cn } from "@/lib/utils";

const BRAND_COLORS = [
    { name: "Gamma Blue", token: "--gm-blue", hex: "#0050F5", note: "Logo 圆底 · 主行动、选中、焦点" },
    { name: "Gamma Cyan", token: "--gm-cyan", hex: "#28EBFA", note: "Logo γ 笔画 · 高亮、进度、强调" },
    { name: "Gamma Gradient", token: "--gm-gradient", hex: "#0050F5 → #28EBFA", note: "主按钮、品牌字、公告条", gradient: true },
];

const NEUTRALS = [
    { token: "--gm-bg", hex: "#04060C", label: "页面底" },
    { token: "--gm-bg-elevated", hex: "#080C16", label: "导航栏" },
    { token: "--gm-surface", hex: "#0D121E", label: "卡片" },
    { token: "--gm-surface-2", hex: "#131A29", label: "浮层" },
    { token: "--gm-surface-3", hex: "#1B2335", label: "选中底" },
    { token: "--gm-text", hex: "#F1F5FF", label: "主文字" },
    { token: "--gm-text-2", hex: "#9BA8C4", label: "次文字" },
    { token: "--gm-text-3", hex: "#64718F", label: "辅助文字" },
];

const SEMANTIC = [
    { token: "--gm-success", hex: "#23D18B", label: "成功" },
    { token: "--gm-warning", hex: "#FFB547", label: "警告" },
    { token: "--gm-danger", hex: "#FF4D6D", label: "危险" },
];

const TYPE_SCALE = [
    { size: "32px / 600", sample: "把每个灵感，变成一件作品", className: "text-[32px] font-semibold" },
    { size: "26px / 600", sample: "12 个设计专业", className: "text-[26px] font-semibold" },
    { size: "18px / 600", sample: "专业方向 · 区块标题", className: "text-lg font-semibold" },
    { size: "15px / 500", sample: "卡片标题、输入正文", className: "text-[15px] font-medium" },
    { size: "13px / 400", sample: "说明文字、按钮、标签", className: "text-[13px] text-[var(--gm-text-2)]" },
    { size: "11px / 500", sample: "徽标 · 时间 · 元信息", className: "text-[11px] font-medium text-[var(--gm-text-3)]" },
];

const RADII = [
    { token: "--gm-radius-sm", value: "8px", use: "按钮小号、菜单项" },
    { token: "--gm-radius", value: "12px", use: "按钮、输入框" },
    { token: "--gm-radius-lg", value: "16px", use: "卡片" },
    { token: "--gm-radius-xl", value: "22px", use: "轮播、对话框、输入面板" },
];

const COPIED_MS = 1200;

function useCopy() {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = (value: string) => {
        void navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(value);
        window.setTimeout(() => setCopied((current) => (current === value ? null : current)), COPIED_MS);
    };
    return { copied, copy };
}

function CopyHint({ active }: { active: boolean }) {
    return active ? <Check className="size-3.5 text-[var(--gm-success)]" aria-label="已复制" /> : <Copy className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />;
}

export function DesignBrand() {
    return (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="relative grid min-h-[260px] place-items-center overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                <div aria-hidden className="gm-aurora absolute size-72 rounded-full bg-[var(--gm-blue)] opacity-30 blur-[90px]" />
                <div aria-hidden className="gm-aurora absolute top-6 right-16 size-40 rounded-full bg-[var(--gm-cyan)] opacity-20 blur-[70px] [animation-delay:-4s]" />
                <GammaLogo size={88} stacked className="relative" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid place-items-center rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface-light)] p-6">
                    <span className="inline-flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 品牌资源 */}
                        <img src="/brand/bluegamma-mark.png" alt="" width={40} height={40} className="rounded-full" />
                        <span className="flex flex-col leading-none">
                            <span className="text-[15px] font-semibold tracking-[0.06em] text-[#0b1530]">布鲁伽马</span>
                            <span className="mt-1 text-[10px] font-medium tracking-[0.22em] text-[var(--gm-blue)] uppercase">BlueGamma</span>
                        </span>
                    </span>
                </div>
                <div className="grid place-items-center rounded-[var(--gm-radius-lg)] bg-[image:var(--gm-gradient)] p-6">
                    <GammaLogo size={40} />
                </div>
                <div className="col-span-2 rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-5 text-[13px] leading-relaxed text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)]">
                    <p className="font-medium text-[var(--gm-text)]">品牌调性：深空 · 电光 · 流动</p>
                    <p className="mt-1.5">全部取自 Logo：深蓝圆底是「深空」，青色 γ 笔画是「电光」。界面以近黑深蓝为底，蓝色承担行动，青色只用在需要被看见的地方（选中、进度、高亮），动效像 γ 笔画一样连续、带弹性。</p>
                </div>
            </div>
        </div>
    );
}

export function DesignColors() {
    const { copied, copy } = useCopy();
    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-3">
                {BRAND_COLORS.map((color) => (
                    <button
                        key={color.token}
                        type="button"
                        onClick={() => copy(color.hex)}
                        aria-label={`复制 ${color.name} ${color.hex}`}
                        className="group overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] text-left ring-1 ring-[var(--gm-border)] transition-shadow hover:ring-[var(--gm-border-strong)]"
                    >
                        <div className="h-28 transition-transform duration-500 group-hover:scale-[1.03]" style={{ background: color.gradient ? "var(--gm-gradient)" : color.hex }} />
                        <div className="p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">{color.name}</span>
                                <CopyHint active={copied === color.hex} />
                            </div>
                            <p className="mt-1 font-mono text-xs text-[var(--gm-accent)]">{color.hex}</p>
                            <p className="mt-1.5 text-xs text-[var(--gm-text-3)]">
                                {color.token} · {color.note}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
                {NEUTRALS.map((color) => (
                    <button key={color.token} type="button" onClick={() => copy(color.hex)} aria-label={`复制 ${color.label} ${color.hex}`} className="group text-left">
                        <div className="h-14 rounded-[var(--gm-radius)] ring-1 ring-[var(--gm-border-strong)] transition-transform group-hover:-translate-y-0.5" style={{ background: color.hex }} />
                        <div className="mt-2 flex items-center gap-1 text-xs">
                            {color.label}
                            <CopyHint active={copied === color.hex} />
                        </div>
                        <p className="font-mono text-[11px] text-[var(--gm-text-3)]">{color.hex}</p>
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-3">
                {SEMANTIC.map((color) => (
                    <button
                        key={color.token}
                        type="button"
                        onClick={() => copy(color.hex)}
                        aria-label={`复制 ${color.label} ${color.hex}`}
                        className="group inline-flex items-center gap-2 rounded-full bg-[var(--gm-surface)] py-1.5 pr-3 pl-1.5 text-xs ring-1 ring-[var(--gm-border)]"
                    >
                        <span className="size-5 rounded-full" style={{ background: color.hex }} />
                        {color.label}
                        <span className="font-mono text-[var(--gm-text-3)]">{color.hex}</span>
                        <CopyHint active={copied === color.hex} />
                    </button>
                ))}
            </div>
        </div>
    );
}

export function DesignTypeAndRadius() {
    return (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="divide-y divide-[var(--gm-border)] rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                {TYPE_SCALE.map((row) => (
                    <div key={row.size} className="flex items-baseline gap-6 px-5 py-3.5">
                        <span className="w-24 shrink-0 font-mono text-[11px] text-[var(--gm-text-3)]">{row.size}</span>
                        <span className={cn("truncate", row.className)}>{row.sample}</span>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
                {RADII.map((radius) => (
                    <div key={radius.token} className="flex flex-col gap-3 rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
                        <div className="h-14 border-2 border-[var(--gm-accent)] bg-[var(--gm-accent-soft)]" style={{ borderRadius: radius.value }} />
                        <div>
                            <p className="text-sm font-medium">{radius.value}</p>
                            <p className="mt-0.5 text-[11px] text-[var(--gm-text-3)]">{radius.use}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
