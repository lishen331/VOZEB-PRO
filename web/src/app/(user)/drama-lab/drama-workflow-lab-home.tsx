"use client";

import { Alert, Button, Spin, Tag } from "antd";
import { ArrowRight, Check, FlaskConical, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DRAMA_WORKFLOW_LAB_STAGES } from "@/lib/drama-workflow-lab";
import type { DramaProjectSummary } from "@/lib/drama-project-contract";

type ProjectListResponse = {
    code: number;
    data?: { projects?: DramaProjectSummary[]; total?: number };
    msg?: string;
};

export function DramaWorkflowLabHome() {
    const [projects, setProjects] = useState<DramaProjectSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();

    const loadProjects = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const response = await fetch("/api/drama/projects?page=1&pageSize=24", { cache: "no-store" });
            const payload = (await response.json()) as ProjectListResponse;
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "项目加载失败");
            setProjects(payload.data?.projects || []);
            setTotal(payload.data?.total || 0);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "项目加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    return (
        <main className="h-full overflow-y-auto bg-background text-foreground">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FlaskConical className="size-4" />
                            隔离实验入口
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight">短剧工作流实验室</h1>
                        <p className="mt-1 text-sm text-muted-foreground">只读验证新流程，不影响现有短剧项目。</p>
                    </div>
                    <Button icon={<RefreshCcw className="size-4" />} onClick={() => void loadProjects()} loading={loading}>
                        刷新项目
                    </Button>
                </header>

                <section aria-label="短剧工作流阶段" className="mt-6 grid gap-2 md:grid-cols-6">
                    {DRAMA_WORKFLOW_LAB_STAGES.map((stage, index) => (
                        <div key={stage.id} className="relative border border-border bg-card px-3 py-3">
                            <div className="flex items-center gap-2">
                                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                                <span className="min-w-0 truncate text-sm font-medium">{stage.label}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{stage.description}</p>
                            {index < DRAMA_WORKFLOW_LAB_STAGES.length - 1 ? <ArrowRight className="absolute -right-2.5 top-6 z-10 hidden size-4 bg-background text-muted-foreground md:block" /> : null}
                        </div>
                    ))}
                </section>

                <section className="mt-8" aria-labelledby="drama-lab-projects-heading">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 id="drama-lab-projects-heading" className="text-lg font-semibold">
                                选择实验项目
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">共 {total} 个项目</p>
                        </div>
                        <Tag color="blue">实验分支</Tag>
                    </div>

                    {error ? (
                        <Alert
                            className="mt-4"
                            type="error"
                            showIcon
                            message={error}
                            action={
                                <Button size="small" onClick={() => void loadProjects()}>
                                    重试
                                </Button>
                            }
                        />
                    ) : null}
                    {loading ? (
                        <div className="grid min-h-44 place-items-center">
                            <Spin />
                        </div>
                    ) : projects.length ? (
                        <div className="mt-4 divide-y divide-border border-y border-border">
                            {projects.map((project) => (
                                <Link key={project.id} href={`/drama-lab/${project.id}`} className="group flex min-w-0 items-center gap-4 px-1 py-4 transition hover:bg-muted/40 sm:px-3">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-foreground text-background">
                                        <FlaskConical className="size-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold">{project.title}</span>
                                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                                            {project.episodeCount} 集 · {project.characterCount} 角色 · {project.sceneCount} 场景 · {project.shotCount} 分镜
                                        </span>
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
                                        {project.pendingTaskCount ? <Tag color="processing">处理中 {project.pendingTaskCount}</Tag> : null}
                                        {project.failedTaskCount ? <Tag color="error">失败 {project.failedTaskCount}</Tag> : null}
                                    </span>
                                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4 border-y border-border py-12 text-center text-sm text-muted-foreground">暂无可用项目，请先在短剧中创建项目。</div>
                    )}
                </section>

                <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="size-3.5 text-emerald-600" />
                    旧短剧入口保持不变
                </div>
            </div>
        </main>
    );
}
