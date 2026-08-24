"use client";

import { Alert, App, Button, Input, InputNumber, Modal, Segmented, Spin, Tag } from "antd";
import { ArrowRight, Clapperboard, FlaskConical, Pencil, Plus, RefreshCcw, UserRound, Image as ImageIcon, Box } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DRAMA_WORKFLOW_LAB_STAGES } from "@/lib/drama-workflow-lab";
import type { DramaProjectSummary } from "@/lib/drama-project-contract";

type ProjectListResponse = { code: number; data?: { projects?: DramaProjectSummary[]; total?: number }; msg?: string };
type ProjectCreateResponse = { code: number; data?: { project?: { id: string } }; msg?: string };

const DEFAULT_STYLE = "电影感国漫";

export function DramaWorkflowLabHome() {
    const { message } = App.useApp();
    const [projects, setProjects] = useState<DramaProjectSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [summary, setSummary] = useState("");
    const [style, setStyle] = useState(DEFAULT_STYLE);
    const [ratio, setRatio] = useState("9:16");
    const [customWidth, setCustomWidth] = useState(1080);
    const [customHeight, setCustomHeight] = useState(1920);

    // 素材库弹窗状态
    const [characterLibraryOpen, setCharacterLibraryOpen] = useState(false);
    const [sceneLibraryOpen, setSceneLibraryOpen] = useState(false);
    const [propLibraryOpen, setPropLibraryOpen] = useState(false);

    const loadProjects = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const response = await fetch("/api/drama-lab/projects?page=1&pageSize=24", { cache: "no-store" });
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

    const resetCreateForm = () => {
        setTitle("");
        setSummary("");
        setStyle(DEFAULT_STYLE);
        setRatio("9:16");
        setCustomWidth(1080);
        setCustomHeight(1920);
    };

    const createProject = async () => {
        if (!title.trim()) {
            message.warning("请输入短剧项目名称");
            return;
        }
        setCreating(true);
        try {
            const response = await fetch("/api/drama-lab/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), summary: summary.trim(), style: style.trim() || DEFAULT_STYLE, ratio }),
            });
            const payload = (await response.json()) as ProjectCreateResponse;
            if (!response.ok || payload.code !== 0 || !payload.data?.project?.id) throw new Error(payload.msg || "短剧项目创建失败");
            window.location.assign(`/drama-lab/${encodeURIComponent(payload.data.project.id)}`);
        } catch (createError) {
            message.error(createError instanceof Error ? createError.message : "短剧项目创建失败");
        } finally {
            setCreating(false);
        }
    };

    return (
        <main className="h-full overflow-y-auto bg-background text-foreground">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FlaskConical className="size-4" />
                            独立创作工作区
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight">短剧项目</h1>
                        <p className="mt-1 text-sm text-muted-foreground">先创建短剧项目，再进入剧本、分集、资产和镜头制作。</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button icon={<UserRound className="size-4" />} onClick={() => setCharacterLibraryOpen(true)} className="hidden sm:inline-flex">
                            素材角色
                        </Button>
                        <Button icon={<ImageIcon className="size-4" />} onClick={() => setSceneLibraryOpen(true)} className="hidden sm:inline-flex">
                            素材场景
                        </Button>
                        <Button icon={<Box className="size-4" />} onClick={() => setPropLibraryOpen(true)} className="hidden sm:inline-flex">
                            素材道具
                        </Button>
                        <Button icon={<RefreshCcw className="size-4" />} onClick={() => void loadProjects()} loading={loading}>
                            刷新项目
                        </Button>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建短剧
                        </Button>
                    </div>
                </header>

                <section aria-label="短剧制作阶段" className="mt-6 grid gap-2 md:grid-cols-6">
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
                                我的短剧项目
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">共 {total} 个项目</p>
                        </div>
                        <Tag color="blue">LocalMiniDrama 适配分支</Tag>
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
                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {projects.map((project) => (
                                <article key={project.id} className="group border border-border bg-card p-5 transition hover:border-primary/60 hover:shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <Link href={`/drama-lab/${encodeURIComponent(project.id)}`} className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Clapperboard className="size-4" />
                                                短剧项目
                                            </div>
                                            <h3 className="mt-3 truncate text-lg font-semibold">{project.title}</h3>
                                            <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{project.summary || "暂无项目简介"}</p>
                                        </Link>
                                        <Button type="text" size="small" icon={<Pencil className="size-4" />} aria-label="编辑项目" />
                                    </div>
                                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <Tag>{project.episodeCount} 集</Tag>
                                        <Tag>{project.shotCount} 分镜</Tag>
                                        <Tag>{project.ratio}</Tag>
                                        <Tag>{project.style || DEFAULT_STYLE}</Tag>
                                    </div>
                                    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                                        <span className="text-xs text-muted-foreground">更新于 {new Date(project.updatedAt).toLocaleDateString("zh-CN")}</span>
                                        <Link href={`/drama-lab/${encodeURIComponent(project.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                                            进入制作 <ArrowRight className="size-4" />
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4 border-y border-border py-14 text-center">
                            <Clapperboard className="mx-auto size-8 text-muted-foreground" />
                            <p className="mt-3 text-sm text-muted-foreground">还没有短剧项目，先创建一个项目开始制作。</p>
                            <Button className="mt-4" type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                                新建第一个短剧
                            </Button>
                        </div>
                    )}
                </section>
            </div>

            <Modal
                title="新建短剧项目"
                open={createOpen}
                width={560}
                destroyOnHidden
                confirmLoading={creating}
                onCancel={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                }}
                onOk={() => void createProject()}
                okText="创建并进入制作"
                cancelText="取消"
            >
                <div className="grid gap-4 pt-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                        项目名称
                        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：月影长安" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        故事简介
                        <Input.TextArea value={summary} onChange={(event) => setSummary(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} placeholder="一句话说明人物、冲突和目标" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        统一视觉风格
                        <Input value={style} onChange={(event) => setStyle(event.target.value)} />
                    </label>
                    <div className="grid gap-1.5 text-sm font-medium">
                        <span>画面比例</span>
                        <Segmented
                            block
                            value={ratio.includes("x") ? "custom" : ratio}
                            options={[
                                { label: "9:16", value: "9:16" },
                                { label: "16:9", value: "16:9" },
                                { label: "自定义", value: "custom" },
                            ]}
                            onChange={(value) => setRatio(value === "custom" ? `${customWidth}x${customHeight}` : String(value))}
                        />
                        {ratio.includes("x") ? (
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <InputNumber
                                    className="w-full"
                                    min={256}
                                    value={customWidth}
                                    onChange={(value) => {
                                        const width = Number(value) || 256;
                                        setCustomWidth(width);
                                        setRatio(`${width}x${customHeight}`);
                                    }}
                                />
                                <span>×</span>
                                <InputNumber
                                    className="w-full"
                                    min={256}
                                    value={customHeight}
                                    onChange={(value) => {
                                        const height = Number(value) || 256;
                                        setCustomHeight(height);
                                        setRatio(`${customWidth}x${height}`);
                                    }}
                                />
                            </div>
                        ) : null}
                    </div>
                </div>
            </Modal>

            {/* 素材库弹窗 */}
            <Modal title="素材角色库" open={characterLibraryOpen} onCancel={() => setCharacterLibraryOpen(false)} footer={null} width={1000}>
                <div className="py-4 text-center text-gray-500">
                    角色库功能开发中...
                    <p className="mt-2 text-sm">将显示公共角色素材，可以选择并添加到项目中</p>
                </div>
            </Modal>

            <Modal title="素材场景库" open={sceneLibraryOpen} onCancel={() => setSceneLibraryOpen(false)} footer={null} width={1000}>
                <div className="py-4 text-center text-gray-500">
                    场景库功能开发中...
                    <p className="mt-2 text-sm">将显示公共场景素材，可以选择并添加到项目中</p>
                </div>
            </Modal>

            <Modal title="素材道具库" open={propLibraryOpen} onCancel={() => setPropLibraryOpen(false)} footer={null} width={1000}>
                <div className="py-4 text-center text-gray-500">
                    道具库功能开发中...
                    <p className="mt-2 text-sm">将显示公共道具素材，可以选择并添加到项目中</p>
                </div>
            </Modal>
        </main>
    );
}
