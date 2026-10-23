"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Sparkles, Trash2, X, Zap } from "lucide-react";

import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaTaskCard } from "@/components/gamma-ui/gamma-cards";
import { GammaGlassSegmented } from "@/components/gamma-ui/gamma-glass";
import { GammaQueueCard } from "@/components/gamma-ui/gamma-generation-states";
import { GammaEmptyState, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { cn } from "@/lib/utils";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { practiceModuleMeta, type PracticeModuleKind } from "@/app/bluegamma/practice/practice-modules";
import { usePracticeSession, type PracticeSessionRecord } from "@/app/bluegamma/practice/use-practice-session";

const DEMO_COVERS = ["/style-thumbs/realistic.jpg", "/style-thumbs/minimalist.jpg", "/style-thumbs/dark-fantasy.jpg", "/style-thumbs/anime.jpg"];

/**
 * 练习模块工作台：对照线上 practice-module-workbench.tsx 的结构——
 * 返回练习 / 新建练习 → 左创作输入 + 右练习结果 → 下方历史练习（可继续编辑 / 删除）。
 * 提交后进入 排队 → 生成中 → 完成/失败 的状态机，失败态标注「积分已自动退回」并可重试。
 */
export function ModuleWorkbenchView({ module }: { module: PracticeModuleKind }) {
    const meta = practiceModuleMeta(module);
    const demo = useGammaDemo();
    const { toast } = demo;
    const session = usePracticeSession(module, DEMO_COVERS);
    const [prompt, setPrompt] = useState("");
    const [variant, setVariant] = useState(meta?.variants?.[0]?.value ?? "");
    const [reference, setReference] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    if (!meta) return null;
    const Icon = meta.icon;
    const needsReference = meta.needsReference || variant === "multi";

    const handleChooseReference = (file?: File) => {
        if (!file) return;
        setReference(URL.createObjectURL(file));
    };

    const canSubmit = prompt.trim().length > 0 && (!needsReference || reference);

    const handleSubmit = () => {
        if (!canSubmit) return;
        session.submit(prompt.trim(), reference ?? undefined);
    };

    const handleNew = () => {
        session.reset();
        setPrompt("");
        setReference(null);
    };

    const handleContinueEdit = (record: PracticeSessionRecord) => {
        setPrompt(record.prompt);
        setReference(record.referenceUrl ?? null);
        session.open(record);
        toast("info", "已载入该练习的输入，可以修改后重新生成");
    };

    const handleDelete = (record: PracticeSessionRecord) => {
        session.remove(record);
        toast("success", "练习记录已删除");
    };

    return (
        <GammaThemeProvider>
            <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
                <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
                    <div className="flex items-center gap-3">
                        <Link href="/bluegamma/practice" className="inline-flex items-center gap-1.5 text-sm text-[var(--gm-text-3)] transition-colors hover:text-[var(--gm-text)]">
                            <ArrowLeft className="size-4" />
                            返回练习
                        </Link>
                        <GammaButton size="sm" variant="ghost" onClick={handleNew}>
                            新建练习
                        </GammaButton>
                    </div>

                    <header className="mt-4 flex items-center gap-3 border-b border-[var(--gm-border)] pb-4">
                        <div className={cn("grid size-11 shrink-0 place-items-center rounded-[var(--gm-radius-lg)]", meta.accentChip)}>
                            <Icon className={cn("size-5", meta.accentText)} />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-[var(--gm-text)]">{meta.title}练习</h1>
                            <p className="mt-0.5 text-sm text-[var(--gm-text-3)]">{meta.description}</p>
                        </div>
                    </header>

                    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
                        {/* 左：创作输入 */}
                        <section aria-label="创作输入" className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                            <div className="mb-4 flex items-center gap-2 border-b border-[var(--gm-border)] pb-3">
                                <Icon className={cn("size-4", meta.accentText)} />
                                <h2 className="text-sm font-semibold text-[var(--gm-text)]">创作输入</h2>
                                <span className="ml-auto text-xs text-[var(--gm-text-3)]">素材与生成参数</span>
                            </div>

                            {meta.variants ? (
                                <div className="mb-4">
                                    <GammaGlassSegmented label={`${meta.title}视图`} value={variant} onChange={setVariant} options={meta.variants} />
                                </div>
                            ) : null}

                            <label className="block text-sm font-medium text-[var(--gm-text)]">
                                {meta.title}描述{needsReference ? "" : "（可选）"}
                                <textarea
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    placeholder={meta.promptPlaceholder}
                                    rows={4}
                                    className="mt-2 w-full resize-none rounded-[var(--gm-radius)] bg-[var(--gm-wash)] p-3 text-sm text-[var(--gm-text)] outline-none ring-1 ring-[var(--gm-border)] transition-shadow focus:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus:ring-[var(--gm-accent)]"
                                />
                            </label>

                            <div className="mt-4">
                                <p className="mb-2 text-sm font-medium text-[var(--gm-text)]">参考图{needsReference ? "（必需）" : "（可选）"}</p>
                                {reference ? (
                                    <div className="relative inline-block">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- 用户上传的本地预览图 */}
                                        <img src={reference} alt="参考图" className="h-24 w-24 rounded-[var(--gm-radius)] object-cover ring-1 ring-[var(--gm-border)]" />
                                        <button
                                            type="button"
                                            aria-label="移除参考图"
                                            onClick={() => setReference(null)}
                                            className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-[var(--gm-surface-2)] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)] hover:text-[var(--gm-text)]"
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleChooseReference(event.target.files?.[0])} />
                                        <button
                                            type="button"
                                            onClick={() => fileRef.current?.click()}
                                            className="flex h-20 w-full items-center justify-center gap-2 rounded-[var(--gm-radius)] text-[13px] text-[var(--gm-text-3)] ring-1 ring-dashed ring-[var(--gm-border-strong)] transition-colors hover:text-[var(--gm-text-2)] hover:ring-[var(--gm-accent)]"
                                        >
                                            <ImagePlus className="size-4" />
                                            添加参考图
                                        </button>
                                    </>
                                )}
                            </div>

                            <GammaButton className="mt-5 w-full" size="lg" icon={<Zap className="size-4" />} disabled={!canSubmit} onClick={handleSubmit}>
                                生成{meta.title}
                            </GammaButton>
                        </section>

                        {/* 右：练习结果 */}
                        <section aria-label="练习结果" className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-[var(--gm-text)]">练习结果</h2>
                            </div>
                            {!session.current ? (
                                <GammaEmptyState icon={<Sparkles />} title="还没有提交练习" description="在左侧填写描述并点击生成，结果会显示在这里" />
                            ) : session.current.status === "queued" ? (
                                <GammaQueueCard ahead={0} etaSeconds={2} />
                            ) : session.current.status === "running" ? (
                                <div className="flex flex-col items-center gap-3 py-10 text-[var(--gm-text-2)]">
                                    <Sparkles className="size-8 animate-pulse text-[var(--gm-accent)]" />
                                    <p className="text-sm">正在生成「{session.current.title}」…</p>
                                    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                                        <div className="h-full rounded-full bg-[image:var(--gm-gradient)] transition-all" style={{ width: `${session.current.progress}%` }} />
                                    </div>
                                </div>
                            ) : session.current.status === "failed" ? (
                                <div className="flex flex-col items-center gap-3 py-10 text-center">
                                    <span className="grid size-12 place-items-center rounded-full bg-[rgba(255,77,109,0.14)] text-[var(--gm-danger)]">
                                        <X className="size-6" />
                                    </span>
                                    <p className="text-sm font-medium text-[var(--gm-text)]">生成失败</p>
                                    <p className="text-xs text-[var(--gm-text-3)]">{session.current.failedReason}</p>
                                    <GammaButton size="sm" variant="soft" onClick={() => session.current && session.retry(session.current)}>
                                        重新生成
                                    </GammaButton>
                                </div>
                            ) : (
                                <GammaTaskCard status="done" title={session.current.title} meta={session.current.createdAt} cover={session.current.cover} progress={100} />
                            )}
                        </section>
                    </div>

                    {/* 历史练习 */}
                    <section className="mt-7 border-t border-[var(--gm-border)] pt-5">
                        <h2 className="text-base font-semibold text-[var(--gm-text)]">历史练习</h2>
                        {session.sessions.length ? (
                            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {session.sessions.map((record) => (
                                    <HistoryCard key={record.id} record={record} onOpen={() => handleContinueEdit(record)} onRetry={() => session.retry(record)} onDelete={() => handleDelete(record)} />
                                ))}
                            </div>
                        ) : (
                            <GammaEmptyState icon={<Sparkles />} title="还没有练习记录" description="提交第一次练习后，结果会显示在这里" />
                        )}
                    </section>
                </div>
            </main>
            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
        </GammaThemeProvider>
    );
}

function HistoryCard({ record, onOpen, onRetry, onDelete }: { record: PracticeSessionRecord; onOpen: () => void; onRetry: () => void; onDelete: () => void }) {
    return (
        <div className="group relative overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-wash)] ring-1 ring-[var(--gm-border)]">
            <GammaTaskCard
                status={record.status === "queued" ? "running" : record.status}
                title={record.title}
                meta={record.createdAt}
                cover={record.cover}
                progress={record.progress}
                onOpen={onOpen}
                onRetry={record.status === "failed" ? onRetry : undefined}
            />
            <GammaIconButton label="删除练习记录" onClick={onDelete} className="absolute top-2 right-2 bg-[var(--gm-surface-2)] opacity-0 transition-opacity group-hover:opacity-100">
                <Trash2 className="size-3.5" />
            </GammaIconButton>
        </div>
    );
}
