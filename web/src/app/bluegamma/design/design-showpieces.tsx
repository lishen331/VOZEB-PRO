"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Bluetooth, Bookmark, BookmarkCheck, Clapperboard, Crown, FolderOpen, Heart, House, Image as ImageIcon, Mic, MicOff, Moon, Palette, Pause, Play, Sparkles, Star, Sun, Volume2, Wand2, Wifi } from "lucide-react";

import { useGammaBurst, type GammaBurstKind } from "@/components/gamma-ui/gamma-burst";
import { GammaAuroraButton, GammaBeamButton, GammaHoldButton, GammaMagneticButton, GammaPingDot } from "@/components/gamma-ui/gamma-hero-buttons";
import { GammaControlTile, GammaDock, GammaGlassNotice, GammaIosSwitch, GammaVolumeSlider } from "@/components/gamma-ui/gamma-material";
import { GammaMorphToggle, GammaStateButton, GammaStatusPill, type GammaSubmitState, type GammaTaskState } from "@/components/gamma-ui/gamma-states";
import { cn } from "@/lib/utils";

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col gap-4 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]", className)}>
            <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {hint ? <p className="mt-0.5 text-xs text-[var(--gm-text-3)]">{hint}</p> : null}
            </div>
            {children}
        </div>
    );
}

/** 醒目点击位：一页最多一两个 */
export function DesignHeroButtons({ onNotice }: { onNotice: (message: string) => void }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="主行动" hint="流光描边、极光渐变 + 粒子；用在「立即生成」「开通会员」">
                <div className="flex flex-wrap items-center gap-4">
                    <GammaBeamButton icon={<Sparkles className="size-4" />} onClick={() => onNotice("开始生成（演示）")}>
                        立即生成
                    </GammaBeamButton>
                    <GammaAuroraButton icon={<Crown className="size-4" />} burst="confetti" onClick={() => onNotice("已开通年卡（演示）")}>
                        开通创作者年卡
                    </GammaAuroraButton>
                </div>
            </Panel>
            <Panel title="磁吸 / 引导" hint="磁吸按钮靠近会被吸过去；呼吸光环提示「点这里」">
                <div className="flex flex-wrap items-center gap-8">
                    <GammaMagneticButton onClick={() => onNotice("进入画布")}>
                        开始创作 <Wand2 className="size-4" />
                    </GammaMagneticButton>
                    <GammaPingDot>
                        <button type="button" aria-label="新功能" onClick={() => onNotice("新功能：专业引导画布")} className="grid size-11 place-items-center rounded-full bg-[var(--gm-blue)] text-white">
                            <Sparkles className="size-5" />
                        </button>
                    </GammaPingDot>
                </div>
            </Panel>
            <Panel title="长按确认" hint="按住进度环走满才触发；中途松手会回退。防误触的付费 / 删除操作">
                <div className="flex flex-wrap items-center gap-3">
                    <GammaHoldButton onConfirm={() => onNotice("作品已删除（演示）")}>长按删除作品</GammaHoldButton>
                    <GammaHoldButton tone="accent" onConfirm={() => onNotice("已提交 4K 生成，扣 200 积分（演示）")}>
                        长按生成 4K · 200 积分
                    </GammaHoldButton>
                </div>
            </Panel>
            <BurstPlayground />
        </div>
    );
}

function BurstPlayground() {
    const fire = useGammaBurst();
    const kinds: { kind: GammaBurstKind; label: string }[] = [
        { kind: "sparkle", label: "星光" },
        { kind: "confetti", label: "彩纸" },
        { kind: "hearts", label: "爱心" },
        { kind: "shock", label: "冲击波" },
    ];
    return (
        <Panel title="点击特效" hint="在点击位置炸开；不经过 React 渲染，开销很小；系统减少动态效果时自动关闭">
            <div className="grid grid-cols-4 gap-2">
                {kinds.map((item) => (
                    <button
                        key={item.kind}
                        type="button"
                        onClick={(event) => fire(event, item.kind)}
                        className="relative h-20 rounded-[var(--gm-radius-lg)] bg-[var(--gm-wash)] text-xs text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)] transition-transform active:scale-95"
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </Panel>
    );
}

const WALLPAPER = "/style-thumbs/dreamy.jpg";

/** 苹果风材质：压在照片上才看得出玻璃感 */
export function DesignAppleMaterial({ onNotice }: { onNotice: (message: string) => void }) {
    const [tiles, setTiles] = useState({ wifi: true, bluetooth: false, focus: true, dark: true });
    const [volume, setVolume] = useState(62);
    const [bright, setBright] = useState(80);
    const [iosA, setIosA] = useState(true);
    const [iosB, setIosB] = useState(false);
    const [notice, setNotice] = useState(false);
    const flip = (key: keyof typeof tiles) => setTiles((state) => ({ ...state, [key]: !state[key] }));

    const dockItems = [
        { key: "home", label: "首页", icon: <House />, active: true },
        { key: "image", label: "图片创作", icon: <ImageIcon /> },
        { key: "film", label: "影视制作", icon: <Clapperboard /> },
        { key: "design", label: "视觉传达", icon: <Palette /> },
        { key: "assets", label: "素材库", icon: <FolderOpen /> },
        { key: "magic", label: "AI 助手", icon: <Wand2 /> },
    ].map((item) => ({ ...item, onClick: () => onNotice(`打开「${item.label}」`) }));

    return (
        <div className="relative isolate overflow-hidden rounded-[var(--gm-radius-xl)] ring-1 ring-[var(--gm-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- 演示背景 */}
            <img src={WALLPAPER} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-transparent to-black/30" />

            <div className="flex min-h-[84px] justify-center pt-5">
                <GammaGlassNotice
                    open={notice}
                    icon={<Sparkles />}
                    title="「侘寂客厅」生成完成"
                    body="4 张效果图已保存到素材库 · 向上滑动关闭"
                    onClose={() => setNotice(false)}
                    action={
                        <button type="button" onClick={() => setNotice(false)} className="rounded-full bg-[var(--gm-wash-strong)] px-3 py-1 text-xs font-medium">
                            查看
                        </button>
                    }
                />
            </div>

            <div className="grid gap-6 p-6 pt-4 text-[var(--gm-text)] lg:grid-cols-[auto_1fr]">
                {/* 控制中心 */}
                <div className="grid w-[372px] grid-cols-[1fr_1fr_68px_68px] gap-3">
                    <div className="col-span-2 grid grid-cols-2 gap-3">
                        <GammaControlTile icon={<Wifi />} label="无线网络" on={tiles.wifi} onToggle={() => flip("wifi")} />
                        <GammaControlTile icon={<Bluetooth />} label="蓝牙" on={tiles.bluetooth} onToggle={() => flip("bluetooth")} />
                        <GammaControlTile wide icon={<Moon />} label="专注模式" detail="创作中，勿扰" on={tiles.focus} onToggle={() => flip("focus")} />
                    </div>
                    <GammaVolumeSlider label="亮度" icon={<Sun />} value={bright} onChange={setBright} />
                    <GammaVolumeSlider label="音量" icon={<Volume2 />} value={volume} onChange={setVolume} />
                </div>

                <div className="flex flex-col justify-between gap-6">
                    <div className="gm-material gm-squircle flex flex-col divide-y divide-[var(--gm-border)] rounded-[22px]">
                        {[
                            { label: "生成完成时通知我", value: iosA, set: setIosA },
                            { label: "自动保存到素材库", value: iosB, set: setIosB },
                        ].map((row) => (
                            <label key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
                                {row.label}
                                <GammaIosSwitch checked={row.value} onChange={row.set} label={row.label} />
                            </label>
                        ))}
                        <button type="button" onClick={() => setNotice(true)} className="px-4 py-3 text-left text-[13px] text-[var(--gm-accent)] hover:bg-[var(--gm-wash)]">
                            模拟一条生成完成通知
                        </button>
                    </div>
                    {/* 上方留出 Dock 图标放大与提示气泡的空间，避免被圆角容器裁掉 */}
                    <div className="flex justify-center pt-10">
                        <GammaDock items={dockItems} />
                    </div>
                </div>
            </div>
        </div>
    );
}

const TASK_FLOW: GammaTaskState[] = ["draft", "queued", "running", "done", "failed", "refunded"];

/** 状态：任务徽标、提交按钮、两态形变图标 */
export function DesignStates() {
    const [taskIndex, setTaskIndex] = useState(2);
    const [submit, setSubmit] = useState<GammaSubmitState>("idle");
    const attempts = useRef(0);
    const timers = useRef<number[]>([]);
    const [toggles, setToggles] = useState({ heart: false, star: false, bookmark: false, bell: true, mic: true, play: false, sun: true });
    const flip = (key: keyof typeof toggles) => (on: boolean) => setToggles((state) => ({ ...state, [key]: on }));

    useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

    const runSubmit = () => {
        attempts.current += 1;
        setSubmit("loading");
        const willFail = attempts.current % 3 === 0;
        timers.current.push(
            window.setTimeout(() => setSubmit(willFail ? "error" : "success"), 1400),
            window.setTimeout(() => setSubmit("idle"), 3200),
        );
    };

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="任务状态" hint="点徽标切换；图标形变、宽度跟着文字平滑变化">
                <div className="flex flex-wrap gap-2">
                    {TASK_FLOW.map((state) => (
                        <button key={state} type="button" onClick={() => setTaskIndex(TASK_FLOW.indexOf(state))} aria-label={`切到${state}`}>
                            <GammaStatusPill state={state} />
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 rounded-[var(--gm-radius)] bg-[var(--gm-wash)] p-3">
                    <span className="text-xs text-[var(--gm-text-2)]">当前任务</span>
                    <GammaStatusPill state={TASK_FLOW[taskIndex]} detail={TASK_FLOW[taskIndex] === "running" ? "62%" : TASK_FLOW[taskIndex] === "refunded" ? "+24" : undefined} />
                    <button type="button" onClick={() => setTaskIndex((value) => (value + 1) % TASK_FLOW.length)} className="ml-auto text-xs text-[var(--gm-accent)] hover:underline">
                        下一个状态
                    </button>
                </div>
            </Panel>

            <Panel title="提交按钮" hint="生成中 → 成功 / 失败，图标逐个形变；每第 3 次模拟失败">
                <div className="flex flex-1 items-center justify-center">
                    <GammaStateButton state={submit} onClick={runSubmit} labels={{ idle: "生成 4 张图", loading: "生成中…", success: "已完成", error: "失败，已退回积分" }} />
                </div>
            </Panel>

            <Panel title="两态图标" hint="收藏、关注、静音、播放……切换时图标形变；收藏 / 点赞带粒子">
                <div className="flex flex-wrap items-center gap-1">
                    <GammaMorphToggle label="喜欢" iconOn={Heart} iconOff={Heart} on={toggles.heart} onChange={flip("heart")} burst tone="danger" />
                    <GammaMorphToggle label="收藏" iconOn={Star} iconOff={Star} on={toggles.star} onChange={flip("star")} burst />
                    <GammaMorphToggle label="稍后看" iconOn={BookmarkCheck} iconOff={Bookmark} on={toggles.bookmark} onChange={flip("bookmark")} />
                    <GammaMorphToggle label="通知" iconOn={Bell} iconOff={BellOff} on={toggles.bell} onChange={flip("bell")} />
                    <GammaMorphToggle label="麦克风" iconOn={Mic} iconOff={MicOff} on={toggles.mic} onChange={flip("mic")} />
                    <GammaMorphToggle label="播放" iconOn={Pause} iconOff={Play} on={toggles.play} onChange={flip("play")} />
                    <GammaMorphToggle label="主题" iconOn={Sun} iconOff={Moon} on={toggles.sun} onChange={flip("sun")} />
                </div>
            </Panel>
        </div>
    );
}
