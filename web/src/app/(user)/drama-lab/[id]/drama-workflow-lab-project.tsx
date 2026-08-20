"use client";

import { Alert, Button, Spin, Tag } from "antd";
import { ArrowLeft, Check, Circle, FlaskConical, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DramaProject } from "@/lib/drama-project-contract";
import { DRAMA_WORKFLOW_LAB_STAGES, getDramaWorkflowLabProgress, getDramaWorkflowLabStageStatus } from "@/lib/drama-workflow-lab";

type ProjectResponse = { code: number; data?: { project?: DramaProject }; msg?: string };

export function DramaWorkflowLabProject({ projectId }: { projectId: string }) {
    const [project, setProject] = useState<DramaProject>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();

    const loadProject = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const response = await fetch(`/api/drama/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
            const payload = (await response.json()) as ProjectResponse;
            if (!response.ok || payload.code !== 0 || !payload.data?.project) throw new Error(payload.msg || "项目加载失败");
            setProject(payload.data.project);
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

    if (loading) {
        return (
            <main className="grid h-full place-items-center bg-background">
                <Spin />
            </main>
        );
    }

    if (error || !project || !progress) {
        return (
            <main className="h-full overflow-y-auto bg-background px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-3xl">
                    <Link href="/drama-lab" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="size-4" /> 返回实验室
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
        <main className="h-full overflow-y-auto bg-background text-foreground">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
                <Link href="/drama-lab" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-4" /> 返回实验室
                </Link>
                <header className="mt-5 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FlaskConical className="size-4" /> 隔离实验项目
                        </div>
                        <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{project.title}</h1>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.summary || "暂无项目摘要"}</p>
                    </div>
                    <Tag color="blue">只读验证</Tag>
                </header>

                <section aria-label="项目工作流进度" className="mt-6 grid gap-2 md:grid-cols-6">
                    {DRAMA_WORKFLOW_LAB_STAGES.map((stage, index) => {
                        const status = getDramaWorkflowLabStageStatus(stage.id, progress.activeStageId, progress.completedStageIds);
                        return (
                            <div key={stage.id} className="relative border border-border bg-card px-3 py-3">
                                <div className="flex items-center gap-2">
                                    {status === "completed" ? (
                                        <Check className="size-4 shrink-0 text-emerald-600" />
                                    ) : status === "active" ? (
                                        <span className="size-2.5 shrink-0 rounded-full bg-blue-500" />
                                    ) : (
                                        <Circle className="size-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="min-w-0 truncate text-sm font-medium">{stage.label}</span>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{status === "completed" ? "已完成" : status === "active" ? "当前阶段" : "待开始"}</p>
                                {index < DRAMA_WORKFLOW_LAB_STAGES.length - 1 ? <span className="absolute -right-1.5 top-6 hidden size-3 rotate-45 border-r border-t border-border bg-background md:block" /> : null}
                            </div>
                        );
                    })}
                </section>

                <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
                    <div className="border-y border-border">
                        <div className="flex items-center justify-between gap-3 border-b border-border py-3">
                            <h2 className="text-base font-semibold">阶段数据</h2>
                            <Tag>{DRAMA_WORKFLOW_LAB_STAGES.find((stage) => stage.id === progress.activeStageId)?.label}</Tag>
                        </div>
                        <div className="divide-y divide-border">
                            <DataRow label="剧本" value={`${project.episodes.length} 集`} detail={project.episodes.some((episode) => episode.script.trim()) ? "已导入内容" : "等待剧本"} />
                            <DataRow label="角色" value={`${project.characters.length}`} detail="可用于资产准备" />
                            <DataRow label="场景" value={`${project.scenes.length}`} detail="可用于资产准备" />
                            <DataRow label="道具" value={`${project.props.length}`} detail="可用于资产准备" />
                            <DataRow label="分镜" value={`${project.episodes.reduce((total, episode) => total + episode.shots.length, 0)}`} detail="来自现有项目数据" />
                        </div>
                    </div>
                    <aside className="border border-border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <FlaskConical className="size-4" /> 实验边界
                        </div>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                            <li>只读读取现有项目</li>
                            <li>不创建生成任务</li>
                            <li>不修改旧短剧数据</li>
                            <li>后续阶段独立接入模型路由</li>
                        </ul>
                    </aside>
                </section>
            </div>
        </main>
    );
}

function DataRow({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-medium">{label}</span>
            <span className="flex items-center gap-3 text-right">
                <span className="text-sm">{value}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{detail}</span>
            </span>
        </div>
    );
}
