"use client";

import type { LucideIcon } from "lucide-react";
import {
    ArrowDown,
    ArrowRight,
    Bell,
    BellOff,
    Bookmark,
    Check,
    ChevronDown,
    Cloud,
    Copy,
    Download,
    Eye,
    EyeOff,
    Heart,
    House,
    Image as ImageIcon,
    Lock,
    LockOpen,
    Menu,
    Mic,
    MicOff,
    Moon,
    Pause,
    Pencil,
    Play,
    Plus,
    Search,
    Settings,
    Sparkles,
    Square,
    Star,
    Sun,
    Trash2,
    Upload,
    User,
    Video,
    Volume2,
    VolumeX,
    Wand2,
    X,
    Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { GammaIconMorph, MORPH_SPRINGS, type MorphSpring } from "@/components/gamma-ui/gamma-icon-morph";
import { cn } from "@/lib/utils";

const ICONS: readonly { name: string; icon: LucideIcon }[] = [
    { name: "menu", icon: Menu },
    { name: "x", icon: X },
    { name: "check", icon: Check },
    { name: "plus", icon: Plus },
    { name: "arrow-right", icon: ArrowRight },
    { name: "arrow-down", icon: ArrowDown },
    { name: "chevron-down", icon: ChevronDown },
    { name: "play", icon: Play },
    { name: "pause", icon: Pause },
    { name: "square", icon: Square },
    { name: "sun", icon: Sun },
    { name: "moon", icon: Moon },
    { name: "cloud", icon: Cloud },
    { name: "heart", icon: Heart },
    { name: "star", icon: Star },
    { name: "bookmark", icon: Bookmark },
    { name: "bell", icon: Bell },
    { name: "bell-off", icon: BellOff },
    { name: "eye", icon: Eye },
    { name: "eye-off", icon: EyeOff },
    { name: "lock", icon: Lock },
    { name: "lock-open", icon: LockOpen },
    { name: "mic", icon: Mic },
    { name: "mic-off", icon: MicOff },
    { name: "volume-2", icon: Volume2 },
    { name: "volume-x", icon: VolumeX },
    { name: "search", icon: Search },
    { name: "settings", icon: Settings },
    { name: "house", icon: House },
    { name: "user", icon: User },
    { name: "image", icon: ImageIcon },
    { name: "video", icon: Video },
    { name: "sparkles", icon: Sparkles },
    { name: "wand", icon: Wand2 },
    { name: "zap", icon: Zap },
    { name: "pencil", icon: Pencil },
    { name: "copy", icon: Copy },
    { name: "trash", icon: Trash2 },
    { name: "download", icon: Download },
    { name: "upload", icon: Upload },
];

/** 本项目常用的成对切换 */
const PAIRS: readonly [string, string, string][] = [
    ["menu", "x", "菜单 / 关闭"],
    ["play", "pause", "播放 / 暂停"],
    ["sun", "moon", "白天 / 黑夜"],
    ["eye", "eye-off", "显示 / 隐藏"],
    ["lock", "lock-open", "锁定 / 解锁"],
    ["mic", "mic-off", "麦克风"],
    ["volume-2", "volume-x", "声音"],
    ["copy", "check", "复制 → 已复制"],
    ["upload", "check", "上传 → 完成"],
    ["sparkles", "wand", "AI 生成"],
];

const SPEEDS = [0.5, 1, 2] as const;
const STROKES = [1.5, 2, 2.5] as const;
const AUTO_MS = 1600;

function iconByName(name: string) {
    return ICONS.find((item) => item.name === name)?.icon ?? Menu;
}

function Seg<T extends string | number>({ label, options, value, onChange, format }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void; format?: (value: T) => string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[var(--gm-text-3)]">{label}</span>
            <div role="radiogroup" aria-label={label} className="flex rounded-[10px] bg-[var(--gm-wash)] p-0.5 ring-1 ring-[var(--gm-border)]">
                {options.map((option) => (
                    <button
                        key={String(option)}
                        type="button"
                        role="radio"
                        aria-checked={option === value}
                        onClick={() => onChange(option)}
                        className={cn("h-7 rounded-[8px] px-2.5 text-xs transition-colors", option === value ? "bg-[var(--gm-text)] text-[var(--gm-bg)]" : "text-[var(--gm-text-2)] hover:text-[var(--gm-text)]")}
                    >
                        {format ? format(option) : String(option)}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** 形变实验台（对照 morphicons playground）：左边大图标，右边图标库；任意两个图标之间都能变 */
export function DesignMorphLab() {
    const [current, setCurrent] = useState("menu");
    const [previous, setPrevious] = useState("menu");
    const [spring, setSpring] = useState<MorphSpring>("snappy");
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
    const [stroke, setStroke] = useState<(typeof STROKES)[number]>(2);
    const [auto, setAuto] = useState(true);
    const [t, setT] = useState(1);
    const [pairState, setPairState] = useState<Record<string, boolean>>({});

    const pick = (name: string) => {
        setPrevious(current);
        setCurrent(name);
    };

    useEffect(() => {
        if (!auto) return;
        const timer = window.setInterval(() => {
            setCurrent((value) => {
                setPrevious(value);
                const index = ICONS.findIndex((item) => item.name === value);
                return ICONS[(index + 7) % ICONS.length].name;
            });
        }, AUTO_MS);
        return () => window.clearInterval(timer);
    }, [auto]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] px-4 py-3 ring-1 ring-[var(--gm-border)]">
                <Seg label="spring" options={Object.keys(MORPH_SPRINGS) as MorphSpring[]} value={spring} onChange={setSpring} />
                <Seg label="speed" options={SPEEDS} value={speed} onChange={setSpeed} format={(value) => `${value}×`} />
                <Seg label="stroke" options={STROKES} value={stroke} onChange={setStroke} />
                <button type="button" onClick={() => setAuto((value) => !value)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ring-1 ring-[var(--gm-border-strong)] hover:bg-[var(--gm-wash)]">
                    <GammaIconMorph icon={auto ? Pause : Play} size={14} />
                    {auto ? "暂停轮播" : "自动轮播"}
                </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-4 overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-8 ring-1 ring-[var(--gm-border)]">
                    <div aria-hidden className="gm-aurora absolute top-8 left-8 size-44 rounded-full bg-[var(--gm-blue)] opacity-30 blur-3xl" />
                    <div aria-hidden className="gm-aurora absolute right-8 bottom-8 size-40 rounded-full bg-[var(--gm-cyan)] opacity-20 blur-3xl [animation-delay:-6s]" />
                    <GammaIconMorph icon={iconByName(current)} size={128} strokeWidth={stroke} spring={spring} speed={speed} onProgress={setT} className="relative text-[var(--gm-text)]" />
                    <p className="relative font-mono text-xs text-[var(--gm-text-3)]">
                        {previous} → <span className="text-[var(--gm-accent)]">{current}</span>
                    </p>
                    <div className="relative flex w-56 items-center gap-2 font-mono text-[11px] text-[var(--gm-text-3)]">
                        <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)]" style={{ width: `${Math.min(100, Math.max(0, t * 100))}%` }} />
                        </span>
                        t={t.toFixed(2)}
                    </div>
                </div>

                <div className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
                    <p className="mb-3 text-xs text-[var(--gm-text-3)]">点任意图标，大图标会从当前形状变过去（跨任意两个 lucide 图标都可以）</p>
                    <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                        {ICONS.map((item) => (
                            <button
                                key={item.name}
                                type="button"
                                title={item.name}
                                aria-label={item.name}
                                aria-pressed={item.name === current}
                                onClick={() => {
                                    setAuto(false);
                                    pick(item.name);
                                }}
                                className={cn(
                                    "grid aspect-square place-items-center rounded-[10px] transition-colors",
                                    item.name === current ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
                                )}
                            >
                                <item.icon className="size-[18px]" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PAIRS.map(([a, b, label]) => {
                    const key = `${a}-${b}`;
                    const on = pairState[key] ?? false;
                    return (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setPairState((state) => ({ ...state, [key]: !on }))}
                            className="flex flex-col items-center gap-2 rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] py-4 ring-1 ring-[var(--gm-border)] transition-colors hover:ring-[var(--gm-border-strong)]"
                        >
                            <GammaIconMorph icon={iconByName(on ? b : a)} size={28} strokeWidth={stroke} spring={spring} speed={speed} className={on ? "text-[var(--gm-accent)]" : "text-[var(--gm-text)]"} />
                            <span className="text-[11px] text-[var(--gm-text-2)]">{label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
