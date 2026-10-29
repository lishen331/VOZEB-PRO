"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, Copy, Download, Heart, Mail, Search, Share2, Star, Trash2, Zap } from "lucide-react";

import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge, GammaCheckbox, GammaChip, GammaInput, GammaSlider, GammaSwitch, GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { GAMMA_MORPH_SHAPES, GammaMorphIcon, type GammaMorphName } from "@/components/gamma-ui/gamma-morph-icon";
import { GammaTooltip } from "@/components/gamma-ui/gamma-overlays";
import { cn } from "@/lib/utils";

/** 组件展示格（参考 Watermelon UI 的编号格布局） */
export function Specimen({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]", className)}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--gm-border)] px-4 py-3">
                <span className="text-[13px] font-medium">{title}</span>
                {note ? <span className="truncate text-[11px] text-[var(--gm-text-3)]">{note}</span> : null}
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-center gap-3 bg-[radial-gradient(rgba(140,175,255,0.07)_1px,transparent_1px)] [background-size:16px_16px] p-6">{children}</div>
        </div>
    );
}

const LOADING_MS = 1600;
const COPIED_MS = 1400;

export function DesignButtons({ onNotice }: { onNotice: (message: string) => void }) {
    const [loading, setLoading] = useState(false);
    const [favorite, setFavorite] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!loading) return;
        const timer = window.setTimeout(() => {
            setLoading(false);
            onNotice("保存成功");
        }, LOADING_MS);
        return () => window.clearTimeout(timer);
    }, [loading, onNotice]);

    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
        return () => window.clearTimeout(timer);
    }, [copied]);

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Specimen title="01 · 主行动" note="扫光 + 按压回弹 + 水波纹">
                <GammaButton shine icon={<Zap className="size-4" />} onClick={() => onNotice("点击了主按钮")}>
                    开始生成
                </GammaButton>
                <GammaButton variant="cyan" onClick={() => onNotice("点击了青色按钮")}>
                    立即体验
                </GammaButton>
            </Specimen>
            <Specimen title="02 · 变体" note="soft / outline / ghost / glass">
                <GammaButton variant="soft">保存草稿</GammaButton>
                <GammaButton variant="outline">做同款</GammaButton>
                <GammaButton variant="ghost">取消</GammaButton>
                <GammaButton variant="glass">更多</GammaButton>
            </Specimen>
            <Specimen title="03 · 尺寸" note="xs · sm · md · lg">
                <GammaButton size="xs">超小</GammaButton>
                <GammaButton size="sm">小号</GammaButton>
                <GammaButton size="md">默认</GammaButton>
                <GammaButton size="lg">大号</GammaButton>
            </Specimen>
            <Specimen title="04 · 箭头前移" note="hover 时尾部图标滑动">
                <GammaButton variant="outline" trailingIcon={<ArrowRight className="size-4" />}>
                    探索更多
                </GammaButton>
                <GammaButton trailingIcon={<ArrowRight className="size-4" />}>下一步</GammaButton>
            </Specimen>
            <Specimen title="05 · 加载态" note="点击后转圈 1.6 秒">
                <GammaButton loading={loading} onClick={() => setLoading(true)}>
                    {loading ? "保存中" : "保存"}
                </GammaButton>
                <GammaButton disabled>不可用</GammaButton>
            </Specimen>
            <Specimen title="06 · 点击确认" note="图标切换为对勾">
                <GammaButton variant="soft" confirmOnClick icon={<Copy className="size-4" />} onClick={() => setCopied(true)}>
                    {copied ? "已复制" : "复制链接"}
                </GammaButton>
                <GammaButton variant="outline" confirmOnClick icon={<Download className="size-4" />}>
                    下载
                </GammaButton>
            </Specimen>
            <Specimen title="07 · 收藏" note="切换填充">
                <GammaButton variant={favorite ? "soft" : "outline"} icon={<Heart className={cn("size-4 transition-transform", favorite && "scale-110 fill-current text-[#ff6b8a]")} />} onClick={() => setFavorite((value) => !value)}>
                    {favorite ? "已收藏" : "收藏"}
                </GammaButton>
            </Specimen>
            <Specimen title="08 · 危险操作">
                <GammaButton variant="danger" icon={<Trash2 className="size-4" />} onClick={() => onNotice("演示：删除不会真的执行")}>
                    删除作品
                </GammaButton>
            </Specimen>
            <Specimen title="09 · 图标按钮" note="hover 显示提示">
                {[
                    { label: "分享", icon: <Share2 /> },
                    { label: "收藏", icon: <Star /> },
                    { label: "下载", icon: <Download /> },
                    { label: "删除", icon: <Trash2 /> },
                ].map((item) => (
                    <GammaTooltip key={item.label} content={item.label}>
                        <GammaIconButton label={item.label} onClick={() => onNotice(item.label)}>
                            {item.icon}
                        </GammaIconButton>
                    </GammaTooltip>
                ))}
            </Specimen>
        </div>
    );
}

const MORPH_SEQUENCE: GammaMorphName[] = ["menu", "close", "plus", "check", "arrowRight", "arrowDown", "chevronDown", "play", "pause", "sparkle", "minus"];
const MORPH_INTERVAL_MS = 1300;

/** 形变图标（参考 morphicons）：自动轮播 + 手动点选 + 三个真实交互场景 */
export function DesignMorphIcons() {
    const [index, setIndex] = useState(0);
    const [auto, setAuto] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [added, setAdded] = useState(false);
    const current = MORPH_SEQUENCE[index];
    const previous = MORPH_SEQUENCE[(index - 1 + MORPH_SEQUENCE.length) % MORPH_SEQUENCE.length];

    useEffect(() => {
        if (!auto) return;
        const timer = window.setInterval(() => setIndex((value) => (value + 1) % MORPH_SEQUENCE.length), MORPH_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [auto]);

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div className="relative flex flex-col items-center justify-center gap-5 overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-8 ring-1 ring-[var(--gm-border)]">
                <div aria-hidden className="gm-aurora absolute top-6 left-10 size-40 rounded-full bg-[var(--gm-blue)] opacity-30 blur-3xl" />
                <div aria-hidden className="gm-aurora absolute right-10 bottom-10 size-36 rounded-full bg-[var(--gm-cyan)] opacity-20 blur-3xl [animation-delay:-6s]" />
                <GammaMorphIcon name={current} size={120} strokeWidth={1.6} className="relative text-[var(--gm-text)]" />
                <p className="relative font-mono text-xs text-[var(--gm-text-3)]">
                    {previous} → <span className="text-[var(--gm-accent)]">{current}</span> · spring 380/26
                </p>
                <div className="relative flex flex-wrap justify-center gap-1.5">
                    {MORPH_SEQUENCE.map((name, itemIndex) => (
                        <GammaIconButton
                            key={name}
                            label={name}
                            active={itemIndex === index}
                            onClick={() => {
                                setAuto(false);
                                setIndex(itemIndex);
                            }}
                        >
                            <GammaMorphIcon name={name} />
                        </GammaIconButton>
                    ))}
                </div>
                <GammaButton size="sm" variant="ghost" icon={<GammaMorphIcon name={auto ? "pause" : "play"} size={16} />} onClick={() => setAuto((value) => !value)}>
                    {auto ? "暂停轮播" : "自动轮播"}
                </GammaButton>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <Specimen title="菜单 ⇄ 关闭" note="导航抽屉">
                    <GammaIconButton label={menuOpen ? "关闭菜单" : "打开菜单"} active={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="size-12 [&_svg]:size-6">
                        <GammaMorphIcon name={menuOpen ? "close" : "menu"} />
                    </GammaIconButton>
                </Specimen>
                <Specimen title="播放 ⇄ 暂停" note="视频预览">
                    <GammaIconButton label={playing ? "暂停" : "播放"} active={playing} onClick={() => setPlaying((value) => !value)} className="size-12 [&_svg]:size-6">
                        <GammaMorphIcon name={playing ? "pause" : "play"} />
                    </GammaIconButton>
                </Specimen>
                <Specimen title="添加 ⇄ 完成" note="加入素材库">
                    <GammaButton variant={added ? "soft" : "primary"} icon={<GammaMorphIcon name={added ? "check" : "plus"} size={18} />} onClick={() => setAdded((value) => !value)}>
                        {added ? "已加入" : "加入素材"}
                    </GammaButton>
                </Specimen>
                <p className="text-xs leading-relaxed text-[var(--gm-text-3)] sm:col-span-3 lg:col-span-1 xl:col-span-3">共 {Object.keys(GAMMA_MORPH_SHAPES).length} 个形变图标，统一 24×24 网格、3 条线段，任意两个之间都能平滑过渡。</p>
            </div>
        </div>
    );
}

type Ratio = "16:9" | "9:16" | "1:1";
type Quality = "standard" | "hd";

const RATIO_OPTIONS = (["16:9", "9:16", "1:1"] as const).map((value) => ({ value, label: value }));
const QUALITY_OPTIONS = [
    { value: "standard" as const, label: "标准" },
    { value: "hd" as const, label: "高清 1080P" },
];
const KIND_OPTIONS = [
    { value: "all", label: "全部" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "course", label: "作品集" },
];
const STYLE_CHIPS = ["写实", "水墨", "动漫", "3D", "手绘"];
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function DesignControls() {
    const [ratio, setRatio] = useState<Ratio>("16:9");
    const [quality, setQuality] = useState<Quality>("hd");
    const [kind, setKind] = useState("all");
    const [duration, setDuration] = useState(8);
    const [creativity, setCreativity] = useState(60);
    const [watermark, setWatermark] = useState(true);
    const [publicWork, setPublicWork] = useState(false);
    const [agree, setAgree] = useState(true);
    const [notify, setNotify] = useState(false);
    const [chips, setChips] = useState<ReadonlySet<string>>(() => new Set(["写实"]));
    const [email, setEmail] = useState("");
    const emailError = email && !EMAIL_PATTERN.test(email) ? "邮箱格式不正确" : undefined;

    const toggleChip = (value: string) =>
        setChips((current) => {
            const next = new Set(current);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Specimen title="分段切换" note="底块弹簧滑动">
                <div className="flex flex-col items-center gap-3">
                    <GammaTabs label="画面比例" options={RATIO_OPTIONS} value={ratio} onChange={setRatio} />
                    <GammaTabs label="画质" size="sm" options={QUALITY_OPTIONS} value={quality} onChange={setQuality} />
                </div>
            </Specimen>
            <Specimen title="下划线标签" note="青色光条跟随">
                <GammaTabs label="作品分类" variant="underline" options={KIND_OPTIONS} value={kind} onChange={setKind} />
            </Specimen>
            <Specimen title="多选标签">
                {STYLE_CHIPS.map((value) => (
                    <GammaChip key={value} active={chips.has(value)} onClick={() => toggleChip(value)}>
                        {value}
                    </GammaChip>
                ))}
            </Specimen>
            <Specimen title="滑块" note="拖动实时更新">
                <div className="flex w-full max-w-xs flex-col gap-5">
                    <GammaSlider label="视频时长" value={duration} min={3} max={15} unit="s" onChange={setDuration} />
                    <GammaSlider label="创意程度" value={creativity} min={0} max={100} unit="%" onChange={setCreativity} />
                </div>
            </Specimen>
            <Specimen title="开关与勾选">
                <div className="flex w-full max-w-xs flex-col gap-4">
                    <div className="flex items-center justify-between text-[13px] text-[var(--gm-text-2)]">
                        添加水印
                        <GammaSwitch label="添加水印" checked={watermark} onChange={setWatermark} />
                    </div>
                    <div className="flex items-center justify-between text-[13px] text-[var(--gm-text-2)]">
                        公开到广场
                        <GammaSwitch label="公开到广场" checked={publicWork} onChange={setPublicWork} />
                    </div>
                    <GammaCheckbox label="同意《用户协议》" checked={agree} onChange={setAgree} />
                    <GammaCheckbox label="生成完成后通知我" checked={notify} onChange={setNotify} />
                </div>
            </Specimen>
            <Specimen title="输入框" note="聚焦青色光环 · 实时校验">
                <div className="flex w-full max-w-xs flex-col gap-3">
                    <GammaInput icon={<Search />} placeholder="搜索作品" aria-label="搜索作品" />
                    <GammaInput icon={<Mail />} label="通知邮箱" placeholder="name@school.edu.cn" value={email} onChange={(event) => setEmail(event.target.value)} error={emailError} hint="用于接收生成完成通知" />
                </div>
            </Specimen>
            <Specimen title="徽标" className="md:col-span-2 xl:col-span-3">
                <GammaBadge tone="blue">PRO</GammaBadge>
                <GammaBadge tone="cyan">NEW</GammaBadge>
                <GammaBadge tone="success">已完成</GammaBadge>
                <GammaBadge tone="warning">排队中</GammaBadge>
                <GammaBadge tone="danger">失败</GammaBadge>
                <GammaBadge tone="neutral">草稿</GammaBadge>
            </Specimen>
        </div>
    );
}
