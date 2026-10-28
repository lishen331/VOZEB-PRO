"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Plus, Sparkles } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaStatCard, GammaTaskCard } from "@/components/gamma-ui/gamma-cards";
import { GammaBadge, GammaSwitch } from "@/components/gamma-ui/gamma-controls";
import { GammaStagger, GammaStaggerItem } from "@/components/gamma-ui/gamma-motion";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { SUBJECT_ACCENT } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";
import { PRACTICE_MODULES, PRACTICE_PROJECT_CARDS, PRACTICE_SCRIPT_ENTRY, PRACTICE_SESSIONS, PRACTICE_STATS, type PracticeProjectCardSpec, type PracticeProjectKind } from "./practice-data";

/**
 * 无限练习 · 设计稿（本地模拟数据，不调接口）。
 * 对照线上 app/(user)/practice/components/practice-home.tsx 重做：
 *   - 练习项目受后台开关控制（visibleProjects）：0 个整块隐藏、1 个占满整行、2 个两列
 *   - 剧本练习是独立整条入口，不混进模块网格
 *   - 练习模块固定 6 张同规格卡（3 列 × 2 行），不再有跨列宽卡造成的大小不一
 *   - 每张卡只有一层外框：卡内用分隔线分组，不套第二层有色底框
 */
export function PracticeView() {
    const [visibleProjects, setVisibleProjects] = useState<Record<PracticeProjectKind, boolean>>({ canvas: true, drama: true });
    const [scriptEnabled, setScriptEnabled] = useState(true);
    const [creatingKind, setCreatingKind] = useState<PracticeProjectKind | null>(null);

    const simulateCreate = (kind: PracticeProjectKind) => {
        if (creatingKind) return;
        setCreatingKind(kind);
        window.setTimeout(() => setCreatingKind(null), 900);
    };

    const projectCards = PRACTICE_PROJECT_CARDS.filter((card) => visibleProjects[card.kind]);
    const twoUp = projectCards.length === 2;

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

                {/* 预览用后台开关：线上由 configuration 接口下发，这里手切是为了能同时看到两种布局 */}
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <span className="text-xs font-medium tracking-wide text-[var(--gm-text-3)]">后台开关 · 预览演示</span>
                    <SwitchItem label="无限画布" checked={visibleProjects.canvas} onChange={(next) => setVisibleProjects((prev) => ({ ...prev, canvas: next }))} />
                    <SwitchItem label="无限短剧" checked={visibleProjects.drama} onChange={(next) => setVisibleProjects((prev) => ({ ...prev, drama: next }))} />
                    <SwitchItem label="剧本练习" checked={scriptEnabled} onChange={setScriptEnabled} />
                </div>

                <section className="mt-10" aria-labelledby="practice-projects-heading">
                    <SectionHeading
                        id="practice-projects-heading"
                        title="练习项目"
                        hint={twoUp ? "两个练习项目都已开启：并排两列" : projectCards.length === 1 ? "只开启一个练习项目：占满整行" : undefined}
                    />
                    {projectCards.length ? (
                        <GammaStagger className={cn("mt-4 grid gap-5", twoUp && "md:grid-cols-2")}>
                            {projectCards.map((card) => (
                                <GammaStaggerItem key={card.kind}>
                                    <ProjectCard card={card} horizontal={!twoUp} creating={creatingKind === card.kind} onCreate={() => simulateCreate(card.kind)} />
                                </GammaStaggerItem>
                            ))}
                        </GammaStagger>
                    ) : (
                        <p className="mt-4 text-sm text-[var(--gm-text-3)]">两个练习项目都已关闭 —— 线上此区块会整块隐藏，不出现在页面里。</p>
                    )}
                </section>

                {scriptEnabled ? (
                    <section className="mt-10" aria-labelledby="practice-script-heading">
                        <SectionHeading id="practice-script-heading" title="剧本练习" />
                        <ScriptEntry />
                    </section>
                ) : null}

                <section className="mt-10" aria-labelledby="practice-modules-heading">
                    <SectionHeading id="practice-modules-heading" title="练习模块" hint="单块技能专项训练，每个模块独立，互不串联" />
                    <GammaStagger className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {PRACTICE_MODULES.map((card) => (
                            <GammaStaggerItem key={card.module} className="h-full">
                                <ModuleCard card={card} />
                            </GammaStaggerItem>
                        ))}
                    </GammaStagger>
                </section>

                <section className="mt-10" aria-labelledby="practice-history-heading">
                    <SectionHeading id="practice-history-heading" title="最近练习记录" />
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

/** Hero：token 底色 + 单层描边，不用渐变大色块，浅色主题下也不会糊 */
function PracticeHero() {
    return (
        <header className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-8 ring-1 ring-[var(--gm-border)] sm:p-12">
            <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full bg-[var(--gm-accent-soft)] blur-3xl" />
            <div className="relative z-10">
                <GammaBadge tone="cyan">
                    <Sparkles className="size-3.5" />
                    免费创作空间
                </GammaBadge>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--gm-text)] sm:text-5xl">无限练习</h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--gm-text-2)] sm:text-lg">每个模块是独立的单块练习，互不串联。你可以把生成的素材保存到资产库，再在其他模块中引用。这里不是完整的漫剧创作流水线，只用于单块技能的专项训练。</p>
            </div>
        </header>
    );
}

function SectionHeading({ id, title, hint }: { id: string; title: string; hint?: string }) {
    return (
        <div>
            <h2 id={id} className="text-xl font-semibold tracking-tight text-[var(--gm-text)] sm:text-2xl">
                {title}
            </h2>
            {hint ? <p className="mt-1 text-sm text-[var(--gm-text-3)]">{hint}</p> : null}
        </div>
    );
}

function SwitchItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
    return (
        <span className="flex items-center gap-2 text-sm text-[var(--gm-text-2)]">
            <GammaSwitch checked={checked} onChange={onChange} label={label} />
            {label}
        </span>
    );
}

/** 练习项目卡：只有一层外框；「最近练习」用分隔线 + 纯文本行，不再套一层色块 */
function ProjectCard({ card, horizontal, creating, onCreate }: { card: PracticeProjectCardSpec; horizontal: boolean; creating: boolean; onCreate: () => void }) {
    const Icon = card.icon;
    const accent = SUBJECT_ACCENT[card.accent];
    return (
        <article
            className={cn(
                "group flex h-full flex-col gap-5 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)] transition-shadow duration-300 hover:shadow-[var(--gm-shadow)]",
                horizontal && "md:flex-row md:items-stretch md:gap-8 md:p-7",
            )}
        >
            <div className={cn("flex min-w-0 flex-col", horizontal && "md:w-[46%]")}>
                <div className="flex items-start justify-between gap-4">
                    <div className={cn("grid size-12 shrink-0 place-items-center rounded-[var(--gm-radius-lg)]", accent.chip)}>
                        <Icon className={cn("size-6", accent.text)} />
                    </div>
                    <GammaButton size="sm" icon={<Plus className="size-3.5" />} loading={creating} onClick={onCreate}>
                        新建
                    </GammaButton>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[var(--gm-text)]">{card.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--gm-text-2)]">{card.description}</p>
            </div>

            <div className={cn("mt-auto border-t border-[var(--gm-border)] pt-4", horizontal && "md:mt-0 md:flex-1 md:border-l md:border-t-0 md:pt-0 md:pl-8")}>
                <p className="text-xs font-medium text-[var(--gm-text-3)]">最近练习</p>
                {card.recent.length ? (
                    <ul className="mt-2 space-y-0.5">
                        {card.recent.slice(0, 3).map((item) => (
                            <li key={item.id}>
                                <button type="button" className="flex w-full items-center justify-between gap-3 rounded-[var(--gm-radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--gm-wash)]">
                                    <span className="truncate text-sm text-[var(--gm-text-2)]">{item.title}</span>
                                    <span className="shrink-0 text-xs tabular-nums text-[var(--gm-text-3)]">{item.updatedAt}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-sm text-[var(--gm-text-3)]">还没有练习项目</p>
                )}
            </div>
        </article>
    );
}

/** 剧本练习：整条入口，和练习项目卡同一套描边与内距 */
function ScriptEntry() {
    const accent = SUBJECT_ACCENT[PRACTICE_SCRIPT_ENTRY.accent];
    const Icon = PRACTICE_SCRIPT_ENTRY.icon;
    return (
        <Link
            href="/bluegamma/practice/scripts"
            className="group mt-4 flex items-center gap-4 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            <div className={cn("grid size-12 shrink-0 place-items-center rounded-[var(--gm-radius-lg)]", accent.chip)}>
                <Icon className={cn("size-6", accent.text)} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--gm-text)]">{PRACTICE_SCRIPT_ENTRY.title}</h3>
                    <GammaBadge tone="neutral">{PRACTICE_SCRIPT_ENTRY.tag}</GammaBadge>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--gm-text-2)]">{PRACTICE_SCRIPT_ENTRY.description}</p>
            </div>
            <span className="hidden shrink-0 text-xs tabular-nums text-[var(--gm-text-3)] sm:block">已练习 {PRACTICE_SCRIPT_ENTRY.doneCount} 次</span>
            <ArrowRight className="size-4 shrink-0 text-[var(--gm-text-3)] transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
    );
}

/**
 * 练习模块卡：6 张同规格，h-full + 描述两行截断 + 底部 mt-auto 让内容基线一致。
 * 不再有 wide 分支，所以不会出现宽窄、图标大小、内距都不一样的情况。
 */
function ModuleCard({ card }: { card: (typeof PRACTICE_MODULES)[number] }) {
    const Icon = card.icon;
    const accent = SUBJECT_ACCENT[card.accent];
    const href = `/bluegamma/practice/${card.module}`;
    return (
        <Link
            href={href}
            className="group flex h-full flex-col rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-[var(--gm-radius-lg)]", accent.chip)}>
                    <Icon className={cn("size-5", accent.text)} />
                </span>
                <span aria-label={`已练习 ${card.doneCount} 次`} className="shrink-0 pt-1 text-xs tabular-nums text-[var(--gm-text-3)]">
                    {card.doneCount} 次
                </span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-[var(--gm-text)]">{card.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--gm-text-2)]">{card.description}</p>
            <span className="mt-auto flex items-center gap-1 pt-5 text-xs font-medium text-[var(--gm-accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                开始练习
                <ArrowRight className="size-3.5" />
            </span>
        </Link>
    );
}

function TaskCard({ session }: { session: (typeof PRACTICE_SESSIONS)[number] }) {
    return <GammaTaskCard status={session.status} title={session.title} meta={`${session.moduleLabel} · ${session.updatedAt}`} cover={session.cover} progress={session.progress} etaSeconds={session.etaSeconds} />;
}
