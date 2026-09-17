"use client";

import { Alert, Button, Spin, Tag, Progress, message, Input, Select, Switch } from "antd";
import { ArrowLeft, ExternalLink, Film, PanelsTopLeft, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DramaProject } from "@/lib/drama-project-contract";
import { splitDramaSource } from "@/lib/drama-source-splitter";

import { OneClickFilmShotCards } from "./one-click-film-shot-cards";

export default function OneClickFilmProject() {
    const { id } = useParams<{ id: string }>();
    const projectId = String(id || "");
    const [project, setProject] = useState<DramaProject>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [task, setTask] = useState<{ id: string; status: string; progress: number; currentStep?: string; steps: Array<{ key: string; label: string; status: string; error?: string }> }>();
    const [starting, setStarting] = useState(false);
    const [episodeTitle, setEpisodeTitle] = useState("第 1 集");
    const [episodeScript, setEpisodeScript] = useState("");
    const [savingEpisode, setSavingEpisode] = useState(false);
    const [importing, setImporting] = useState(false);
    const [activeShotId, setActiveShotId] = useState<string>();
    const [universalDraft, setUniversalDraft] = useState("");
    const [forceNoRef, setForceNoRef] = useState(false);
    const [universalBusy, setUniversalBusy] = useState<"generate" | "polish">();
    const loadProject = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
            const payload = (await response.json()) as { code?: number; data?: { project?: DramaProject }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.project) throw new Error(payload.msg || "项目加载失败");
            setProject(payload.data.project);
            setError(undefined);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "项目加载失败");
        } finally {
            setLoading(false);
        }
    }, [projectId]);
    const refreshTask = useCallback(
        async (taskId: string) => {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
            const payload = (await response.json()) as { code?: number; data?: { task?: typeof task }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.task) throw new Error(payload.msg || "任务加载失败");
            setTask(payload.data.task);
            return payload.data.task;
        },
        [projectId],
    );
    const startWorkflow = async () => {
        setStarting(true);
        try {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeId: project?.episodes[0]?.id, clientRequestId: `one-click-ui:${projectId}:${Date.now()}` }),
            });
            const payload = (await response.json()) as { code?: number; data?: { task?: typeof task }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.task) throw new Error(payload.msg || "一键成片任务创建失败");
            setTask(payload.data.task);
        } catch (startError) {
            message.error(startError instanceof Error ? startError.message : "一键成片任务创建失败");
        } finally {
            setStarting(false);
        }
    };
    const cancelWorkflow = async () => {
        if (!task) return;
        await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/cancel`, { method: "POST" });
        await refreshTask(task.id);
    };
    const retryWorkflow = async () => {
        if (!task) return;
        await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/retry`, { method: "POST" });
        await refreshTask(task.id);
    };
    useEffect(() => {
        if (!task || !["pending", "running"].includes(task.status)) return;
        const timer = window.setInterval(() => {
            void refreshTask(task.id).catch(() => undefined);
        }, 2000);
        return () => window.clearInterval(timer);
    }, [task, refreshTask]);
    useEffect(() => {
        if (projectId) void loadProject();
    }, [projectId, loadProject]);
    const importScriptFile = async (file: File) => {
        setImporting(true);
        try {
            const text = await file.text();
            const drafts = splitDramaSource(text);
            if (!drafts.length || !project) throw new Error("未识别到可导入的剧本内容");
            const now = new Date().toISOString();
            const episodes = drafts.map((draft, index) => ({
                id: `episode-${crypto.randomUUID()}`,
                episodeNumber: index + 1,
                title: draft.title,
                script: draft.script,
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: draft.sourceRange,
                reviewStatus: "draft" as const,
                shots: [],
                createdAt: now,
                updatedAt: now,
            }));
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodes, activeEpisodeId: episodes[0].id }) });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "剧本导入失败");
            setProject(payload.data.project);
            setEpisodeTitle(episodes[0].title);
            setEpisodeScript(episodes[0].script);
            message.success(`已导入 ${episodes.length} 集`);
        } catch (importError) {
            message.error(importError instanceof Error ? importError.message : "剧本导入失败");
        } finally {
            setImporting(false);
        }
    };
    const saveEpisode = async () => {
        if (!project || !episodeScript.trim()) return message.warning("请输入本集剧本");
        setSavingEpisode(true);
        try {
            const current = project.episodes[0];
            const episode = current
                ? { ...current, title: episodeTitle.trim() || current.title, script: episodeScript.trim() }
                : { id: `episode-${crypto.randomUUID()}`, episodeNumber: 1, title: episodeTitle.trim() || "第 1 集", script: episodeScript.trim(), outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] };
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodes: [episode, ...project.episodes.slice(1)], activeEpisodeId: episode.id }),
            });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "剧本保存失败");
            setProject(payload.data.project);
            message.success("剧本已保存");
        } catch (saveError) {
            message.error(saveError instanceof Error ? saveError.message : "剧本保存失败");
        } finally {
            setSavingEpisode(false);
        }
    };
    const activeShot = project?.episodes[0]?.shots.find((shot) => shot.id === activeShotId);
    const runUniversalPrompt = async (mode: "generate" | "polish") => {
        if (!project || !activeShot) return message.warning("请先选择一个分镜");
        if (mode === "polish" && !universalDraft.trim()) return message.warning("请先生成或填写全能片段描述后再润色");
        setUniversalBusy(mode);
        try {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(activeShot.id)}/universal-prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode, duration: activeShot.duration, draft: universalDraft, forceWithoutReferenceImages: forceNoRef }),
            });
            const payload = (await response.json()) as { code?: number; data?: { universalSegmentText?: string }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.universalSegmentText) throw new Error(payload.msg || "全能提示词生成失败");
            setUniversalDraft(payload.data.universalSegmentText);
            await loadProject();
            message.success(mode === "polish" ? "已润色全能片段描述" : "已生成全能片段描述");
        } catch (promptError) {
            message.error(promptError instanceof Error ? promptError.message : "全能提示词生成失败");
        } finally {
            setUniversalBusy(undefined);
        }
    };
    if (loading)
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    if (error || !project)
        return (
            <main className="p-8">
                <Alert type="error" message={error || "项目不存在"} action={<Button onClick={() => void loadProject()}>重新加载</Button>} />
            </main>
        );
    const episodeId = project.episodes[0]?.id;
    const canvasHref = episodeId ? `/one-click-film/${encodeURIComponent(projectId)}/canvas?episode=${encodeURIComponent(episodeId)}` : undefined;
    return (
        <main className="h-full overflow-y-auto bg-background text-foreground">
            <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
                    <div>
                        <Link href="/one-click-film" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                            <ArrowLeft className="size-4" />
                            返回项目列表
                        </Link>
                        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <Film className="size-4" />
                            一键成片 · 独立工作区
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold">{project.title}</h1>
                    </div>
                    <div className="flex gap-2">
                        <Button icon={<RefreshCcw className="size-4" />} onClick={() => void loadProject()}>
                            刷新
                        </Button>
                        {canvasHref ? (
                            <Button icon={<PanelsTopLeft className="size-4" />} href={canvasHref}>
                                打开平台画布
                            </Button>
                        ) : null}
                    </div>
                </div>
                <section className="mt-6 rounded-lg border border-border bg-card p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">本集剧本</h2>
                        <label className="cursor-pointer rounded border px-3 py-1.5 text-sm">
                            {importing ? "导入中…" : "导入 TXT / MD"}
                            <input
                                className="hidden"
                                type="file"
                                accept=".txt,.md,text/plain,text/markdown"
                                disabled={importing}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) void importScriptFile(file);
                                }}
                            />
                        </label>
                    </div>
                    <div className="mt-3 grid gap-3">
                        <Input value={episodeTitle} onChange={(event) => setEpisodeTitle(event.target.value)} placeholder="分集标题" />
                        <Input.TextArea value={episodeScript} onChange={(event) => setEpisodeScript(event.target.value)} rows={10} placeholder="粘贴或输入本集完整剧本" />
                        <div>
                            <Button type="primary" loading={savingEpisode} onClick={() => void saveEpisode()}>
                                保存本集剧本
                            </Button>
                        </div>
                    </div>
                </section>
                <section className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
                    <aside className="rounded-lg border border-border bg-card p-4">
                        <h2 className="font-semibold">生产流程</h2>
                        <ol className="mt-4 grid gap-3 text-sm text-muted-foreground">
                            {["剧本", "资产准备", "故事板", "分镜图/视频", "配音", "审核与导出"].map((item, index) => (
                                <li key={item} className="flex items-center gap-2">
                                    <span className="grid size-6 place-items-center rounded-full bg-muted text-xs">{index + 1}</span>
                                    {item}
                                </li>
                            ))}
                        </ol>
                    </aside>
                    <section className="rounded-lg border border-border bg-card p-6">
                        <h2 className="text-lg font-semibold">项目数据</h2>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <Tag>{project.episodes.length} 集</Tag>
                            <Tag>{project.episodes.reduce((sum, episode) => sum + episode.shots.length, 0)} 分镜</Tag>
                            <Tag>{project.ratio}</Tag>
                        </div>
                        <p className="mt-6 text-sm text-muted-foreground">独立工作区已加载真实项目数据，故事板将按 L 的完整生产逻辑承载。</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            {!task || task.status === "success" ? (
                                <Button type="primary" loading={starting} onClick={() => void startWorkflow()}>
                                    启动一键成片
                                </Button>
                            ) : null}
                            {task && ["pending", "running"].includes(task.status) ? (
                                <Button danger onClick={() => void cancelWorkflow()}>
                                    取消任务
                                </Button>
                            ) : null}
                            {task && ["error", "cancelled"].includes(task.status) ? <Button onClick={() => void retryWorkflow()}>重试</Button> : null}
                        </div>
                        {task ? (
                            <div className="mt-5 rounded-lg border p-4">
                                <div className="flex items-center justify-between">
                                    <b>生产任务：{task.status}</b>
                                    <span className="text-sm text-stone-500">{task.currentStep || "等待启动"}</span>
                                </div>
                                <Progress percent={task.progress} status={task.status === "error" ? "exception" : task.status === "success" ? "success" : "active"} />
                                <ol className="mt-3 grid gap-2 text-sm">
                                    {task.steps.map((step) => (
                                        <li key={step.key} className="flex items-center justify-between">
                                            <span>{step.label}</span>
                                            <Tag color={step.status === "success" ? "success" : step.status === "error" ? "error" : step.status === "running" ? "processing" : "default"}>{step.status}</Tag>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        ) : null}
                        {project.episodes[0] ? <OneClickFilmShotCards projectId={projectId} episode={project.episodes[0]} onProjectChange={setProject} /> : null}
                        {project.episodes[0]?.shots.length ? (
                            <div className="mt-5 rounded-lg border p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <b>全能片段描述（L 全能分镜提示词）</b>
                                    <Select
                                        size="small"
                                        style={{ minWidth: 220 }}
                                        placeholder="选择分镜"
                                        value={activeShotId}
                                        onChange={(value) => {
                                            setActiveShotId(value);
                                            const shot = project.episodes[0]?.shots.find((item) => item.id === value);
                                            setUniversalDraft(shot?.universalSegmentText || "");
                                        }}
                                        options={project.episodes[0]?.shots.map((shot, index) => ({ value: shot.id, label: `分镜 ${index + 1} · ${shot.title || "未命名"}` }))}
                                    />
                                </div>
                                <Input.TextArea className="mt-3" rows={6} value={universalDraft} onChange={(event) => setUniversalDraft(event.target.value)} placeholder="点击生成，或手动填写后再润色" />
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <Button loading={universalBusy === "generate"} disabled={!activeShot} onClick={() => void runUniversalPrompt("generate")}>
                                        生成全能提示词
                                    </Button>
                                    <Button loading={universalBusy === "polish"} disabled={!activeShot || !universalDraft.trim()} onClick={() => void runUniversalPrompt("polish")}>
                                        润色
                                    </Button>
                                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Switch size="small" checked={forceNoRef} onChange={setForceNoRef} />
                                        无参考图仍强制生成
                                    </label>
                                </div>
                            </div>
                        ) : null}
                        {episodeId ? (
                            <Button className="mt-5" type="primary" icon={<ExternalLink className="size-4" />} href={canvasHref}>
                                打开本集画布
                            </Button>
                        ) : (
                            <p className="mt-5 text-sm text-muted-foreground">当前项目还没有分集，请先添加分集。</p>
                        )}
                    </section>
                </section>
            </div>
        </main>
    );
}
