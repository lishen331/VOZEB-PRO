"use client";

import { useEffect, useRef, useState } from "react";
import { App, Button, Empty, Spin } from "antd";
import { Box, Clapperboard, Film, Image, Maximize2, Mic2, PanelsTopLeft, Plus, ScrollText, UserRound, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PracticeModuleKind, PracticeProjectKind } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import { ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import { practiceApi, type PracticeProjectSummary, type PracticeSession } from "@/services/api/practice";
import PracticeSessionHistory from "./practice-session-history";

export const PRACTICE_PROJECT_CARDS: Array<{ kind: PracticeProjectKind; title: string; description: string; icon: LucideIcon }> = [
    { kind: "canvas", title: "无限画布", description: "自由组合文字、图片、视频和音频，练习节点式创作。", icon: Maximize2 },
    { kind: "drama", title: "无限短剧", description: "从剧本、分镜到镜头，完整练习一条短剧制作流程。", icon: Clapperboard },
];

export const PRACTICE_SCRIPT_ENTRY = { title: "剧本", description: "从创意到剧本文本的单人练习。", icon: ScrollText } as const;

export const PRACTICE_MODULES: Array<{ module: PracticeModuleKind; title: string; description: string; icon: LucideIcon }> = [
    { module: "character", title: "角色", description: "生成角色主体图，并继续扩展多视角设定。", icon: UserRound },
    { module: "scene", title: "场景", description: "建立空间、光线和环境氛围。", icon: PanelsTopLeft },
    { module: "prop", title: "道具", description: "把关键物件设定成可用素材。", icon: Box },
    { module: "storyboard-image", title: "分镜图", description: "组合场景、角色和道具完成镜头画面。", icon: Image },
    { module: "storyboard-video", title: "分镜视频", description: "让静态分镜进入动态镜头。", icon: Film },
    { module: "dubbing", title: "音频", description: "为台词和旁白生成情绪化配音。", icon: Mic2 },
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
                const [canvas, drama, recent] = await Promise.all([
                    configuration.projects.canvas ? practiceApi.listProjects({ kind: "canvas", pageSize: 6 }) : Promise.resolve({ projects: [] }),
                    configuration.projects.drama ? practiceApi.listProjects({ kind: "drama", pageSize: 6 }) : Promise.resolve({ projects: [] }),
                    practiceApi.listSessions({ pageSize: 6 }),
                ]);
                if (!active) return;
                setVisibleModules(configuration.modules.map((item) => item.module));
                setVisibleProjects(configuration.projects);
                setScriptEnabled((configuration as typeof configuration & { script?: { enabled?: boolean } }).script?.enabled !== false);
                setCanvasProjects(canvas.projects);
                setDramaProjects(drama.projects);
                setSessions(recent.sessions);
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : "练习记录加载失败"))
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
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-practice-home>
            <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
                <header className="border-b border-border pb-4 sm:pb-6">
                    <p className="text-xs font-medium text-muted-foreground">免费创作空间</p>
                    <h1 className="mt-1.5 text-2xl font-semibold tracking-normal sm:text-3xl">练习</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">用独立的练习项目反复尝试，不影响正式项目和课程作业。</p>
                </header>

                {projectCards.length ? (
                    <section className="mt-5 sm:mt-8" aria-labelledby="practice-projects-heading">
                        <h2 id="practice-projects-heading" className="text-base font-semibold sm:text-lg">
                            练习项目
                        </h2>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-5">
                            {projectCards.map((card) => {
                                const Icon = card.icon;
                                const projects = card.kind === "canvas" ? canvasProjects : dramaProjects;
                                return (
                                    <article key={card.kind} className="min-w-0 border border-border bg-card p-4 shadow-sm sm:p-5" data-practice-project-card={card.kind}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="grid size-10 shrink-0 place-items-center border border-border bg-muted/50 text-foreground sm:size-12">
                                                <Icon className="size-5 sm:size-6" />
                                            </div>
                                            <Button type="primary" size="small" loading={creatingKind === card.kind} icon={<Plus className="size-3.5" />} onClick={() => void createProject(card.kind)}>
                                                新建
                                            </Button>
                                        </div>
                                        <h3 className="mt-4 text-lg font-semibold">{card.title}</h3>
                                        <p className="mt-1.5 min-h-10 text-sm leading-5 text-muted-foreground">{card.description}</p>
                                        <div className="mt-4 border-t border-border pt-3">
                                            <p className="text-xs font-medium text-muted-foreground">最近练习</p>
                                            {loading ? (
                                                <Spin size="small" className="mt-3" />
                                            ) : projects.length ? (
                                                <ProjectList kind={card.kind} projects={projects.slice(0, 3)} onOpen={(id) => router.push(practiceProjectPath(card.kind, id))} />
                                            ) : (
                                                <p className="mt-2 text-sm text-muted-foreground">还没有练习项目</p>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ) : null}

                {scriptEnabled ? (
                    <section className="mt-5 sm:mt-8" aria-labelledby="practice-script-heading">
                        <div className="flex items-center justify-between gap-3">
                            <h2 id="practice-script-heading" className="text-base font-semibold sm:text-lg">
                                剧本练习
                            </h2>
                            <span className="text-xs text-muted-foreground">单人 · 文本</span>
                        </div>
                        <button
                            type="button"
                            className="mt-3 flex w-full items-center gap-3 border border-border bg-card p-3 text-left transition hover:border-foreground/40 hover:bg-muted/30 sm:p-4"
                            onClick={() => router.push("/practice/scripts")}
                            data-practice-script-entry
                        >
                            <span className="grid size-10 shrink-0 place-items-center border border-border bg-muted/50">
                                <PRACTICE_SCRIPT_ENTRY.icon className="size-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{PRACTICE_SCRIPT_ENTRY.title}</span>
                                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{PRACTICE_SCRIPT_ENTRY.description}</span>
                            </span>
                        </button>
                    </section>
                ) : null}
                <section className="mt-5 sm:mt-8" aria-labelledby="practice-modules-heading">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="practice-modules-heading" className="text-base font-semibold sm:text-lg">
                            练习模块
                        </h2>
                        <span className="text-xs text-muted-foreground">6 个模块 · 7 条工作流</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                        {moduleCards.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.module}
                                    type="button"
                                    className="min-w-0 border border-border bg-card p-3 text-left transition hover:border-foreground/40 hover:bg-muted/30 sm:p-4"
                                    onClick={() => router.push(practiceModulePath(item.module, ipReference))}
                                    data-practice-module={item.module}
                                >
                                    <Icon className="size-5 text-foreground" />
                                    <span className="mt-3 block text-sm font-medium">{item.title}</span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>
                <section className="mt-7 border-t border-border pt-5 sm:mt-10 sm:pt-6" aria-labelledby="practice-history-heading">
                    <h2 id="practice-history-heading" className="text-base font-semibold sm:text-lg">
                        最近记录
                    </h2>
                    {loading ? (
                        <div className="grid min-h-20 place-items-center">
                            <Spin />
                        </div>
                    ) : sessions.length ? (
                        <PracticeSessionHistory sessions={sessions} onOpen={(session) => router.push(practiceModulePath(session.module, { sessionId: session.id }))} />
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有单项练习记录" className="!my-5" />
                    )}
                </section>
            </div>
        </main>
    );
}

function ProjectList({ kind, projects, onOpen }: { kind: PracticeProjectKind; projects: PracticeProjectSummary[]; onOpen: (id: string) => void }) {
    return (
        <div className="mt-2 grid gap-1">
            {projects.map((project) => (
                <button key={project.id} type="button" className="flex min-w-0 items-center justify-between gap-3 py-1.5 text-left text-sm hover:text-foreground" onClick={() => onOpen(project.id)}>
                    <span className="truncate">{project.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{kind === "canvas" ? "画布" : "短剧"}</span>
                </button>
            ))}
        </div>
    );
}
