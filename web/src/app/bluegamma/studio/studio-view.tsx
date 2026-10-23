"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Sparkles, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaTaskCard, type GammaTaskStatus } from "@/components/gamma-ui/gamma-cards";
import { gammaOutputCost } from "@/components/gamma-ui/gamma-composer";
import { GammaChip, GammaSlider } from "@/components/gamma-ui/gamma-controls";
import { GammaGlassSegmented } from "@/components/gamma-ui/gamma-glass";
import { GammaMajorTabs } from "@/components/gamma-ui/gamma-major-tabs";
import { GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GAMMA_RATIOS, gammaSubjectBySlug, type GammaRatio } from "@/components/gamma-ui/gamma-subjects";
import { GammaThemeProvider, GammaThemeToggle } from "@/components/gamma-ui/gamma-theme";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { STUDIO_HISTORY } from "@/app/bluegamma/studio/studio-data";

/*
 * 工作台 · 设计稿（本地模拟数据，不调接口）。
 * 遵循 /bluegamma/design「布局与栅格」里 workspace 骨架：左 280px 参数面板 + 中间画面 + 右 320px 历史。
 * 高频操作工具，间距走紧凑档（卡片内 12px、卡片间 16px），不套首页/素材库那种宽松留白。
 */
export function StudioView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const [major, setMajor] = useState("fashion");
    const [output, setOutput] = useState<string>(() => gammaSubjectBySlug("fashion").outputs[0]);
    const [style, setStyle] = useState<string>(() => gammaSubjectBySlug("fashion").styles[0]);
    const [ratio, setRatio] = useState<GammaRatio>("16:9");
    const [creativity, setCreativity] = useState(60);
    const [running, setRunning] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const subject = gammaSubjectBySlug(major);
    const cost = gammaOutputCost(subject, output, false);

    const handleMajorChange = (slug: string) => {
        setMajor(slug);
        const next = gammaSubjectBySlug(slug);
        setOutput(next.outputs[0]);
        setStyle(next.styles[0]);
    };

    const handleGenerate = () => {
        if (running) return;
        setRunning(true);
        window.setTimeout(() => {
            setRunning(false);
            toast("success", `已生成「${subject.name} · ${output}」（演示，消耗 ${cost} 积分）`);
        }, 1600);
    };

    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex flex-col overflow-hidden">
            <div className="flex h-full min-h-0 flex-col bg-[var(--gm-bg)]">
                <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--gm-border)] px-4">
                    <Link href="/bluegamma/home" aria-label="返回首页" className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                    </Link>
                    <span className="text-sm font-medium text-[var(--gm-text)]">工作台</span>
                    <span className="text-xs text-[var(--gm-text-3)]">{subject.name}</span>
                    <div className="ml-auto flex items-center gap-2">
                        <span className="font-mono text-xs text-[var(--gm-text-3)] tabular-nums">{demo.points} 积分</span>
                        <GammaThemeToggle />
                    </div>
                </header>

                <div className="flex min-h-0 flex-1">
                    {/* 左 280px：参数面板 */}
                    <aside className="flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--gm-border)] p-4">
                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-medium text-[var(--gm-text-3)]">专业方向</p>
                            <div className="-mx-1 overflow-x-auto px-1">
                                <GammaMajorTabs value={major} onChange={handleMajorChange} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-medium text-[var(--gm-text-3)]">产出形态</p>
                            <div className="flex flex-wrap gap-1.5">
                                {subject.outputs.map((item) => (
                                    <GammaChip key={item} active={item === output} onClick={() => setOutput(item)}>
                                        {item}
                                    </GammaChip>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-medium text-[var(--gm-text-3)]">风格</p>
                            <div className="flex flex-wrap gap-1.5">
                                {subject.styles.map((item) => (
                                    <GammaChip key={item} active={item === style} onClick={() => setStyle(item)}>
                                        {item}
                                    </GammaChip>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-medium text-[var(--gm-text-3)]">画面比例</p>
                            <GammaGlassSegmented label="画面比例" value={ratio} onChange={setRatio} options={GAMMA_RATIOS.map((item) => ({ value: item, label: item }))} />
                        </div>

                        <GammaSlider label="创意强度" value={creativity} min={0} max={100} step={5} unit="%" onChange={setCreativity} />

                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-medium text-[var(--gm-text-3)]">参考图</p>
                            <input ref={fileRef} type="file" accept="image/*" className="hidden" />
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="flex h-16 items-center justify-center gap-2 rounded-[var(--gm-radius)] text-[13px] text-[var(--gm-text-3)] ring-1 ring-dashed ring-[var(--gm-border-strong)] transition-colors hover:text-[var(--gm-text-2)] hover:ring-[var(--gm-accent)]"
                            >
                                <ImagePlus className="size-4" />
                                添加参考图
                            </button>
                        </div>

                        <GammaButton className="mt-auto" icon={<Zap className="size-4" />} loading={running} onClick={handleGenerate}>
                            {running ? "生成中" : `生成 · ${cost} 积分`}
                        </GammaButton>
                    </aside>

                    {/* 中间：画面 */}
                    <main className="gm-scroll flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6">
                        {running ? (
                            <div className="flex flex-col items-center gap-3 text-[var(--gm-text-2)]">
                                <Sparkles className="size-8 animate-pulse text-[var(--gm-accent)]" />
                                <p className="text-sm">正在生成「{output}」…</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-center text-[var(--gm-text-3)]">
                                <div className="grid size-16 place-items-center rounded-full bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                                    <Sparkles className="size-6" />
                                </div>
                                <p className="text-sm">设置好左侧参数后点击生成</p>
                                <p className="max-w-xs text-xs leading-relaxed">{subject.tagline}</p>
                            </div>
                        )}
                    </main>

                    {/* 右 320px：历史 */}
                    <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[var(--gm-border)] p-4">
                        <p className="text-xs font-medium text-[var(--gm-text-3)]">历史生成</p>
                        {STUDIO_HISTORY.map((item) => (
                            <GammaTaskCard
                                key={item.id}
                                status={item.status as GammaTaskStatus}
                                title={item.title}
                                meta={item.meta}
                                cover={item.cover}
                                progress={item.progress}
                                onOpen={() => toast("info", `预览「${item.title}」（演示）`)}
                                onDownload={() => toast("success", "已开始下载（演示）")}
                                onRetry={() => toast("info", `正在重新生成「${item.title}」（演示）`)}
                            />
                        ))}
                    </aside>
                </div>
            </div>

            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
        </GammaThemeProvider>
    );
}
