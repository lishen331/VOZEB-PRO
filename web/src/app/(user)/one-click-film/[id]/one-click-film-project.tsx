"use client";

import { Alert, Button, Modal, Popconfirm, Select, Spin, Switch, Tag, Tooltip, Progress, message, Input } from "antd";
import { ArrowLeft, Clapperboard, Download, ExternalLink, Film, PanelsTopLeft, RefreshCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DramaProject } from "@/lib/drama-project-contract";
import { splitDramaSource } from "@/lib/drama-source-splitter";
import { decodeOneClickRouteId } from "@/lib/one-click/route-id";

import { OneClickFilmAssetPanel } from "./one-click-film-asset-panel";
import { OneClickFilmShotCards } from "./one-click-film-shot-cards";
import { OneClickFilmNavSidebar, type OneClickActiveTask } from "./one-click-film-nav-sidebar";

export default function OneClickFilmProject() {
    const { id } = useParams<{ id: string }>();
    // useParams 返回未解码的路径段，一键成片的 id 含冒号（%3A），直接再编码会双重编码。
    const projectId = decodeOneClickRouteId(id);
    const [project, setProject] = useState<DramaProject>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [task, setTask] = useState<{ id: string; status: string; progress: number; currentStep?: string; paused?: boolean; steps: Array<{ key: string; label: string; status: string; error?: string }> }>();
    const [starting, setStarting] = useState<"full" | "text_framework">();
    const [episodeTitle, setEpisodeTitle] = useState("第 1 集");
    const [episodeScript, setEpisodeScript] = useState("");
    const [savingEpisode, setSavingEpisode] = useState(false);
    const [importing, setImporting] = useState(false);
    /** L §1 的「从剧本库导入」弹窗：列出本人其他一键成片项目的分集剧本。 */
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryProjects, setLibraryProjects] = useState<Array<{ id: string; title: string; episodes: Array<{ id: string; episodeNumber: number; title: string; script: string }> }>>([]);
    const [librarySelection, setLibrarySelection] = useState<string>();
    const [renderRecordBusy, setRenderRecordBusy] = useState(false);
    const [exportingStoryboard, setExportingStoryboard] = useState<"xlsx" | "srt">();
    // 侧栏「角色/道具/场景」三步要能切到对应页签，故把资产类别提到页面层。
    const [assetKind, setAssetKind] = useState<"characters" | "scenes" | "props">("characters");
    const [renderTask, setRenderTask] = useState<{ id: string; status: string; error?: string; result?: { artifactId: string; url: string } }>();
    const [renderBusy, setRenderBusy] = useState(false);
    /**
     * §6 成片配置。这三项现在会真正进 ffmpeg 参数（缩放 / 烧字幕 / 水印），
     * 默认值保持"不处理"，此时成片仍是直接拼流不转码。
     */
    const [renderResolution, setRenderResolution] = useState<"source" | "720p" | "1080p" | "1440p" | "2160p">("source");
    const [renderBurnSubtitles, setRenderBurnSubtitles] = useState(false);
    const [renderWatermark, setRenderWatermark] = useState("");
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
    /**
     * 启动工作流。L §2 有两个入口：
     * - `full`：一键成片带图片视频（`startOneClickPipeline`）
     * - `text_framework`：生成文本框架（`startTextFrameworkPipeline`，仅提取资产与分镜文本）
     *
     * 模式经 options 传给服务端，由引擎把媒体步骤标为 skipped —— 不是前端假装跳过。
     */
    const startWorkflow = async (mode: "full" | "text_framework" = "full") => {
        setStarting(mode);
        try {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeId: project?.episodes[0]?.id,
                    clientRequestId: `one-click-ui:${mode}:${projectId}:${Date.now()}`,
                    ...(mode === "text_framework" ? { options: { mode: "text_framework" } } : {}),
                }),
            });
            const payload = (await response.json()) as { code?: number; data?: { task?: typeof task }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.task) throw new Error(payload.msg || "一键成片任务创建失败");
            setTask(payload.data.task);
        } catch (startError) {
            message.error(startError instanceof Error ? startError.message : "一键成片任务创建失败");
        } finally {
            setStarting(undefined);
        }
    };
    const cancelWorkflow = async () => {
        if (!task) return;
        await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/cancel`, { method: "POST" });
        await refreshTask(task.id);
    };
    /**
     * 对应 L 的「暂停 / 继续」（pipelinePaused）。
     * 只挡住"启动下一步"，已提交的子任务照常跑完，不撤单也不重复扣费。
     */
    const setWorkflowPaused = async (paused: boolean) => {
        if (!task) return;
        await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/pause?action=${paused ? "pause" : "continue"}`, { method: "POST" });
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
    // 成片任务轮询。必须放在提前 return 之前，否则违反 React Hook 调用顺序规则；
    // 也不能引用下方的 episodeId（它定义在 return 之后），所以自己从 project 推导。
    const refreshRenderTask = useCallback(
        async (taskId: string) => {
            const currentEpisodeId = project?.episodes[0]?.id;
            if (!currentEpisodeId) return;
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(currentEpisodeId)}/render?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
            const payload = (await response.json()) as { code?: number; data?: typeof renderTask };
            if (response.ok && payload.code === 0 && payload.data) setRenderTask(payload.data);
        },
        [projectId, project],
    );
    useEffect(() => {
        if (!renderTask || !["pending", "running"].includes(renderTask.status)) return;
        const timer = window.setInterval(() => {
            void refreshRenderTask(renderTask.id).catch(() => undefined);
        }, 3000);
        return () => window.clearInterval(timer);
    }, [renderTask, refreshRenderTask]);
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
    /** 打开「从剧本库导入」：只读列出本人其他一键成片项目的分集剧本。 */
    const openScriptLibrary = async () => {
        setLibraryOpen(true);
        setLibraryLoading(true);
        try {
            const response = await fetch(`/api/one-click-film/script-library?excludeProjectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "剧本库读取失败");
            setLibraryProjects(payload.data.projects || []);
        } catch (libraryError) {
            message.error(libraryError instanceof Error ? libraryError.message : "剧本库读取失败");
        } finally {
            setLibraryLoading(false);
        }
    };

    /**
     * 应用剧本库里选中的那一集：只把剧本正文填进本集编辑框，不直接落库。
     * 与 L 一致 —— 用户仍需点「保存本集剧本」确认，避免误覆盖已有剧本。
     */
    const applyLibraryScript = () => {
        const [libraryProjectId, episodeId] = (librarySelection || "").split("::");
        const episode = libraryProjects.find((item) => item.id === libraryProjectId)?.episodes.find((item) => item.id === episodeId);
        if (!episode) return message.warning("请先选择要导入的剧本");
        setEpisodeScript(episode.script);
        setLibraryOpen(false);
        message.success("已填入所选剧本，确认后点「保存本集剧本」生效");
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
    // 对应 L `GET /dramas/:id/export`：打包整个项目（含媒体）用于交付。
    // 走一键成片自有的 export 路由，浏览器直接下载 zip。
    /**
     * 本集成片，对应 L `POST /episodes/:episode_id/finalize` 与 `GET .../download`。
     * 与 executor 的 compose 步共用同一套成片服务，状态由服务端持久化。
     */
    const startRender = async () => {
        if (!episodeId) return;
        setRenderBusy(true);
        try {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientRequestId: `one-click-render:${projectId}:${episodeId}:${Date.now()}`,
                    composeOptions: { resolution: renderResolution, burnSubtitles: renderBurnSubtitles, watermarkText: renderWatermark.trim() },
                }),
            });
            const payload = (await response.json()) as { code?: number; data?: typeof renderTask; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "成片任务创建失败");
            setRenderTask(payload.data);
        } catch (renderError) {
            message.error(renderError instanceof Error ? renderError.message : "成片任务创建失败");
        } finally {
            setRenderBusy(false);
        }
    };

    /**
     * 删除本集成片记录，对应 L `DELETE /video-merges/:merge_id`。
     * 纯数据清理，不影响分镜与素材。
     */
    const removeRenderRecord = async () => {
        if (!episodeId || !renderTask?.id) return;
        setRenderRecordBusy(true);
        try {
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/render/${encodeURIComponent(renderTask.id)}`, {
                method: "DELETE",
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string };
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "删除失败");
            setRenderTask(undefined);
            message.success("删除成功");
        } catch (deleteError) {
            message.error(deleteError instanceof Error ? deleteError.message : "删除失败");
        } finally {
            setRenderRecordBusy(false);
        }
    };

    /**
     * L 侧栏点击步骤后滚动到对应 section。
     *
     * 角色/道具/场景在 L 是三个独立子卡，V 是单面板 + Segmented，
     * 所以这三个锚点先切页签再滚到资产区，避免跳到不存在的 DOM。
     */
    const ASSET_ANCHORS: Record<string, "characters" | "props" | "scenes"> = {
        "anchor-characters": "characters",
        "anchor-props": "props",
        "anchor-scenes": "scenes",
    };
    const jumpToAnchor = (anchor: string) => {
        const assetKindForAnchor = ASSET_ANCHORS[anchor];
        if (assetKindForAnchor) {
            setAssetKind(assetKindForAnchor);
            document.getElementById("anchor-assets")?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    /** L 侧栏点击分镜后滚动到该分镜卡。 */
    const jumpToShot = (shotId: string) => {
        document.getElementById(`one-click-shot-${shotId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    /**
     * L 的 allActiveTaskItems：把当前运行中的东西聚合成一个列表。
     * V 侧真实可取消的只有工作流任务本身（有 /tasks/:id/cancel 路由），
     * 分镜级图/视频任务没有逐条取消入口，所以标 cancelable=false，不放假按钮。
     */
    const activeTasks: OneClickActiveTask[] = [
        ...(task && ["pending", "running"].includes(task.status) ? [{ id: `workflow:${task.id}`, label: task.currentStep ? `一键成片 · ${task.currentStep}` : "一键成片运行中…", cancelable: true }] : []),
        ...(renderTask && ["pending", "running"].includes(renderTask.status) ? [{ id: `render:${renderTask.id}`, label: "本集成片合成中…" }] : []),
        ...(project?.episodes[0]?.shots || []).flatMap((shot, index) => {
            const running = (status?: string) => status === "running" || status === "pending" || status === "queued";
            const items: OneClickActiveTask[] = [];
            if (running(shot.storyboardStatus)) items.push({ id: `sbimg:${shot.id}`, label: `分镜 ${index + 1} 分镜图` });
            if (running(shot.generationStatus)) items.push({ id: `sbvideo:${shot.id}`, label: `分镜 ${index + 1} 视频` });
            return items;
        }),
    ];

    /**
     * 导出分镜表 Excel / 解说 SRT，对应 L `onExportStoryboardSheet` 与 `onExportNarrationSrt`。
     *
     * 复用 `@/lib/drama-lab-storyboard-export`：已核实该模块无创作工坊耦合
     * （不含 featureModule / collaboration / stage 判断），纯数据转换、浏览器端生成，不计费。
     */
    const exportStoryboard = async (kind: "xlsx" | "srt") => {
        const episode = project?.episodes[0];
        if (!episode) return;
        setExportingStoryboard(kind);
        try {
            const { buildStoryboardNarrationSrt, buildStoryboardXlsx, storyboardExportFilename } = await import("@/lib/drama-lab-storyboard-export");
            const input = {
                projectTitle: project.title,
                episode: { id: episode.id, number: episode.episodeNumber },
                shots: episode.shots,
                scenes: project.scenes,
                characters: project.characters,
                props: project.props,
            };
            const blob =
                kind === "srt"
                    ? new Blob([buildStoryboardNarrationSrt(input)], { type: "text/plain;charset=utf-8" })
                    : new Blob([new Uint8Array(await buildStoryboardXlsx(input))], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = storyboardExportFilename(input, kind);
            anchor.click();
            URL.revokeObjectURL(url);
            message.success(kind === "srt" ? "解说 SRT 已导出" : "分镜表 Excel 已导出");
        } catch (exportError) {
            message.error(exportError instanceof Error ? exportError.message : "导出失败");
        } finally {
            setExportingStoryboard(undefined);
        }
    };

    const exportHref = `/api/one-click-film/projects/${encodeURIComponent(projectId)}/export`;
    const canvasHref = episodeId ? `/one-click-film/${encodeURIComponent(projectId)}/canvas?episode=${encodeURIComponent(episodeId)}` : undefined;
    return (
        // L 布局：左侧固定侧栏（.quick-nav 180px）+ 右侧可滚动主区（.main）
        <div className="flex h-full bg-background text-foreground">
            <OneClickFilmNavSidebar
                project={project}
                episode={project.episodes[0]}
                activeTasks={activeTasks}
                onCancelTask={(item) => {
                    if (item.id.startsWith("workflow:")) void cancelWorkflow();
                }}
                onJumpAnchor={jumpToAnchor}
                onJumpShot={jumpToShot}
            />
            <main className="h-full flex-1 overflow-y-auto">
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
                        <div className="flex flex-wrap items-center gap-2">
                            {/* L header 只放导航与集数切换；成片相关按钮归 §6，不在此重复 */}
                            {project.episodes.length > 0 ? (
                                <Select
                                    size="middle"
                                    style={{ minWidth: 130 }}
                                    placeholder="选择集数"
                                    value={episodeId}
                                    aria-label="选择集数"
                                    options={project.episodes.map((item, index) => ({ value: item.id, label: item.title || `第 ${item.episodeNumber ?? index + 1} 集` }))}
                                    onChange={() => message.info("当前工作区固定处理第 1 集，多集切换将随分集管理一并接入")}
                                />
                            ) : null}
                            <Button icon={<RefreshCcw className="size-4" />} aria-label="刷新项目" onClick={() => void loadProject()}>
                                刷新
                            </Button>
                            {canvasHref ? (
                                <Button type="primary" icon={<PanelsTopLeft className="size-4" />} href={canvasHref} aria-label="画布模式">
                                    画布模式
                                </Button>
                            ) : null}
                            <Button icon={<Download className="size-4" />} href={exportHref} aria-label="导出项目">
                                导出项目
                            </Button>
                        </div>
                    </div>
                    <Modal open={libraryOpen} title="从剧本库导入" onCancel={() => setLibraryOpen(false)} onOk={applyLibraryScript} okText="填入本集" cancelText="取消" destroyOnHidden>
                        <Spin spinning={libraryLoading}>
                            <p className="mb-2 text-sm text-muted-foreground">选择本人其他一键成片项目的分集剧本；填入后仍需点「保存本集剧本」才会写库。</p>
                            <Select
                                style={{ width: "100%" }}
                                placeholder={libraryProjects.length ? "选择项目与集数" : "暂无可导入的剧本"}
                                value={librarySelection}
                                onChange={setLibrarySelection}
                                aria-label="选择剧本库剧本"
                                options={libraryProjects.map((item) => ({
                                    label: item.title,
                                    options: item.episodes.map((episode) => ({ value: `${item.id}::${episode.id}`, label: `${episode.title}（${episode.script.length} 字）` })),
                                }))}
                            />
                        </Spin>
                    </Modal>
                    <section id="anchor-script" className="mt-6 rounded-lg border border-border bg-card p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold">本集剧本</h2>
                            <div className="flex items-center gap-2">
                                <Button size="small" aria-label="从剧本库导入" onClick={() => void openScriptLibrary()}>
                                    从剧本库导入
                                </Button>
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
                    {/* L §2: 一键全流程 —— L 里是独立 section，不塞在别的卡内 */}
                    <section className="mt-6 rounded-lg border border-border bg-card p-5">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <b>一键全流程</b>
                            <Tag>{project.ratio}</Tag>
                            <Tag>{project.episodes.length} 集</Tag>
                            <Tag>{project.episodes.reduce((sum, episode) => sum + episode.shots.length, 0)} 分镜</Tag>
                            {!task || task.status === "success" ? (
                                <>
                                    <Button type="primary" loading={starting === "full"} disabled={Boolean(starting)} aria-label="一键成片带图片视频" onClick={() => void startWorkflow("full")}>
                                        一键成片带图片视频
                                    </Button>
                                    <Tooltip title="仅提取角色、场景、道具与生成分镜文本，不生成图片与视频">
                                        <Button loading={starting === "text_framework"} disabled={Boolean(starting)} aria-label="生成文本框架" onClick={() => void startWorkflow("text_framework")}>
                                            生成文本框架
                                        </Button>
                                    </Tooltip>
                                </>
                            ) : null}
                            {task && ["pending", "running"].includes(task.status) ? (
                                <>
                                    <Tooltip title={task.paused ? "继续启动后续步骤" : "暂停后不再启动下一步；已提交的子任务会继续跑完，不会重复扣费"}>
                                        <Button aria-label={task.paused ? "继续一键成片任务" : "暂停一键成片任务"} onClick={() => void setWorkflowPaused(!task.paused)}>
                                            {task.paused ? "继续" : "暂停"}
                                        </Button>
                                    </Tooltip>
                                    <Button danger aria-label="取消一键成片任务" onClick={() => void cancelWorkflow()}>
                                        取消任务
                                    </Button>
                                </>
                            ) : null}
                            {task && ["error", "cancelled"].includes(task.status) ? (
                                <Button aria-label="重试一键成片任务" onClick={() => void retryWorkflow()}>
                                    重试
                                </Button>
                            ) : null}
                        </div>
                        {task ? (
                            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <b>生产任务：{task.status}</b>
                                    <span className="text-sm text-muted-foreground">{task.currentStep || "等待启动"}</span>
                                </div>
                                <Progress percent={task.progress} status={task.status === "error" ? "exception" : task.status === "success" ? "success" : "active"} />
                                <ol className="mt-3 grid gap-2 text-sm">
                                    {task.steps.map((step) => (
                                        <li key={step.key} className="flex items-center justify-between gap-2">
                                            <span>{step.label}</span>
                                            <Tag color={step.status === "success" ? "success" : step.status === "error" ? "error" : step.status === "running" ? "processing" : "default"}>{step.status}</Tag>
                                        </li>
                                    ))}
                                </ol>
                                {task.steps.some((step) => step.error) ? (
                                    <div className="mt-3 text-sm text-red-500">
                                        <div className="font-semibold">执行过程中的错误：</div>
                                        {task.steps
                                            .filter((step) => step.error)
                                            .map((step) => (
                                                <div key={step.key}>
                                                    · {step.label}：{step.error}
                                                </div>
                                            ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </section>

                    {/* L §3: 资源管理（角色 / 道具 / 场景） */}
                    <OneClickFilmAssetPanel projectId={projectId} project={project} onProjectChange={setProject} kind={assetKind} onKindChange={setAssetKind} />

                    {/* L §4: 分镜生成 */}
                    <section id="anchor-storyboard" className="mt-6 rounded-lg border border-border bg-card p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="m-0 flex flex-wrap items-center gap-2.5 text-base font-semibold">
                                <span>分镜生成</span>
                                <span className="text-xs font-normal text-muted-foreground">根据剧本、角色、场景自动生成分镜头脚本</span>
                            </h2>
                            {/* 对应 L 的「导出分镜表excel」与「导出解说 SRT」，L 也是放在本 section 顶部 */}
                            {project.episodes[0]?.shots.length ? (
                                <div className="flex flex-wrap gap-2">
                                    <Button size="small" loading={exportingStoryboard === "xlsx"} aria-label="导出分镜表excel" onClick={() => void exportStoryboard("xlsx")}>
                                        导出分镜表excel
                                    </Button>
                                    <Button size="small" loading={exportingStoryboard === "srt"} aria-label="导出解说 SRT" onClick={() => void exportStoryboard("srt")}>
                                        导出解说 SRT
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        {project.episodes[0] ? (
                            <OneClickFilmShotCards projectId={projectId} project={project} episode={project.episodes[0]} onProjectChange={setProject} />
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">当前项目还没有分集，请先添加分集。</p>
                        )}
                    </section>

                    {/* L §6: 合成视频 */}
                    <section id="anchor-video" className="mt-6 rounded-lg border border-border bg-card p-5">
                        <h2 className="m-0 text-base font-semibold">合成视频</h2>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                            <label className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">输出分辨率</span>
                                <Select
                                    size="small"
                                    style={{ minWidth: 118 }}
                                    value={renderResolution}
                                    aria-label="输出分辨率"
                                    onChange={(value) => setRenderResolution(value)}
                                    options={[
                                        { value: "source", label: "保持源尺寸" },
                                        { value: "720p", label: "720P" },
                                        { value: "1080p", label: "1080P" },
                                        { value: "1440p", label: "1440P" },
                                        { value: "2160p", label: "2160P" },
                                    ]}
                                />
                            </label>
                            <Tooltip title="把分镜字幕烧进画面（硬字幕，播放器无法关闭）；分镜没有字幕文案时不生效">
                                <label className="flex items-center gap-1.5">
                                    <Switch size="small" checked={renderBurnSubtitles} onChange={setRenderBurnSubtitles} aria-label="烧制字幕" />
                                    <span>烧制字幕</span>
                                </label>
                            </Tooltip>
                            <label className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">水印文字</span>
                                <Input size="small" style={{ width: 160 }} maxLength={60} value={renderWatermark} placeholder="留空不打水印" aria-label="水印文字" onChange={(event) => setRenderWatermark(event.target.value)} />
                            </label>
                            <span className="text-xs text-muted-foreground">保持源尺寸且不烧字幕、无水印时直接拼流不转码，速度最快、无画质损失</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {episodeId ? (
                                <Button type="primary" icon={<Clapperboard className="size-4" />} loading={renderBusy || renderTask?.status === "pending" || renderTask?.status === "running"} aria-label="合成视频" onClick={() => void startRender()}>
                                    合成视频
                                </Button>
                            ) : null}
                            {canvasHref ? (
                                <Button icon={<ExternalLink className="size-4" />} href={canvasHref} aria-label="打开本集画布">
                                    打开本集画布
                                </Button>
                            ) : null}
                            {/* 对应 L `GET .../download`：成片产物下载 */}
                            {episodeId && renderTask?.result?.artifactId ? (
                                <Button
                                    icon={<Download className="size-4" />}
                                    href={`/api/one-click-film/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/render/artifact/${encodeURIComponent(renderTask.result.artifactId)}?taskId=${encodeURIComponent(renderTask.id)}`}
                                    aria-label="下载成片"
                                >
                                    下载成片
                                </Button>
                            ) : null}
                            {/* 对应 L `DELETE /video-merges/:id`：仅删记录，不动分镜与素材 */}
                            {episodeId && renderTask?.id ? (
                                <Popconfirm title="删除本集成片记录？" description="仅删除成片记录，不影响分镜与素材。" okText="删除" cancelText="取消" onConfirm={() => void removeRenderRecord()}>
                                    <Button danger icon={<Trash2 className="size-4" />} loading={renderRecordBusy} aria-label="删除本集成片记录">
                                        删除成片记录
                                    </Button>
                                </Popconfirm>
                            ) : null}
                            {!episodeId ? <p className="m-0 text-sm text-muted-foreground">当前项目还没有分集，请先添加分集。</p> : null}
                        </div>
                        {renderTask ? (
                            <div className="mt-4 grid gap-3">
                                {renderTask.status === "pending" || renderTask.status === "running" ? <Alert type="info" showIcon message="视频合成中…" /> : null}
                                {renderTask.status === "success" ? <Alert type="success" showIcon message="视频生成完成" /> : null}
                                {renderTask.status === "error" ? <Alert type="error" showIcon message={renderTask.error || "成片合成失败"} /> : null}
                                {renderTask.result?.url ? (
                                    <div>
                                        <p className="mb-1 text-sm text-muted-foreground">本集合成视频预览</p>
                                        {/* 结果由服务端持久化，这里只播放，不在前端合成 */}
                                        <video controls preload="metadata" src={renderTask.result.url} className="max-w-[520px] rounded-lg border border-border" aria-label="本集合成视频预览" />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </section>
                </div>
            </main>
        </div>
    );
}
