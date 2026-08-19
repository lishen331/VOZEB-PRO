"use client";

import { useEffect, useRef, useState } from "react";
import { App, Button, Empty, Spin } from "antd";
import { BookOpen, Clapperboard, Film, Image, Maximize2, Mic2, Music2, Plus, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PracticeModuleKind, PracticeProjectKind } from "@/lib/practice-domain";
import { practiceApi, type PracticeProjectSummary, type PracticeSession } from "@/services/api/practice";

export const PRACTICE_PROJECT_CARDS: Array<{ kind: PracticeProjectKind; title: string; description: string; icon: LucideIcon }> = [
    { kind: "canvas", title: "无限画布", description: "自由组合文字、图片、视频和音频，练习节点式创作。", icon: Maximize2 },
    { kind: "drama", title: "无限短剧", description: "从剧本、分镜到镜头，完整练习一条短剧制作流程。", icon: Clapperboard },
];

export const PRACTICE_MODULES: Array<{ module: PracticeModuleKind; title: string; description: string; icon: LucideIcon }> = [
    { module: "script", title: "剧本练习", description: "把一个想法展开成可拍的场景。", icon: BookOpen },
    { module: "storyboard-image", title: "分镜图练习", description: "练习画面构图、镜头和视觉重点。", icon: Image },
    { module: "storyboard-video", title: "分镜视频练习", description: "把静态镜头推进到动态画面。", icon: Film },
    { module: "dubbing", title: "配音练习", description: "为角色和旁白找到合适的声音。", icon: Mic2 },
    { module: "music", title: "音乐练习", description: "为一段情绪或场景尝试配乐。", icon: Music2 },
];

export function practiceProjectPath(kind: PracticeProjectKind, id: string) {
    return `/${kind}/${encodeURIComponent(id)}`;
}

export function practiceModulePath(module: PracticeModuleKind) {
    return `/practice/${module}`;
}

export default function PracticeHome() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const [canvasProjects, setCanvasProjects] = useState<PracticeProjectSummary[]>([]);
    const [dramaProjects, setDramaProjects] = useState<PracticeProjectSummary[]>([]);
    const [sessions, setSessions] = useState<PracticeSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [creatingKind, setCreatingKind] = useState<PracticeProjectKind | null>(null);
    const copyProjectId = searchParams.get("projectId");
    const handledCopyRef = useRef("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        void Promise.all([practiceApi.listProjects({ kind: "canvas", pageSize: 6 }), practiceApi.listProjects({ kind: "drama", pageSize: 6 }), practiceApi.listSessions({ pageSize: 6 })])
            .then(([canvas, drama, recent]) => {
                if (!active) return;
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
            const result = await practiceApi.createProject({ kind, title: kind === "canvas" ? "无限练习画布" : "无限练习短剧" });
            router.push(practiceProjectPath(kind, result.project.id));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "练习项目创建失败");
        } finally {
            setCreatingKind(null);
        }
    };

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-practice-home>
            <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
                <header className="border-b border-border pb-4 sm:pb-6">
                    <p className="text-xs font-medium text-muted-foreground">学校创作空间</p>
                    <h1 className="mt-1.5 text-2xl font-semibold tracking-normal sm:text-3xl">无限练习</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">用独立的练习项目反复尝试，不影响正式项目和课程作业。</p>
                </header>

                <section className="mt-5 sm:mt-8" aria-labelledby="practice-projects-heading">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="practice-projects-heading" className="text-base font-semibold sm:text-lg">
                            练习项目
                        </h2>
                        <span className="text-xs text-muted-foreground">画布与短剧</span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-5">
                        {PRACTICE_PROJECT_CARDS.map((card) => {
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

                <section className="mt-7 sm:mt-10" aria-labelledby="practice-modules-heading">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="practice-modules-heading" className="text-base font-semibold sm:text-lg">
                            单项练习
                        </h2>
                        <span className="text-xs text-muted-foreground">从一个能力开始</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
                        {PRACTICE_MODULES.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.module}
                                    type="button"
                                    className="min-w-0 border border-border bg-card p-3 text-left transition hover:border-foreground/40 hover:bg-muted/30 sm:p-4"
                                    onClick={() => router.push(practiceModulePath(item.module))}
                                    data-practice-module={item.module}
                                >
                                    <Icon className="size-5 text-foreground" />
                                    <span className="mt-3 block truncate text-sm font-medium">{item.title}</span>
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
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {sessions.map((session) => (
                                <button key={session.id} type="button" className="min-w-0 border border-border px-3 py-3 text-left hover:bg-muted/30" onClick={() => router.push(practiceModulePath(session.module))}>
                                    <span className="block truncate text-sm font-medium">{session.title}</span>
                                    <span className="mt-1 block text-xs text-muted-foreground">{session.status === "success" ? "已完成" : session.status === "failed" ? "需要重试" : "处理中"}</span>
                                </button>
                            ))}
                        </div>
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
