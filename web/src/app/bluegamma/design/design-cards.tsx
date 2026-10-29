"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Pencil, Share2, Sparkles, Trash2, TrendingUp, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaStatCard, GammaSubjectCard, GammaTaskCard, GammaWorkCard } from "@/components/gamma-ui/gamma-cards";
import { GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState, GammaMenu, type GammaToastTone } from "@/components/gamma-ui/gamma-overlays";
import { GAMMA_SUBJECTS } from "@/components/gamma-ui/gamma-subjects";
import { GAMMA_GALLERY } from "@/app/bluegamma/gamma-nav";
import { Specimen } from "@/app/bluegamma/design/design-components";
import { cn } from "@/lib/utils";

type Preview = { src: string; title: string };
type Toast = (tone: GammaToastTone, message: string) => void;

const LOOP_TICK_MS = 280;
const LOOP_STEP = 4;
/** 演示任务每 1% 约 0.07 秒 */
const LOOP_SECONDS_PER_PERCENT = 0.07;

/** 生成中任务的循环进度，仅用于展示，不消耗积分 */
function useLoopingProgress() {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setProgress((value) => (value >= 100 ? 0 : value + LOOP_STEP)), LOOP_TICK_MS);
        return () => window.clearInterval(timer);
    }, []);
    return progress;
}

export function DesignCards({ points, onPreview, onToast }: { points: number; onPreview: (preview: Preview) => void; onToast: Toast }) {
    const [liked, setLiked] = useState(false);
    const progress = useLoopingProgress();
    const work = GAMMA_GALLERY[0];
    const video = GAMMA_GALLERY[2];
    const done = GAMMA_GALLERY[1];

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-3">
                {GAMMA_SUBJECTS.slice(0, 3).map((subject) => (
                    <GammaSubjectCard key={subject.slug} subject={subject} onClick={() => onToast("info", `进入${subject.name}生成`)} />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {GAMMA_SUBJECTS.slice(3, 9).map((subject) => (
                    <GammaSubjectCard key={subject.slug} subject={subject} compact onClick={() => onToast("info", `进入${subject.name}生成`)} />
                ))}
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
                <GammaWorkCard
                    cover={work.cover}
                    title={work.title}
                    author={work.author}
                    subject={work.subject}
                    likes={work.likes}
                    liked={liked}
                    tall
                    onLike={() => setLiked((value) => !value)}
                    onOpen={() => onPreview({ src: work.cover, title: work.title })}
                    onRemix={() => onToast("info", "已填入同款提示词")}
                />
                <GammaWorkCard
                    cover={video.cover}
                    title={video.title}
                    author={video.author}
                    subject={video.subject}
                    likes={video.likes}
                    kind="video"
                    onOpen={() => onPreview({ src: video.cover, title: video.title })}
                    onRemix={() => onToast("info", "已填入同款提示词")}
                />
                <div className="flex flex-col gap-4">
                    <GammaTaskCard status="running" title="新中式系列 · 第 3 套" meta="服装设计 · 效果图 · 新中式" progress={progress} etaSeconds={Math.max(1, Math.ceil((100 - progress) * LOOP_SECONDS_PER_PERCENT))} />
                    <GammaTaskCard status="failed" title="雾港 · 镜头 14 推近" meta="影视制作 · 概念镜头 · 电影感" onRetry={() => onToast("info", "已重新提交（演示）")} />
                </div>
                <div className="flex flex-col gap-4">
                    <GammaTaskCard status="done" title={done.title} meta="影视制作 · 短片 · 黑色电影" cover={done.cover} onOpen={() => onPreview({ src: done.cover, title: done.title })} onDownload={() => onToast("success", "已开始下载（演示）")} />
                    <div className="grid grid-cols-2 gap-3">
                        <GammaStatCard label="剩余积分" value={points.toLocaleString()} icon={<Zap />} />
                        <GammaStatCard label="本周作品" value="128" delta="+18%" icon={<TrendingUp />} />
                    </div>
                </div>
            </div>
        </div>
    );
}

type ToastDemo = "success" | "error" | "info";

const TOAST_OPTIONS = [
    { value: "success" as const, label: "成功" },
    { value: "error" as const, label: "失败" },
    { value: "info" as const, label: "信息" },
];

const TOAST_SAMPLES: Record<ToastDemo, string> = {
    success: "作品已保存到素材库",
    error: "网络异常，请稍后重试",
    info: "生成任务已进入队列",
};

export function DesignOverlays({ onToast, onOpenModal, onPreview }: { onToast: Toast; onOpenModal: () => void; onPreview: (preview: Preview) => void }) {
    const [tone, setTone] = useState<ToastDemo>("success");
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Specimen title="轻提示" note="弹簧进出 · 自动消失">
                <div className="flex flex-col items-center gap-3">
                    <GammaTabs label="提示类型" size="sm" options={TOAST_OPTIONS} value={tone} onChange={setTone} />
                    <GammaButton size="sm" variant="soft" onClick={() => onToast(tone, TOAST_SAMPLES[tone])}>
                        弹出提示
                    </GammaButton>
                </div>
            </Specimen>
            <Specimen title="对话框" note="Esc / 遮罩关闭">
                <GammaButton size="sm" variant="outline" onClick={onOpenModal}>
                    打开对话框
                </GammaButton>
            </Specimen>
            <Specimen title="下拉菜单" note="点外部关闭">
                <GammaMenu
                    label="作品操作"
                    align="start"
                    trigger={(open) => (
                        <span className={cn("inline-flex h-8 items-center rounded-[var(--gm-radius-sm)] px-3 text-[13px] ring-1 transition-colors", open ? "text-[var(--gm-accent)] ring-[var(--gm-accent)]" : "ring-[var(--gm-border-strong)]")}>
                            作品操作 ▾
                        </span>
                    )}
                    items={[
                        { key: "edit", label: "重新编辑", icon: <Pencil />, onSelect: () => onToast("info", "重新编辑") },
                        { key: "share", label: "分享到工作室", icon: <Share2 />, onSelect: () => onToast("success", "已分享到工作室") },
                        { key: "save", label: "存入素材库", icon: <FolderOpen />, onSelect: () => onToast("success", "已存入素材库") },
                        { key: "delete", label: "删除", icon: <Trash2 />, danger: true, onSelect: () => onToast("error", "演示：删除不会真的执行") },
                    ]}
                />
            </Specimen>
            <Specimen title="大图预览">
                <GammaButton size="sm" variant="outline" onClick={() => onPreview({ src: "/style-thumbs/ink-wash.jpg", title: "望庐山瀑布 · 水墨意境" })}>
                    打开预览
                </GammaButton>
            </Specimen>
            <div className="md:col-span-2 xl:col-span-4">
                <GammaEmptyState
                    icon={<Sparkles />}
                    title="空状态"
                    description="没有数据时给出明确的下一步，而不是一片空白"
                    action={
                        <GammaButton size="sm" variant="soft" onClick={() => onToast("info", "去生成")}>
                            去生成第一个作品
                        </GammaButton>
                    }
                />
            </div>
        </div>
    );
}

const MOTION_SPECS = [
    { name: "按压回弹", value: "spring 500 / 30 · scale 0.96", use: "所有按钮、卡片" },
    { name: "选中滑块", value: "spring 480 / 36 · layoutId", use: "分段、标签、导航" },
    { name: "形变图标", value: "spring 380 / 26 · 3 段线插值", use: "菜单、播放、添加" },
    { name: "浮层进出", value: "spring 380 / 30 · scale 0.94→1", use: "对话框、提示" },
    { name: "内容入场", value: "0.35s · cubic-bezier(.22,1,.36,1)", use: "卡片、列表" },
    { name: "扫光 / 流光", value: "2.8s / 1.6s 循环", use: "主按钮、生成中骨架" },
];

export function DesignMotionSpecs() {
    return (
        <div className="overflow-hidden rounded-[var(--gm-radius-lg)] ring-1 ring-[var(--gm-border)]">
            <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--gm-surface-2)] text-xs text-[var(--gm-text-3)]">
                    <tr>
                        <th scope="col" className="px-5 py-3 font-medium">
                            名称
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                            参数
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                            用在
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gm-border)] bg-[var(--gm-surface)]">
                    {MOTION_SPECS.map((row) => (
                        <tr key={row.name} className="transition-colors hover:bg-[var(--gm-wash)]">
                            <td className="px-5 py-3 font-medium">{row.name}</td>
                            <td className="px-5 py-3 font-mono text-xs text-[var(--gm-accent)]">{row.value}</td>
                            <td className="px-5 py-3 text-[var(--gm-text-2)]">{row.use}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
