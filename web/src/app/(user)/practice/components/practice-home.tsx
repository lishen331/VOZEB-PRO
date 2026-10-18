"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { Button, Empty, Spin } from "@/components/gamma-ui/gamma-ant";
import { Box, Clapperboard, Film, Image, Maximize2, Mic2, PanelsTopLeft, Plus, ScrollText, UserRound, type LucideIcon, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

import type { PracticeModuleKind, PracticeProjectKind } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import { ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import { practiceApi, type PracticeProjectSummary, type PracticeSession } from "@/services/api/practice";
import PracticeSessionHistory from "./practice-session-history";
import { cn } from "@/lib/utils";

export const PRACTICE_PROJECT_CARDS: Array<{ kind: PracticeProjectKind; title: string; description: string; icon: LucideIcon }> = [
    { kind: "canvas", title: "无限画布", description: "自由组合文字、图片、视频和音频，练习节点式创作。", icon: Maximize2 },
    { kind: "drama", title: "无限短剧", description: "从剧本、分镜到镜头，完整练习一条短剧制作流程。", icon: Clapperboard },
];

export const PRACTICE_SCRIPT_ENTRY = { title: "剧本", description: "从创意到剧本文本的单人练习。", icon: ScrollText } as const;

export const PRACTICE_MODULES: Array<{ module: PracticeModuleKind; title: string; description: string; icon: LucideIcon; accent: string }> = [
    { module: "character", title: "角色", description: "生成角色主体图，并继续扩展多视角设定。", icon: UserRound, accent: "from-violet-500 to-purple-600" },
    { module: "scene", title: "场景", description: "建立空间、光线和环境氛围。", icon: PanelsTopLeft, accent: "from-cyan-500 to-blue-600" },
    { module: "prop", title: "道具", description: "把关键物件设定成可用素材。", icon: Box, accent: "from-amber-500 to-orange-600" },
    { module: "storyboard-image", title: "分镜图", description: "组合场景、角色和道具完成镜头画面。", icon: Image, accent: "from-emerald-500 to-green-600" },
    { module: "storyboard-video", title: "分镜视频", description: "让静态分镜进入动态镜头。", icon: Film, accent: "from-pink-500 to-rose-600" },
    { module: "dubbing", title: "音频", description: "为台词和旁白生成情绪化配音。", icon: Mic2, accent: "from-indigo-500 to-purple-600" },
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
                const [canvasResult, dramaResult, recentResult] = await Promise.allSettled([
                    configuration.projects.canvas ? practiceApi.listProjects({ kind: "canvas", pageSize: 6 }) : Promise.resolve({ projects: [] }),
                    configuration.projects.drama ? practiceApi.listProjects({ kind: "drama", pageSize: 6 }) : Promise.resolve({ projects: [] }),
                    practiceApi.listSessions({ pageSize: 6 }),
                ]);
                if (!active) return;
                if (canvasResult.status === "fulfilled") setCanvasProjects(canvasResult.value.projects);
                if (dramaResult.status === "fulfilled") setDramaProjects(dramaResult.value.projects);
                if (recentResult.status === "fulfilled") setSessions(recentResult.value.sessions);
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

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]" data-practice-home>
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
                {/* Hero */}
                <header className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-8 shadow-[0_8px_32px_rgba(99,102,241,0.25)] sm:p-12">
                    <div className="gm-on-dark relative z-10">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                            <Sparkles className="size-3.5" />
                            免费创作空间
                        </div>
                        <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">无限练习</h1>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">每个模块是独立的单块练习，互不串联。你可以把生成的素材保存到资产库，再在其他模块中引用。这里不是完整的漫剧创作流水线，只用于单块技能的专项训练。</p>
                    </div>
                    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.08),transparent_60%)]" />
                    <div aria-hidden className="absolute -right-12 -top-12 size-64 rounded-full bg-white/5 blur-3xl" />
                    <div aria-hidden className="absolute -left-12 -bottom-12 size-64 rounded-full bg-white/5 blur-3xl" />
                </header>

                {/* 练习项目 */}
                {projectCards.length ? (
                    <section className="mt-8" aria-labelledby="practice-projects-heading">
                        <h2 id="practice-projects-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                            练习项目
                        </h2>
                        <div className="mt-4 grid gap-5 md:grid-cols-2">
                            {projectCards.map((card) => {
                                const Icon = card.icon;
                                const projects = card.kind === "canvas" ? canvasProjects : dramaProjects;
                                const isCanvas = card.kind === "canvas";
                                return (
                                    <motion.article
                                        key={card.kind}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="group relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)] hover:ring-[var(--gm-border-strong)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                                        data-practice-project-card={card.kind}
                                    >
                                        <div aria-hidden className={cn("absolute -right-20 -top-20 size-64 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100", isCanvas ? "bg-cyan-500/10" : "bg-violet-500/10")} />
                                        <div className="relative z-10">
                                            <div className="flex items-start justify-between gap-4">
                                                <div
                                                    className={cn(
                                                        "grid size-14 place-items-center rounded-[var(--gm-radius-lg)] shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-transform duration-300 group-hover:scale-105",
                                                        isCanvas ? "bg-gradient-to-br from-cyan-500 to-blue-600" : "bg-gradient-to-br from-violet-500 to-purple-600",
                                                    )}
                                                >
                                                    <Icon className="size-7 text-white" />
                                                </div>
                                                <Button type="primary" size="small" loading={creatingKind === card.kind} icon={<Plus className="size-3.5" />} onClick={() => void createProject(card.kind)}>
                                                    新建
                                                </Button>
                                            </div>
                                            <h3 className="mt-5 text-xl font-semibold text-[var(--gm-text)]">{card.title}</h3>
                                            <p className="mt-2 text-sm leading-6 text-[var(--gm-text-2)]">{card.description}</p>
                                            <div className="mt-5 rounded-[var(--gm-radius-lg)] bg-[var(--gm-wash)] p-4">
                                                <p className="text-xs font-medium text-[var(--gm-text-3)]">最近练习</p>
                                                {loading ? (
                                                    <div className="mt-3 flex justify-center">
                                                        <Spin size="small" />
                                                    </div>
                                                ) : projects.length ? (
                                                    <ProjectList kind={card.kind} projects={projects.slice(0, 3)} onOpen={(id) => router.push(practiceProjectPath(card.kind, id))} />
                                                ) : (
                                                    <p className="mt-3 text-sm text-[var(--gm-text-3)]">还没有练习项目</p>
                                                )}
                                            </div>
                                        </div>
                                    </motion.article>
                                );
                            })}
                        </div>
                    </section>
                ) : null}

                {/* 剧本练习 */}
                {scriptEnabled ? (
                    <section className="mt-8" aria-labelledby="practice-script-heading">
                        <h2 id="practice-script-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                            剧本练习
                        </h2>
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className="group mt-4 flex w-full items-center gap-4 overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 text-left ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:ring-[var(--gm-border-strong)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                            onClick={() => router.push("/practice/scripts")}
                            data-practice-script-entry
                        >
                            <div className="grid size-14 shrink-0 place-items-center rounded-[var(--gm-radius-lg)] bg-gradient-to-br from-emerald-500 to-green-600 shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-transform duration-300 group-hover:scale-105">
                                <PRACTICE_SCRIPT_ENTRY.icon className="size-7 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-semibold text-[var(--gm-text)]">{PRACTICE_SCRIPT_ENTRY.title}</span>
                                    <span className="rounded-full bg-[var(--gm-wash)] px-2 py-0.5 text-xs font-medium text-[var(--gm-text-3)]">单人 · 文本</span>
                                </div>
                                <span className="mt-1 block text-sm text-[var(--gm-text-2)]">{PRACTICE_SCRIPT_ENTRY.description}</span>
                            </div>
                        </motion.button>
                    </section>
                ) : null}

                {/* 练习模块 */}
                <section className="mt-8" aria-labelledby="practice-modules-heading">
                    <h2 id="practice-modules-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                        练习模块
                    </h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {moduleCards.map((card, index) => {
                            const Icon = card.icon;
                            return (
                                <motion.button
                                    key={card.module}
                                    type="button"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    whileHover={{ y: -4 }}
                                    className="group relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 text-left ring-1 ring-[var(--gm-border)] transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                                    onClick={() => router.push(practiceModulePath(card.module, ipReference ? { reference: ipReference } : undefined))}
                                    data-practice-module={card.module}
                                >
                                    <div aria-hidden className={cn("absolute -right-12 -bottom-12 size-48 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20", `bg-gradient-to-br ${card.accent}`)} />
                                    <div className="relative z-10">
                                        <div
                                            className={cn(
                                                "inline-grid size-12 place-items-center rounded-[var(--gm-radius-lg)] bg-gradient-to-br shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)]",
                                                card.accent,
                                            )}
                                        >
                                            <Icon className="size-6 text-white" />
                                        </div>
                                        <h3 className="mt-4 text-base font-semibold text-[var(--gm-text)]">{card.title}</h3>
                                        <p className="mt-1 text-sm leading-6 text-[var(--gm-text-2)]">{card.description}</p>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </section>

                {/* 最近练习记录 */}
                {sessions.length ? (
                    <section className="mt-8" aria-labelledby="practice-history-heading">
                        <h2 id="practice-history-heading" className="text-xl font-semibold text-[var(--gm-text)] sm:text-2xl">
                            最近练习记录
                        </h2>
                        <div className="mt-4 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                            <PracticeSessionHistory sessions={sessions} onOpen={(session) => router.push(practiceModulePath(session.module, { sessionId: session.id }))} />
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
    );
}

function ProjectList({ kind, projects, onOpen }: { kind: PracticeProjectKind; projects: PracticeProjectSummary[]; onOpen: (id: string) => void }) {
    return (
        <div className="mt-3 space-y-2">
            {projects.map((project) => (
                <button
                    key={project.id}
                    type="button"
                    onClick={() => onOpen(project.id)}
                    className="block w-full truncate rounded-[var(--gm-radius-sm)] px-2 py-1.5 text-left text-sm text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                >
                    {project.title}
                </button>
            ))}
        </div>
    );
}
