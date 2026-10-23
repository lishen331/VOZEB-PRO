"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Sparkles } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaStatCard, GammaTaskCard } from "@/components/gamma-ui/gamma-cards";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaStagger, GammaStaggerItem } from "@/components/gamma-ui/gamma-motion";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { SUBJECT_ACCENT } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";
import { PRACTICE_MODULES, PRACTICE_PROJECT_CARDS, PRACTICE_SESSIONS, PRACTICE_STATS, PRACTICE_WIDE_MODULES, type PracticeProjectCardSpec } from "./practice-data";

/**
 * 无限练习 · 设计稿（本地模拟数据，不调接口）。
 * 对照线上 app/(user)/practice/components/practice-home.tsx 重做：
 *   - antd Button/Empty/Spin → GammaButton/GammaEmptyState
 *   - 卡片的硬编码渐变（from-violet-500 to-purple-600 等）→ 统一走 SUBJECT_ACCENT 取色表
 *   - 「最近练习记录」从纯列表换成 GammaTaskCard（生成中环形进度、失败态、完成缩略图）
 * 定稿后再把这套结构套回真实页面，数据源换成 practiceApi。
 */
export function PracticeView() {
    const [creatingKind, setCreatingKind] = useState<PracticeProjectCardSpec["kind"] | null>(null);

    const simulateCreate = (kind: PracticeProjectCardSpec["kind"]) => {
        if (creatingKind) return;
        setCreatingKind(kind);
        window.setTimeout(() => setCreatingKind(null), 900);
    };

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
                <div className="mb-4 flex items-center gap-2">
                    <Link href="/bluegamma/home" aria-label="返回首页" className="gm-glass grid size-9 shrink-0 place-items-center rounded-full text-[var(--gm-text-2)] hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                    </Link>
                    <span className="text-sm text-[var(--gm-text-3)]">返回首页</span>
                </div>
                <PracticeHero />

                <section className="mt-6 grid gap-4 sm:grid-cols-3">
                    {PRACTICE_STATS.map((stat) => (
                        <GammaStatCard key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} icon={<Sparkles className="size-4" />} />
                    ))}
                </section>

                <section className="mt-10" aria-labelledby="practice-projects-heading">
                    <h2 id="practice-projects-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                        练习项目
                    </h2>
                    <GammaStagger className="mt-4 grid gap-5 md:grid-cols-2">
                        {PRACTICE_PROJECT_CARDS.map((card) => (
                            <GammaStaggerItem key={card.kind}>
                                <ProjectCard card={card} creating={creatingKind === card.kind} onCreate={() => simulateCreate(card.kind)} />
                            </GammaStaggerItem>
                        ))}
                    </GammaStagger>
                </section>

                <section className="mt-10" aria-labelledby="practice-modules-heading">
                    <h2 id="practice-modules-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                        练习模块
                    </h2>
                    {/* bento：宽卡在数据顺序里已经和小卡交错排布（见 practice-data.ts 注释），这里只负责按模块判断是否宽卡 */}
                    <GammaStagger className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {PRACTICE_MODULES.map((card) => {
                            const wide = PRACTICE_WIDE_MODULES.includes(card.module);
                            return (
                                <GammaStaggerItem key={card.module} className={wide ? "sm:col-span-2" : undefined}>
                                    <ModuleCard card={card} wide={wide} />
                                </GammaStaggerItem>
                            );
                        })}
                    </GammaStagger>
                </section>

                <section className="mt-10" aria-labelledby="practice-history-heading">
                    <h2 id="practice-history-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                        最近练习记录
                    </h2>
                    {PRACTICE_SESSIONS.length ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {PRACTICE_SESSIONS.map((session) => (
                                <TaskCard key={session.id} session={session} />
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4">
                            <GammaEmptyState icon={<Sparkles className="size-6" />} title="还没有练习记录" description="从上面任意一个模块开始第一次练习" />
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}

/** Hero：移除原来的渐变大色块 + gm-on-dark 强制白字，统一走 token，浅色主题下也不会糊 */
function PracticeHero() {
    return (
        <header className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-8 ring-1 ring-[var(--gm-border)] sm:p-12">
            <div className="relative z-10">
                <GammaBadge tone="cyan">
                    <Sparkles className="size-3.5" />
                    免费创作空间
                </GammaBadge>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--gm-text)] sm:text-5xl">无限练习</h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--gm-text-2)] sm:text-lg">每个模块是独立的单块练习，互不串联。你可以把生成的素材保存到资产库，再在其他模块中引用。这里不是完整的漫剧创作流水线，只用于单块技能的专项训练。</p>
            </div>
            <div aria-hidden className="absolute -right-12 -top-12 size-64 rounded-full bg-[var(--gm-accent-soft)] blur-3xl" />
            <div aria-hidden className="absolute -bottom-12 -left-12 size-64 rounded-full bg-[rgba(139,92,246,0.12)] blur-3xl" />
        </header>
    );
}

function ProjectCard({ card, creating, onCreate }: { card: PracticeProjectCardSpec; creating: boolean; onCreate: () => void }) {
    const Icon = card.icon;
    const accent = SUBJECT_ACCENT[card.accent];
    return (
        <article className="group relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)]">
            <div aria-hidden className={cn("absolute -top-20 -right-20 size-64 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100", accent.chip)} />
            <div className="relative z-10">
                <div className="flex items-start justify-between gap-4">
                    <div className={cn("grid size-14 place-items-center rounded-[var(--gm-radius-lg)] transition-transform duration-300 group-hover:scale-105", accent.chip)}>
                        <Icon className={cn("size-7", accent.text)} />
                    </div>
                    <GammaButton size="sm" icon={<Plus className="size-3.5" />} loading={creating} onClick={onCreate}>
                        新建
                    </GammaButton>
                </div>
                <h3 className="mt-5 text-xl font-semibold text-[var(--gm-text)]">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--gm-text-2)]">{card.description}</p>
                <div className="mt-5 rounded-[var(--gm-radius-lg)] bg-[var(--gm-wash)] p-4">
                    <p className="text-xs font-medium text-[var(--gm-text-3)]">最近练习</p>
                    {card.recent.length ? (
                        <div className="mt-3 space-y-1">
                            {card.recent.slice(0, 3).map((item) => (
                                <button key={item.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-[var(--gm-radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--gm-wash-strong)]">
                                    <span className="truncate text-sm text-[var(--gm-text-2)]">{item.title}</span>
                                    <span className="shrink-0 text-xs text-[var(--gm-text-3)]">{item.updatedAt}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-[var(--gm-text-3)]">还没有练习项目</p>
                    )}
                </div>
            </div>
        </article>
    );
}

/** wide：用量最高的模块占两列，图标更大、带「已练习」徽标和（如有）tag，和小卡拉出明显的主次层级 */
function ModuleCard({ card, wide = false }: { card: (typeof PRACTICE_MODULES)[number]; wide?: boolean }) {
    const Icon = card.icon;
    const accent = SUBJECT_ACCENT[card.accent];
    const href = card.module === "script" ? "/bluegamma/practice/scripts" : `/bluegamma/practice/${card.module}`;
    return (
        <Link
            href={href}
            className={cn(
                "group relative w-full overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] text-left ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]",
                wide ? "flex items-center gap-5 p-6" : "p-5",
            )}
        >
            <div aria-hidden className={cn("absolute -bottom-12 -right-12 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100", wide ? "size-56" : "size-48", accent.chip)} />
            <div className={cn("relative z-10 shrink-0 place-items-center rounded-[var(--gm-radius-lg)] transition-transform duration-300", wide ? "grid size-16 group-hover:scale-105" : "inline-grid size-12 group-hover:scale-110", accent.chip)}>
                <Icon className={cn(wide ? "size-8" : "size-6", accent.text)} />
            </div>
            <div className={cn("relative z-10 min-w-0 flex-1", wide ? "" : "mt-4")}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <h3 className={cn("font-semibold text-[var(--gm-text)]", wide ? "text-lg" : "text-base")}>{card.title}</h3>
                        {card.tag ? <GammaBadge tone="neutral">{card.tag}</GammaBadge> : null}
                    </div>
                    <span aria-label={`已练习 ${card.doneCount} 次`} className="shrink-0 rounded-full bg-[var(--gm-wash)] px-2 py-0.5 text-xs tabular-nums text-[var(--gm-text-3)]">
                        {card.doneCount} 次
                    </span>
                </div>
                <p className={cn("text-[var(--gm-text-2)]", wide ? "mt-1.5 text-sm leading-6" : "mt-1 text-sm leading-6")}>{card.description}</p>
            </div>
        </Link>
    );
}

function TaskCard({ session }: { session: (typeof PRACTICE_SESSIONS)[number] }) {
    return <GammaTaskCard status={session.status} title={session.title} meta={`${session.moduleLabel} · ${session.updatedAt}`} cover={session.cover} progress={session.progress} etaSeconds={session.etaSeconds} />;
}
