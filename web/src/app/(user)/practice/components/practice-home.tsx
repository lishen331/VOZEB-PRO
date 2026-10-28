"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Spin } from "@/components/gamma-ui/gamma-ant";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaStatCard } from "@/components/gamma-ui/gamma-cards";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaStagger, GammaStaggerItem } from "@/components/gamma-ui/gamma-motion";
import { SUBJECT_ACCENT, type SubjectAccent } from "@/components/gamma-ui/gamma-subjects";
import { Box, Clapperboard, Film, Image as ImageIcon, Maximize2, Mic2, PanelsTopLeft, Plus, ScrollText, UserRound, type LucideIcon, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PracticeModuleKind, PracticeProjectKind } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import { ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import { practiceApi, type PracticeProjectSummary, type PracticeSession } from "@/services/api/practice";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import PracticeSessionHistory from "./practice-session-history";
import { cn } from "@/lib/utils";

/**
 * 对照 gamma-ui 设计稿（见 app/bluegamma/practice/practice-view.tsx）重做视觉：
 *   - antd 渐变大色块 Hero → token 底色 + 单层描边
 *   - 练习项目卡只保留一层外框，「最近练习」用分隔线而不是第二层色块
 *   - 顶部统计卡接真实数据（累计练习 = 会话总数，已保存素材 = 资产库总数）；
 *     设计稿还有一张「当前连续天数」，后台没有这个数据源，不展示假数字
 * 设计稿里「后台开关 · 预览演示」是本地手切开关，用来同时看两种布局；
 * 这里本来就从 practiceApi.listModules() 读后台配置驱动显隐，不需要也不展示这组开关
 */
export const PRACTICE_PROJECT_CARDS: Array<{ kind: PracticeProjectKind; title: string; description: string; icon: LucideIcon; accent: SubjectAccent }> = [
    { kind: "canvas", title: "无限画布", description: "自由组合文字、图片、视频和音频，练习节点式创作。", icon: Maximize2, accent: "cyan" },
    { kind: "drama", title: "无限短剧", description: "从剧本、分镜到镜头，完整练习一条短剧制作流程。", icon: Clapperboard, accent: "violet" },
];

export const PRACTICE_SCRIPT_ENTRY = { title: "剧本", description: "从创意到剧本文本的单人练习。", icon: ScrollText, accent: "teal" as SubjectAccent, tag: "单人 · 文本" } as const;

export const PRACTICE_MODULES: Array<{ module: PracticeModuleKind; title: string; description: string; icon: LucideIcon; accent: SubjectAccent }> = [
    { module: "character", title: "角色", description: "生成角色主体图，并继续扩展多视角设定。", icon: UserRound, accent: "violet" },
    { module: "scene", title: "场景", description: "建立空间、光线和环境氛围。", icon: PanelsTopLeft, accent: "sky" },
    { module: "prop", title: "道具", description: "把关键物件设定成可用素材。", icon: Box, accent: "teal" },
    { module: "storyboard-image", title: "分镜图", description: "组合场景、角色和道具完成镜头画面。", icon: ImageIcon, accent: "cyan" },
    { module: "storyboard-video", title: "分镜视频", description: "让静态分镜进入动态镜头。", icon: Film, accent: "blue" },
    { module: "dubbing", title: "音频", description: "为台词和旁白生成情绪化配音。", icon: Mic2, accent: "indigo" },
];
export function practiceProjectPath(kind: PracticeProjectKind, id: string) {
    return `/${kind}/${encodeURIComponent(id)}`;
}

export function practiceModulePath(module: PracticeModuleKind, options?: IpReference | { reference?: IpReference; sessionId?: string }) {
    const reference = options && "id" in options ? options : options?.reference;
    const sessionId = options && !("id" in options) ? options.sessionId : undefined;
    if (!reference && !sessionId) return `/practice/${module}`;
    const query = new URLSearchParams();
    if (reference) {
        query.set("ipId", reference.id);
        query.set("subIpId", reference.subIpId);
    }
    if (sessionId) query.set("sessionId", sessionId);
    return `/practice/${module}?${query.toString()}`;
}

type PracticeStat = { label: string; value: number; delta?: string };

export default function PracticeHome() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const [canvasProjects, setCanvasProjects] = useState<PracticeProjectSummary[]>([]);
    const [dramaProjects, setDramaProjects] = useState<PracticeProjectSummary[]>([]);
    const [sessions, setSessions] = useState<PracticeSession[]>([]);
    const [visibleModules, setVisibleModules] = useState<PracticeModuleKind[]>([]);
    const [scriptEnabled, setScriptEnabled] = useState(true);
    const [visibleProjects, setVisibleProjects] = useState<Record<PracticeProjectKind, boolean>>({ canvas: false, drama: false });
    const [stats, setStats] = useState<PracticeStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [creatingKind, setCreatingKind] = useState<PracticeProjectKind | null>(null);
    const copyProjectId = searchParams.get("projectId");
    const ipReference = ipReferenceFromQuery(searchParams);
    const handledCopyRef = useRef("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        void practiceApi
            .listModules()
            .then(async (configuration) => {
                if (!active) return;
                setVisibleModules(configuration.modules.map((item) => item.module));
                setVisibleProjects(configuration.projects);
                setScriptEnabled((configuration as typeof configuration & { script?: { enabled?: boolean } }).script?.enabled !== false);
                const [canvasResult, dramaResult, recentResult, sessionsTotalResult, assetsTotalResult] = await Promise.allSettled([
                    configuration.projects.canvas ? practiceApi.listProjects({ kind: "canvas", pageSize: 6 }) : Promise.resolve({ projects: [] }),
                    configuration.projects.drama ? practiceApi.listProjects({ kind: "drama", pageSize: 6 }) : Promise.resolve({ projects: [] }),
                    practiceApi.listSessions({ pageSize: 6 }),
                    practiceApi.listSessions({ pageSize: 1 }),
                    listLibraryAssetPage({ page: 1, pageSize: 1 }),
                ]);
                if (!active) return;
                if (canvasResult.status === "fulfilled") setCanvasProjects(canvasResult.value.projects);
                if (dramaResult.status === "fulfilled") setDramaProjects(dramaResult.value.projects);
                if (recentResult.status === "fulfilled") setSessions(recentResult.value.sessions);
                setStats(
                    [
                        sessionsTotalResult.status === "fulfilled" ? { label: "累计练习", value: sessionsTotalResult.value.total } : null,
                        assetsTotalResult.status === "fulfilled" ? { label: "已保存素材", value: assetsTotalResult.value.total } : null,
                    ].filter((item): item is PracticeStat => item !== null),
                );
                if ([canvasResult, dramaResult, recentResult].some((result) => result.status === "rejected")) message.error("部分练习记录暂时无法加载，不影响新建练习");
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : "练习模块加载失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [message]);

    useEffect(() => {
        if (!copyProjectId || handledCopyRef.current === copyProjectId) return;
        handledCopyRef.current = copyProjectId;
        void (async () => {
            for (const kind of ["canvas", "drama"] as const) {
                try {
                    const result = await practiceApi.getProject(copyProjectId, kind);
                    router.replace(practiceProjectPath(kind, result.project.id));
                    return;
                } catch {
                    // The copy endpoint does not include the kind in its public redirect.
                }
            }
            message.error("练习项目不存在或已失效");
        })();
    }, [copyProjectId, message, router]);

    const createProject = async (kind: PracticeProjectKind) => {
        if (creatingKind) return;
        setCreatingKind(kind);
        try {
            const result = await practiceApi.createProject({ kind, title: kind === "canvas" ? "无限练习画布" : "无限练习短剧", references: ipReference ? [ipReference] : undefined });
            router.push(practiceProjectPath(kind, result.project.id));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "练习项目创建失败");
        } finally {
            setCreatingKind(null);
        }
    };

    const projectCards = PRACTICE_PROJECT_CARDS.filter((card) => visibleProjects[card.kind]);
    const moduleCards = PRACTICE_MODULES.filter((card) => visibleModules.includes(card.module));
    const twoUp = projectCards.length === 2;

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]" data-practice-home>
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
                <PracticeHero />

                {stats.length ? (
                    <section className="mt-6 grid gap-4 sm:grid-cols-2">
                        {stats.map((stat) => (
                            <GammaStatCard key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} icon={<Sparkles className="size-4" />} />
                        ))}
                    </section>
                ) : null}

                {/* 练习项目 */}
                {projectCards.length ? (
                    <section className="mt-10" aria-labelledby="practice-projects-heading">
                        <SectionHeading id="practice-projects-heading" title="练习项目" hint={twoUp ? "两个练习项目都已开启：并排两列" : undefined} />
                        <GammaStagger className={cn("mt-4 grid gap-5", twoUp && "md:grid-cols-2")}>
                            {projectCards.map((card) => {
                                const projects = card.kind === "canvas" ? canvasProjects : dramaProjects;
                                return (
                                    <GammaStaggerItem key={card.kind}>
                                        <ProjectCard
                                            card={card}
                                            horizontal={!twoUp}
                                            loading={loading}
                                            projects={projects}
                                            creating={creatingKind === card.kind}
                                            onCreate={() => void createProject(card.kind)}
                                            onOpen={(id) => router.push(practiceProjectPath(card.kind, id))}
                                        />
                                    </GammaStaggerItem>
                                );
                            })}
                        </GammaStagger>
                    </section>
                ) : null}

                {/* 剧本练习 */}
                {scriptEnabled ? (
                    <section className="mt-10" aria-labelledby="practice-script-heading">
                        <SectionHeading id="practice-script-heading" title="剧本练习" />
                        <ScriptEntry onClick={() => router.push("/practice/scripts")} />
                    </section>
                ) : null}

                {/* 练习模块 */}
                <section className="mt-10" aria-labelledby="practice-modules-heading">
                    <SectionHeading id="practice-modules-heading" title="练习模块" hint="单块技能专项训练，每个模块独立，互不串联" />
                    <GammaStagger className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {moduleCards.map((card) => (
                            <GammaStaggerItem key={card.module} className="h-full">
                                <ModuleCard card={card} onClick={() => router.push(practiceModulePath(card.module, ipReference ? { reference: ipReference } : undefined))} />
                            </GammaStaggerItem>
                        ))}
                    </GammaStagger>
                </section>

                {/* 最近练习记录 */}
                {sessions.length ? (
                    <section className="mt-10" aria-labelledby="practice-history-heading">
                        <SectionHeading id="practice-history-heading" title="最近练习记录" />
                        <div className="mt-4 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                            <PracticeSessionHistory sessions={sessions} onOpen={(session) => router.push(practiceModulePath(session.module, { sessionId: session.id }))} />
                        </div>
                    </section>
                ) : null}
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

/** 练习项目卡：只有一层外框；「最近练习」用分隔线 + 纯文本行，不再套一层色块 */
function ProjectCard({
    card,
    horizontal,
    loading,
    projects,
    creating,
    onCreate,
    onOpen,
}: {
    card: (typeof PRACTICE_PROJECT_CARDS)[number];
    horizontal: boolean;
    loading: boolean;
    projects: PracticeProjectSummary[];
    creating: boolean;
    onCreate: () => void;
    onOpen: (id: string) => void;
}) {
    const Icon = card.icon;
    const accent = SUBJECT_ACCENT[card.accent];
    return (
        <article
            data-practice-project-card={card.kind}
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
                {loading ? (
                    <div className="mt-3 flex justify-center">
                        <Spin size="small" />
                    </div>
                ) : projects.length ? (
                    <ul className="mt-2 space-y-0.5">
                        {projects.slice(0, 3).map((project) => (
                            <li key={project.id}>
                                <button type="button" onClick={() => onOpen(project.id)} className="flex w-full items-center justify-between gap-3 rounded-[var(--gm-radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--gm-wash)]">
                                    <span className="truncate text-sm text-[var(--gm-text-2)]">{project.title}</span>
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
function ScriptEntry({ onClick }: { onClick: () => void }) {
    const accent = SUBJECT_ACCENT[PRACTICE_SCRIPT_ENTRY.accent];
    const Icon = PRACTICE_SCRIPT_ENTRY.icon;
    return (
        <button
            type="button"
            onClick={onClick}
            data-practice-script-entry
            className="group mt-4 flex w-full items-center gap-4 overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 text-left ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)]"
        >
            <div className={cn("grid size-14 shrink-0 place-items-center rounded-[var(--gm-radius-lg)]", accent.chip)}>
                <Icon className={cn("size-7", accent.text)} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-[var(--gm-text)]">{PRACTICE_SCRIPT_ENTRY.title}</span>
                    <GammaBadge tone="neutral">{PRACTICE_SCRIPT_ENTRY.tag}</GammaBadge>
                </div>
                <span className="mt-1 block text-sm text-[var(--gm-text-2)]">{PRACTICE_SCRIPT_ENTRY.description}</span>
            </div>
        </button>
    );
}

/** 练习模块卡：6 张同规格，描述两行截断，内容基线一致 */
function ModuleCard({ card, onClick }: { card: (typeof PRACTICE_MODULES)[number]; onClick: () => void }) {
    const Icon = card.icon;
    const accent = SUBJECT_ACCENT[card.accent];
    return (
        <button
            type="button"
            onClick={onClick}
            data-practice-module={card.module}
            className="group flex h-full flex-col rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 text-left ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-[var(--gm-radius-lg)]", accent.chip)}>
                    <Icon className={cn("size-5", accent.text)} />
                </span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-[var(--gm-text)]">{card.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--gm-text-2)]">{card.description}</p>
        </button>
    );
}
