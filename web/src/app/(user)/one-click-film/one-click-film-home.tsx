"use client";

import { App, Button, Input, Modal, Select, Spin, Tag } from "antd";
import { ArrowRight, Film, Plus, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DramaProjectSummary } from "@/lib/drama-project-contract";

type ProjectListResponse = { code: number; data?: { projects?: DramaProjectSummary[]; total?: number }; msg?: string };

export default function OneClickFilmHome() {
    const { message } = App.useApp();
    const router = useRouter();
    const [projects, setProjects] = useState<DramaProjectSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [summary, setSummary] = useState("");
    const [ratio, setRatio] = useState("16:9");

    const loadProjects = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const response = await fetch("/api/one-click-film/projects", { cache: "no-store" });
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

    async function createProject() {
        if (!title.trim()) return message.warning("请输入项目标题");
        setCreating(true);
        try {
            const response = await fetch("/api/one-click-film/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), summary: summary.trim(), ratio, style: "电影感国漫" }),
            });
            const payload = (await response.json()) as { code?: number; data?: { project?: { id?: string } }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.project?.id) throw new Error(payload.msg || "项目创建失败");
            router.push(`/one-click-film/${encodeURIComponent(payload.data.project.id)}`);
        } catch (createError) {
            message.error(createError instanceof Error ? createError.message : "项目创建失败");
        } finally {
            setCreating(false);
        }
    }

    return (
        <main className="h-full overflow-y-auto bg-background text-foreground">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Film className="size-4" />
                            商单生产工作区
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold">一键成片</h1>
                        <p className="mt-1 text-sm text-muted-foreground">完整短剧一键成片生产项目。</p>
                    </div>
                    <div className="flex gap-2">
                        <Button icon={<RefreshCcw className="size-4" />} onClick={() => void loadProjects()}>
                            刷新项目
                        </Button>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建项目
                        </Button>
                    </div>
                </header>
                <section className="mt-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">我的一键成片项目</h2>
                        <span className="text-sm text-muted-foreground">共 {total} 个项目</span>
                    </div>
                    {loading ? (
                        <div className="flex min-h-48 items-center justify-center">
                            <Spin />
                        </div>
                    ) : error ? (
                        <div className="py-12 text-center text-sm text-destructive">
                            {error}
                            <br />
                            <Button className="mt-3" onClick={() => void loadProjects()}>
                                重新加载
                            </Button>
                        </div>
                    ) : projects.length ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {projects.map((project) => (
                                <article key={project.id} className="rounded-lg border border-border bg-card p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs text-muted-foreground">商单项目</div>
                                            <h3 className="mt-2 text-lg font-semibold">{project.title}</h3>
                                        </div>
                                        <Tag>{project.episodeCount} 集</Tag>
                                    </div>
                                    <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{project.summary || "暂无项目简介"}</p>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <Tag>{project.shotCount} 分镜</Tag>
                                        <Tag>{project.ratio}</Tag>
                                        <Tag>{project.style || "电影感国漫"}</Tag>
                                    </div>
                                    <div className="mt-5 border-t border-border pt-4">
                                        <Link href={`/one-click-film/${encodeURIComponent(project.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                                            进入制作
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4 border-y border-border py-14 text-center text-sm text-muted-foreground">还没有一键成片项目，先新建一个项目开始制作。</div>
                    )}
                </section>
            </div>
            <Modal title="新建一键成片项目" open={createOpen} confirmLoading={creating} destroyOnHidden onCancel={() => setCreateOpen(false)} onOk={() => void createProject()} okText="创建" cancelText="取消">
                <div className="grid gap-4 pt-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                        标题
                        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入商单项目标题" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        简介
                        <Input.TextArea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        画面比例
                        <Select
                            className="w-full"
                            value={ratio}
                            onChange={setRatio}
                            options={[
                                { label: "16:9 横屏", value: "16:9" },
                                { label: "9:16 竖屏", value: "9:16" },
                                { label: "1:1 方形", value: "1:1" },
                            ]}
                        />
                    </label>
                </div>
            </Modal>
        </main>
    );
}
