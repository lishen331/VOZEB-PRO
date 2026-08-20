"use client";

import { Alert, Button, Spin, Tag } from "antd";
import { ArrowLeft, ArrowRight, Box, Check, Circle, Clapperboard, FlaskConical, Map, Package, Plus, RefreshCcw, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DramaProject } from "@/lib/drama-project-contract";
import { DRAMA_WORKFLOW_LAB_STAGES, getDramaWorkflowLabProgress, getDramaWorkflowLabStageStatus, type DramaWorkflowLabStageId } from "@/lib/drama-workflow-lab";
import { cn } from "@/lib/utils";

type ProjectResponse = { code: number; data?: { project?: DramaProject }; msg?: string };

export function DramaWorkflowLabProject({ projectId }: { projectId: string }) {
    const [project, setProject] = useState<DramaProject>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [activeStage, setActiveStage] = useState<DramaWorkflowLabStageId>("script");
    const [activeEpisodeId, setActiveEpisodeId] = useState<string>();

    const loadProject = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const response = await fetch(`/api/drama/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
            const payload = (await response.json()) as ProjectResponse;
            if (!response.ok || payload.code !== 0 || !payload.data?.project) throw new Error(payload.msg || "项目加载失败");
            setProject(payload.data.project);
            setActiveEpisodeId((current) => current || payload.data?.project?.activeEpisodeId || payload.data?.project?.episodes[0]?.id);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "项目加载失败");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void loadProject();
    }, [loadProject]);

    const progress = useMemo(() => {
        if (!project) return undefined;
        const shots = project.episodes.flatMap((episode) => episode.shots);
        return getDramaWorkflowLabProgress({
            hasScript: project.episodes.some((episode) => episode.script.trim().length > 0),
            reviewed: project.episodes.length > 0 && project.episodes.every((episode) => episode.reviewStatus === "approved" || episode.reviewStatus === "visual_ready"),
            hasAssets: project.characters.length > 0 || project.scenes.length > 0 || project.props.length > 0,
            hasStoryboard: shots.length > 0,
            hasGeneratedShot: shots.some((shot) => shot.videoUrl || shot.generationStatus === "success"),
            exported: project.episodes.some((episode) => episode.renderTask?.status === "success"),
        });
    }, [project]);

    const activeEpisode = project?.episodes.find((episode) => episode.id === activeEpisodeId) || project?.episodes[0];

    if (loading)
        return (
            <main className="grid h-full place-items-center bg-background">
                <Spin />
            </main>
        );
    if (error || !project || !progress) {
        return (
            <main className="h-full overflow-y-auto bg-background px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-3xl">
                    <Link href="/drama-lab" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="size-4" /> 返回短剧项目
                    </Link>
                    <Alert
                        className="mt-6"
                        type="error"
                        showIcon
                        message={error || "项目不存在"}
                        action={
                            <Button size="small" icon={<RefreshCcw className="size-3.5" />} onClick={() => void loadProject()}>
                                重试
                            </Button>
                        }
                    />
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-4 sm:px-6">
                <Link href="/drama-lab" className="grid size-9 shrink-0 place-items-center border border-border text-muted-foreground hover:text-foreground" aria-label="返回项目列表">
                    <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0">
                    <h1 className="truncate text-base font-semibold">{project.title}</h1>
                    <p className="truncate text-xs text-muted-foreground">{activeEpisode?.title || "第 1 集"}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button icon={<Settings2 className="size-4" />} className="hidden sm:inline-flex">
                        项目设置
                    </Button>
                    <Link href={`/drama/${project.id}`}>
                        <Button type="primary" icon={<Clapperboard className="size-4" />}>
                            打开制作编辑器
                        </Button>
                    </Link>
                </div>
            </header>

            <nav className="shrink-0 overflow-x-auto border-b border-border bg-card px-4 sm:px-6" aria-label="短剧制作阶段">
                <div className="mx-auto flex min-w-max justify-center">
                    {DRAMA_WORKFLOW_LAB_STAGES.map((stage, index) => {
                        const status = getDramaWorkflowLabStageStatus(stage.id, progress.activeStageId, progress.completedStageIds);
                        const selected = activeStage === stage.id;
                        return (
                            <button
                                key={stage.id}
                                type="button"
                                onClick={() => setActiveStage(stage.id)}
                                className={cn("relative flex h-16 items-center gap-2 px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground", selected && "bg-muted/50 text-foreground")}
                            >
                                <span
                                    className={cn(
                                        "grid size-6 place-items-center rounded-full border border-border text-xs",
                                        selected && "border-primary bg-primary text-primary-foreground",
                                        status === "completed" && !selected && "border-emerald-500 text-emerald-600",
                                    )}
                                >
                                    {status === "completed" && !selected ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span>{stage.label}</span>
                                {index < DRAMA_WORKFLOW_LAB_STAGES.length - 1 ? <ArrowRight className="ml-2 size-3.5 text-muted-foreground/50" /> : null}
                                {selected ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" /> : null}
                            </button>
                        );
                    })}
                </div>
            </nav>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="hidden min-h-0 border-r border-border bg-card lg:flex lg:flex-col">
                    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                        <span className="text-sm font-semibold">
                            剧集 <span className="ml-1 text-muted-foreground">{project.episodes.length}</span>
                        </span>
                        <Button type="text" size="small" icon={<Plus className="size-4" />} aria-label="新建集数" />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {project.episodes.map((episode, index) => (
                            <button
                                key={episode.id}
                                type="button"
                                onClick={() => setActiveEpisodeId(episode.id)}
                                className={cn("mb-2 flex w-full items-start gap-3 border border-transparent px-3 py-3 text-left hover:bg-muted/50", activeEpisode?.id === episode.id && "border-primary/40 bg-primary/5")}
                            >
                                <span className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold">{String(index + 1).padStart(2, "0")}</span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{episode.title || `第 ${index + 1} 集`}</span>
                                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                                        {episode.script.length} 字 · {episode.shots.length} 分镜
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    <Button className="m-3" icon={<Plus className="size-4" />}>
                        新建集数
                    </Button>
                </aside>

                <section className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-6xl">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                            <div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <FlaskConical className="size-4" />
                                    LocalMiniDrama 工作区
                                </div>
                                <h2 className="mt-2 text-xl font-semibold">{DRAMA_WORKFLOW_LAB_STAGES.find((stage) => stage.id === activeStage)?.label}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">{DRAMA_WORKFLOW_LAB_STAGES.find((stage) => stage.id === activeStage)?.description}</p>
                            </div>
                            <Tag color={activeStage === progress.activeStageId ? "processing" : "default"}>{activeStage === progress.activeStageId ? "当前阶段" : "阶段预览"}</Tag>
                        </div>

                        {activeStage === "script" ? <ScriptStage project={project} episode={activeEpisode} /> : null}
                        {activeStage === "review" ? <ReviewStage episode={activeEpisode} /> : null}
                        {activeStage === "assets" ? <AssetsStage project={project} /> : null}
                        {activeStage === "storyboard" ? <StoryboardStage episode={activeEpisode} /> : null}
                        {activeStage === "shots" ? <ShotsStage episode={activeEpisode} /> : null}
                        {activeStage === "export" ? <ExportStage project={project} /> : null}
                    </div>
                </section>
            </div>
        </main>
    );
}

function ScriptStage({ project, episode }: { project: DramaProject; episode?: DramaProject["episodes"][number] }) {
    return (
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <h3 className="font-semibold">{episode?.title || "第 1 集"} · 剧本</h3>
                        <p className="mt-1 text-xs text-muted-foreground">先生成或导入剧本，再进入内容审核。</p>
                    </div>
                    <Link href={`/drama/${project.id}`}>
                        <Button type="primary">编辑剧本</Button>
                    </Link>
                </div>
                <div className="min-h-72 whitespace-pre-wrap p-5 text-sm leading-7 text-muted-foreground">{episode?.script || "当前剧集还没有剧本内容。打开制作编辑器，可从故事梗概生成剧本或直接导入文本。"}</div>
            </div>
            <div className="border border-border bg-muted/20 p-5">
                <h3 className="text-sm font-semibold">项目信息</h3>
                <dl className="mt-4 grid gap-3 text-sm">
                    <Info label="画面比例" value={project.ratio} />
                    <Info label="统一风格" value={project.style || "未设置"} />
                    <Info label="剧集" value={`${project.episodes.length} 集`} />
                    <Info label="当前字数" value={`${episode?.script.length || 0} 字`} />
                </dl>
            </div>
        </div>
    );
}

function ReviewStage({ episode }: { episode?: DramaProject["episodes"][number] }) {
    return <StageEmpty icon={<Circle className="size-5" />} title="内容审核" description={`当前状态：${episode?.reviewStatus || "draft"}。剧本准备完成后，在这里确认结构、人物和内容方向。`} />;
}

function AssetsStage({ project }: { project: DramaProject }) {
    const groups = [
        { label: "角色", icon: UserRound, items: project.characters },
        { label: "场景", icon: Map, items: project.scenes },
        { label: "道具", icon: Package, items: project.props },
    ];
    return (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
            {groups.map(({ label, icon: Icon, items }) => (
                <div key={label} className="border border-border bg-card p-5">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-semibold">
                            <Icon className="size-4" />
                            {label}
                        </span>
                        <Tag>{items.length}</Tag>
                    </div>
                    <div className="mt-4 space-y-2">
                        {items.slice(0, 5).map((item) => (
                            <div key={item.id} className="border-t border-border pt-2 text-sm">
                                {item.name}
                            </div>
                        ))}
                        {!items.length ? <p className="py-8 text-center text-sm text-muted-foreground">暂无{label}</p> : null}
                    </div>
                </div>
            ))}
        </div>
    );
}

function StoryboardStage({ episode }: { episode?: DramaProject["episodes"][number] }) {
    return <StageEmpty icon={<Box className="size-5" />} title={`${episode?.shots.length || 0} 个分镜`} description="内容审核通过后生成分镜，并在这里调整镜头顺序、画面提示词和连续性。" />;
}
function ShotsStage({ episode }: { episode?: DramaProject["episodes"][number] }) {
    return <StageEmpty icon={<Clapperboard className="size-5" />} title="镜头生成" description={`当前 ${episode?.shots.filter((shot) => shot.videoUrl).length || 0} 个镜头已有视频结果。`} />;
}
function ExportStage({ project }: { project: DramaProject }) {
    return <StageEmpty icon={<Clapperboard className="size-5" />} title="成片导出" description={`项目共 ${project.episodes.length} 集。镜头和音频准备完成后在这里合成并导出成片。`} />;
}

function StageEmpty({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div className="mt-6 grid min-h-72 place-items-center border border-border bg-card p-8 text-center">
            <div>
                <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium">{value}</dd>
        </div>
    );
}
