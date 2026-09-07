"use client";

import { Alert, App, Button, Input, Modal, Select, Spin, Tag } from "antd";
import { ArrowRight, Clapperboard, Download, FlaskConical, Pencil, Plus, RefreshCcw, Trash2, Upload, UserRound, Image as ImageIcon, Box } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DRAMA_WORKFLOW_LAB_STAGES } from "@/lib/drama-workflow-lab";
import type { DramaLibraryAssetType } from "@/lib/drama-lab-library-assets";
import type { DramaProjectSummary } from "@/lib/drama-project-contract";

import { DramaLabMaterialLibraryModal } from "./drama-lab-material-library-modal";

type ProjectListResponse = { code: number; data?: { projects?: DramaProjectSummary[]; total?: number }; msg?: string };
type ProjectCreateResponse = { code: number; data?: { project?: { id: string } }; msg?: string };

const DEFAULT_STYLE = "电影感国漫";

export function DramaWorkflowLabHome() {
    const { message, modal } = App.useApp();
    const [projects, setProjects] = useState<DramaProjectSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [summary, setSummary] = useState("");
    const [ratio, setRatio] = useState("16:9");
    const [importing, setImporting] = useState(false);
    const [exportingId, setExportingId] = useState<string>();
    const [editingProject, setEditingProject] = useState<DramaProjectSummary>();
    const [editTitle, setEditTitle] = useState("");
    const [editSummary, setEditSummary] = useState("");
    const [editing, setEditing] = useState(false);
    const [deletingId, setDeletingId] = useState<string>();
    const importInputRef = useRef<HTMLInputElement>(null);

    const [materialLibraryType, setMaterialLibraryType] = useState<DramaLibraryAssetType>();

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

    const importProject = async (file: File) => {
        setImporting(true);
        try {
            const response = await fetch("/api/drama-lab/projects/import", {
                method: "POST",
                headers: { "Content-Type": "application/zip", "X-Archive-Filename": encodeURIComponent(file.name) },
                body: file,
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: { project?: { id?: string } }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.project?.id) throw new Error(payload.msg || "短剧项目导入失败");
            message.success("短剧项目导入成功");
            window.location.assign(`/drama-lab/${encodeURIComponent(payload.data.project.id)}`);
        } catch (importError) {
            message.error(importError instanceof Error ? importError.message : "短剧项目导入失败");
        } finally {
            setImporting(false);
            if (importInputRef.current) importInputRef.current.value = "";
        }
    };

    const exportProject = async (project: DramaProjectSummary) => {
        setExportingId(project.id);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/export`, { cache: "no-store" });
            if (!response.ok) {
                const payload = (await response.json().catch(() => ({}))) as { msg?: string };
                throw new Error(payload.msg || "短剧项目导出失败");
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = decodeURIComponent(response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1] || `${project.title}-短剧实验室.zip`);
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            message.success("短剧项目已导出");
        } catch (exportError) {
            message.error(exportError instanceof Error ? exportError.message : "短剧项目导出失败");
        } finally {
            setExportingId(undefined);
        }
    };

    const openProjectEditor = (project: DramaProjectSummary) => {
        setEditingProject(project);
        setEditTitle(project.title);
        setEditSummary(project.summary || "");
    };

    const saveProjectSummary = async () => {
        if (!editingProject || !editTitle.trim()) return message.warning("请输入项目标题");
        setEditing(true);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(editingProject.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: editTitle.trim(), summary: editSummary.trim() }),
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string };
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "项目保存失败");
            message.success("项目已保存");
            setEditingProject(undefined);
            await loadProjects();
        } catch (saveError) {
            message.error(saveError instanceof Error ? saveError.message : "项目保存失败");
        } finally {
            setEditing(false);
        }
    };

    const deleteProject = (project: DramaProjectSummary) => {
        modal.confirm({
            title: "删除确认",
            content: `确定要删除项目「${project.title.slice(0, 20) || "未命名项目"}」吗？此操作不可恢复。`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                setDeletingId(project.id);
                try {
                    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
                    const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string };
                    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "项目删除失败");
                    message.success("项目已删除");
                    await loadProjects();
                } catch (deleteError) {
                    message.error(deleteError instanceof Error ? deleteError.message : "项目删除失败");
                    throw deleteError;
                } finally {
                    setDeletingId(undefined);
                }
            },
        });
    };

    const resetCreateForm = () => {
        setTitle("");
        setSummary("");
        setRatio("16:9");
    };

    const createProject = async () => {
        if (!title.trim()) {
            message.warning("请输入项目标题");
            return;
        }
        setCreating(true);
        try {
            const response = await fetch("/api/drama-lab/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), summary: summary.trim(), style: DEFAULT_STYLE, ratio }),
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
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".zip,application/zip,application/x-zip-compressed"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void importProject(file);
                            }}
                        />
                        <Button icon={<UserRound className="size-4" />} onClick={() => setMaterialLibraryType("character")} className="hidden sm:inline-flex">
                            素材角色
                        </Button>
                        <Button icon={<ImageIcon className="size-4" />} onClick={() => setMaterialLibraryType("scene")} className="hidden sm:inline-flex">
                            素材场景
                        </Button>
                        <Button icon={<Box className="size-4" />} onClick={() => setMaterialLibraryType("prop")} className="hidden sm:inline-flex">
                            素材道具
                        </Button>
                        <Button icon={<Upload className="size-4" />} loading={importing} onClick={() => importInputRef.current?.click()}>
                            导入项目
                        </Button>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建项目
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
                        <Button icon={<RefreshCcw className="size-4" />} onClick={() => void loadProjects()} loading={loading}>
                            刷新项目
                        </Button>
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
                                        <div className="flex items-center gap-1">
                                            <Button type="text" size="small" icon={<Download className="size-4" />} aria-label="导出项目" title="导出项目" loading={exportingId === project.id} onClick={() => void exportProject(project)} />
                                            <Button type="text" size="small" icon={<Pencil className="size-4" />} aria-label="编辑项目" title="编辑项目" onClick={() => openProjectEditor(project)} />
                                            <Button type="text" danger size="small" icon={<Trash2 className="size-4" />} aria-label="删除项目" title="删除项目" loading={deletingId === project.id} onClick={() => deleteProject(project)} />
                                        </div>
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
                title="新建项目"
                open={createOpen}
                width={480}
                destroyOnHidden
                confirmLoading={creating}
                onCancel={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                }}
                onOk={() => void createProject()}
                okText="确定"
                cancelText="取消"
            >
                <div className="grid gap-4 pt-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                        <span>
                            <span className="mr-1 text-red-500">*</span>标题
                        </span>
                        <Input value={title} maxLength={100} showCount onChange={(event) => setTitle(event.target.value)} placeholder="输入项目标题" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        描述
                        <Input.TextArea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} placeholder="输入项目描述（选填）" />
                    </label>
                    <div className="grid gap-1.5 text-sm font-medium">
                        <span>画面比例</span>
                        <Select
                            className="w-full"
                            value={ratio}
                            options={[
                                { label: "16:9 横屏（默认）", value: "16:9" },
                                { label: "9:16 竖屏（短视频）", value: "9:16" },
                                { label: "3:4 竖版", value: "3:4" },
                                { label: "1:1 方形", value: "1:1" },
                                { label: "4:3 传统横屏", value: "4:3" },
                                { label: "21:9 宽银幕", value: "21:9" },
                            ]}
                            onChange={setRatio}
                        />
                        <p className="text-xs font-normal text-muted-foreground">影响分镜图和视频的生成比例，短视频选 9:16</p>
                    </div>
                </div>
            </Modal>

            <Modal title="编辑项目" open={Boolean(editingProject)} onCancel={() => setEditingProject(undefined)} onOk={() => void saveProjectSummary()} okText="保存" cancelText="取消" confirmLoading={editing} width={480} destroyOnHidden>
                <div className="grid gap-4 pt-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                        <span>
                            <span className="mr-1 text-red-500">*</span>标题
                        </span>
                        <Input value={editTitle} maxLength={100} showCount onChange={(event) => setEditTitle(event.target.value)} placeholder="输入项目标题" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        描述
                        <Input.TextArea value={editSummary} onChange={(event) => setEditSummary(event.target.value)} rows={3} placeholder="输入项目描述（选填）" />
                    </label>
                </div>
            </Modal>

            {materialLibraryType ? <DramaLabMaterialLibraryModal open type={materialLibraryType} onClose={() => setMaterialLibraryType(undefined)} /> : null}
        </main>
    );
}
