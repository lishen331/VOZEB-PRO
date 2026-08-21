"use client";

import { Alert, Button, Spin, Tabs, Input, Select, Form, Modal, message, Upload, Radio } from "antd";
import {
    ArrowLeft, Plus, Settings2, Save, Trash2, Edit2,
    FileText, Users, MapPin, Package, Film, Download, Sparkles,
    PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight,
    CheckCircle2, AlertCircle, LoaderCircle
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const { TextArea } = Input;
const { Option } = Select;

// 步骤定义
const WORKFLOW_STEPS = [
    { key: "script", label: "剧本", icon: FileText },
    { key: "review", label: "内容审核", icon: FileText },
    { key: "assets", label: "资产准备", icon: Users },
    { key: "storyboard", label: "分镜", icon: Film },
    { key: "generate", label: "镜头生成", icon: Film },
    { key: "export", label: "成片导出", icon: Download },
] as const;

type StepKey = typeof WORKFLOW_STEPS[number]["key"];

type SaveOptions = { silent?: boolean };

interface Episode {
    id: string;
    title: string;
    number: number;
    script: string;
    status?: string;
}

interface Character {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
}

interface Scene {
    id: string;
    location: string;
    time?: string;
    description?: string;
    imageUrl?: string;
}

interface Prop {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
}

interface Shot {
    id: string;
    episodeId: string;
    shotNumber: number;
    sceneId?: string;
    characterIds: string[];
    script: string;
    imagePrompt?: string;
    imageUrl?: string;
    videoUrl?: string;
    duration: number;
    cameraAngle?: string;
    status: "draft" | "image_generated" | "video_generated";
}

interface Project {
    id: string;
    title: string;
    description?: string;
    style?: string;
    aspectRatio?: string;
    episodes: Episode[];
    characters: Character[];
    scenes: Scene[];
    props: Prop[];
    shots: Shot[];
}

function normalizeEpisodes(value: unknown): Episode[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const episode = item as Record<string, unknown>;
        const id = typeof episode.id === "string" ? episode.id : "";
        if (!id) return [];
        return [{
            id,
            title: typeof episode.title === "string" && episode.title.trim() ? episode.title : `第 ${index + 1} 集`,
            number: typeof episode.number === "number" && Number.isFinite(episode.number) ? episode.number : index + 1,
            script: typeof episode.script === "string" ? episode.script : "",
            status: typeof episode.status === "string" ? episode.status : undefined,
        }];
    });
}

function normalizeShot(value: unknown, episodeId: string, index: number): Shot | undefined {
    if (!value || typeof value !== "object") return undefined;
    const shot = value as Record<string, unknown>;
    const id = typeof shot.id === "string" ? shot.id : "";
    if (!id) return undefined;
    const status = shot.status === "image_generated" || shot.status === "video_generated" ? shot.status : "draft";
    const continuity = shot.continuity && typeof shot.continuity === "object" ? (shot.continuity as Record<string, unknown>) : undefined;
    return {
        id,
        episodeId: typeof shot.episodeId === "string" ? shot.episodeId : episodeId,
        shotNumber: typeof shot.shotNumber === "number" ? shot.shotNumber : typeof shot.order === "number" ? shot.order : index + 1,
        sceneId: typeof shot.sceneId === "string" ? shot.sceneId : undefined,
        characterIds: Array.isArray(shot.characterIds) ? shot.characterIds.filter((item): item is string => typeof item === "string") : [],
        script: typeof shot.script === "string" ? shot.script : typeof shot.description === "string" ? shot.description : typeof shot.title === "string" ? shot.title : "",
        imagePrompt: typeof shot.imagePrompt === "string" ? shot.imagePrompt : undefined,
        imageUrl: typeof shot.imageUrl === "string" ? shot.imageUrl : typeof shot.storyboardImageUrl === "string" ? shot.storyboardImageUrl : undefined,
        videoUrl: typeof shot.videoUrl === "string" ? shot.videoUrl : undefined,
        duration: typeof shot.duration === "number" ? shot.duration : 3,
        cameraAngle: typeof shot.cameraAngle === "string" ? shot.cameraAngle : typeof continuity?.cameraAngle === "string" ? continuity.cameraAngle : undefined,
        status,
    };
}

function normalizeProjectShots(project: Record<string, unknown>, episodes: Episode[], legacy: Record<string, unknown>): Shot[] {
    const topLevelShots = Array.isArray(project.shots) ? project.shots : Array.isArray(legacy.shots) ? legacy.shots : [];
    if (topLevelShots.length) {
        return topLevelShots.flatMap((shot, index) => {
            const normalized = normalizeShot(shot, "", index);
            return normalized ? [normalized] : [];
        });
    }
    const rawEpisodes = Array.isArray(project.episodes) ? project.episodes : Array.isArray(legacy.episodes) ? legacy.episodes : [];
    return rawEpisodes.flatMap((rawEpisode, episodeIndex) => {
        if (!rawEpisode || typeof rawEpisode !== "object") return [];
        const raw = rawEpisode as Record<string, unknown>;
        const episodeId = typeof raw.id === "string" ? raw.id : episodes[episodeIndex]?.id || "";
        return Array.isArray(raw.shots)
            ? raw.shots.flatMap((shot, shotIndex) => {
                  const normalized = normalizeShot(shot, episodeId, shotIndex);
                  return normalized ? [normalized] : [];
              })
            : [];
    });
}

export function DramaWorkflowLabProject({
    projectId,
    initialEpisodeId
}: {
    projectId: string;
    initialEpisodeId?: string;
}) {
    const [messageApi, contextHolder] = message.useMessage();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [activeStep, setActiveStep] = useState<StepKey>("script");
    const [activeEpisodeId, setActiveEpisodeId] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [expandedEpisodeIds, setExpandedEpisodeIds] = useState<Set<string>>(new Set());

    // 加载项目数据
    const loadProject = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const response = await fetch(`/api/drama-lab/projects/${projectId}`);
            const data = await response.json();

            if (data.code !== 0 || !data.data?.project) {
                throw new Error(data.msg || "加载失败");
            }

            const proj = data.data.project;
            const legacy = (proj.projectJson || {}) as Record<string, unknown>;
            const sourceEpisodes = proj.episodes ?? legacy.episodes ?? [];
            const episodes = normalizeEpisodes(sourceEpisodes);
            setProject({
                id: proj.id,
                title: proj.title,
                description: proj.summary ?? legacy.description ?? "",
                style: proj.style ?? legacy.style ?? "",
                aspectRatio: proj.ratio ?? legacy.aspectRatio ?? "16:9",
                episodes,
                characters: proj.characters ?? legacy.characters ?? [],
                scenes: proj.scenes ?? legacy.scenes ?? [],
                props: proj.props ?? legacy.props ?? [],
                shots: normalizeProjectShots(proj as Record<string, unknown>, episodes, legacy),
            });

            if (episodes.length > 0) {
                setActiveEpisodeId(initialEpisodeId || episodes[0].id);
            }
            setExpandedEpisodeIds(new Set(episodes.map((episode: Episode) => episode.id)));
        } catch (err) {
            setError(err instanceof Error ? err.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, [initialEpisodeId, projectId]);

    useEffect(() => {
        void loadProject();
    }, [loadProject]);

    // 保存项目数据
    const saveProject = async (updates: Partial<Project>, options: SaveOptions = {}): Promise<boolean> => {
        if (!project) return false;

        setSaving(true);
        try {
            const response = await fetch(`/api/drama-lab/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: updates.title ?? project.title,
                    summary: updates.description ?? project.description,
                    style: updates.style ?? project.style,
                    ratio: updates.aspectRatio ?? project.aspectRatio,
                    episodes: updates.episodes ?? project.episodes,
                    characters: updates.characters ?? project.characters,
                    scenes: updates.scenes ?? project.scenes,
                    props: updates.props ?? project.props,
                    shots: updates.shots ?? project.shots,
                }),
            });

            const data = await response.json();
            if (data.code !== 0) throw new Error(data.msg || "保存失败");

            if (!options.silent) messageApi.success({ content: "保存成功", key: "drama-project-save" });
            setProject((current) => current ? { ...current, ...updates } : current);
            return true;
        } catch (err) {
            if (!options.silent) messageApi.error({ content: err instanceof Error ? err.message : "保存失败", key: "drama-project-save" });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const activeEpisode = project?.episodes.find(ep => ep.id === activeEpisodeId);

    const addEpisode = () => {
        if (!project) return;
        const newEpisode: Episode = {
            id: `ep_${Date.now()}`,
            title: `第 ${project.episodes.length + 1} 集`,
            number: project.episodes.length + 1,
            script: "",
        };
        void saveProject({ episodes: [...project.episodes, newEpisode] }).then((saved) => {
            if (!saved) return;
            setActiveEpisodeId(newEpisode.id);
            setExpandedEpisodeIds((current) => new Set(current).add(newEpisode.id));
        });
    };

    const toggleEpisodeExpanded = (episodeId: string) => {
        setExpandedEpisodeIds((current) => {
            const next = new Set(current);
            if (next.has(episodeId)) next.delete(episodeId);
            else next.add(episodeId);
            return next;
        });
    };

    if (loading) {
        return (
            <main className="grid h-screen place-items-center bg-background">
                <Spin size="large" />
            </main>
        );
    }

    if (error || !project) {
        return (
            <main className="h-screen overflow-y-auto bg-background px-4 py-6">
                <div className="mx-auto max-w-3xl">
                    <Link href="/drama-lab" className="inline-flex items-center gap-2 text-sm hover:underline">
                        <ArrowLeft className="size-4" /> 返回项目列表
                    </Link>
                    <Alert
                        className="mt-6"
                        type="error"
                        showIcon
                        message={error || "项目不存在"}
                    />
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-screen flex-col bg-background">
            {contextHolder}
            {/* 顶部导航栏 */}
            <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
                <Link
                    href={`/drama-lab/${encodeURIComponent(projectId)}/outline`}
                    aria-label="返回项目大纲"
                    className="grid size-8 place-items-center rounded border border-border hover:bg-muted"
                >
                    <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-semibold">{project.title}</h1>
                    <p className="truncate text-xs text-muted-foreground">
                        {activeEpisode?.title || `第 ${activeEpisode?.number || 1} 集`}
                    </p>
                </div>
                <Button
                    icon={<Settings2 className="size-4" />}
                    onClick={() => setActiveStep("script")}
                >
                    项目设置
                </Button>
                <Button
                    type="primary"
                    icon={<Save className="size-4" />}
                    loading={saving}
                    onClick={() => void saveProject({})}
                >
                    保存草稿
                </Button>
            </header>

            {/* 步骤导航 */}
            <nav className="flex h-14 shrink-0 items-center justify-center gap-8 border-b border-border bg-card px-4">
                {WORKFLOW_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = activeStep === step.key;
                    return (
                        <button
                            key={step.key}
                            onClick={() => setActiveStep(step.key)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
                                isActive
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <span className={cn(
                                "grid size-6 place-items-center rounded-full border text-xs",
                                isActive
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border"
                            )}>
                                {index + 1}
                            </span>
                            <span>{step.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* 主内容区 */}
            <div className="flex min-h-0 flex-1">
                {/* 左侧边栏 - 剧集列表 */}
                <aside className={cn("flex min-h-0 shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200", sidebarCollapsed ? "w-14" : "w-64")}>
                    <div className={cn("flex h-12 items-center border-b border-border", sidebarCollapsed ? "justify-center px-2" : "justify-between px-4")}>
                        {!sidebarCollapsed ? <span className="text-sm font-semibold">
                            剧集 <span className="text-muted-foreground">{project.episodes.length}</span>
                        </span> : null}
                        <Button
                            type="text"
                            size="small"
                            aria-label={sidebarCollapsed ? "展开剧集侧栏" : "收起剧集侧栏"}
                            title={sidebarCollapsed ? "展开剧集侧栏" : "收起剧集侧栏"}
                            icon={sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                            onClick={() => setSidebarCollapsed((current) => !current)}
                        />
                    </div>
                    <div className={cn("min-h-0 flex-1 overflow-y-auto p-2", sidebarCollapsed && "px-1")}>
                        {project.episodes.map((ep) => {
                            const isActive = ep.id === activeEpisodeId;
                            const episodeShots = project.shots.filter((shot) => shot.episodeId === ep.id);
                            const isExpanded = expandedEpisodeIds.has(ep.id);

                            return (
                                <div key={ep.id} className="mb-1">
                                    <div className={cn(
                                        "flex min-w-0 items-center rounded text-sm transition-colors",
                                        isActive ? "bg-primary/10 text-primary" : "hover:bg-muted",
                                    )}>
                                        {!sidebarCollapsed && episodeShots.length > 0 ? (
                                            <Button
                                                type="text"
                                                size="small"
                                                className="shrink-0"
                                                aria-label={isExpanded ? `收起${ep.title}分镜` : `展开${ep.title}分镜`}
                                                aria-expanded={isExpanded}
                                                title={isExpanded ? "收起分镜" : "展开分镜"}
                                                icon={isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                                onClick={() => toggleEpisodeExpanded(ep.id)}
                                            />
                                        ) : !sidebarCollapsed ? <span className="size-8 shrink-0" aria-hidden /> : null}
                                        <button
                                            type="button"
                                            onClick={() => setActiveEpisodeId(ep.id)}
                                            title={sidebarCollapsed ? ep.title : undefined}
                                            className={cn(
                                                "min-w-0 flex-1 rounded py-2 text-left transition-colors",
                                                sidebarCollapsed ? "px-1 text-center" : "pr-2",
                                            )}
                                        >
                                        {sidebarCollapsed ? (
                                            <div className="font-medium">{ep.number}</div>
                                        ) : (
                                            <>
                                                <div className="font-medium truncate">{ep.title}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {ep.script ? `${ep.script.length} 字` : "暂无剧本"}
                                                    {episodeShots.length > 0 && ` • ${episodeShots.length} 个分镜`}
                                                </div>
                                            </>
                                        )}
                                        </button>
                                    </div>

                                    {!sidebarCollapsed && isExpanded && episodeShots.length > 0 && (
                                        <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-primary/20 pl-2">
                                            {episodeShots
                                                .sort((a, b) => a.shotNumber - b.shotNumber)
                                                .map((shot) => (
                                                    <button
                                                        key={shot.id}
                                                        type="button"
                                                        className="block w-full truncate rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                                        onClick={() => {
                                                            setActiveEpisodeId(ep.id);
                                                            setActiveStep("storyboard");
                                                            setTimeout(() => {
                                                                document.getElementById(`storyboard-shot-${shot.id}`)?.scrollIntoView({
                                                                    behavior: "smooth",
                                                                    block: "center",
                                                                });
                                                            }, 100);
                                                        }}
                                                    >
                                                        镜头 {shot.shotNumber}: {shot.script?.slice(0, 20) || "未命名"}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <Button
                            type="text"
                            block={!sidebarCollapsed}
                            size="small"
                            aria-label="新增剧集"
                            title="新增剧集"
                            className={cn("mt-2", sidebarCollapsed ? "w-full" : "justify-start px-3")}
                            icon={<Plus className="size-4" />}
                            onClick={addEpisode}
                        >
                            {!sidebarCollapsed ? "新增一集" : null}
                        </Button>
                    </div>
                </aside>

                {/* 主编辑区域 */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeStep === "script" && (
                        <ScriptEditor
                            project={project}
                            episode={activeEpisode}
                            onSave={saveProject}
                        />
                    )}
                    {activeStep === "review" && (
                        <ReviewPanel project={project} episode={activeEpisode} />
                    )}
                    {activeStep === "assets" && (
                        <AssetsPanel project={project} onSave={saveProject} />
                    )}
                    {activeStep === "storyboard" && (
                        <StoryboardPanel project={project} episode={activeEpisode} onSave={saveProject} />
                    )}
                    {activeStep === "generate" && (
                        <GeneratePanel project={project} episode={activeEpisode} />
                    )}
                    {activeStep === "export" && (
                        <ExportPanel project={project} episode={activeEpisode} />
                    )}
                </div>
            </div>
        </main>
    );
}

// ========== 子组件 ==========

// 1. 剧本编辑器
function ScriptEditor({
    project,
    episode,
    onSave
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: Partial<Project>, options?: SaveOptions) => Promise<boolean>;
}) {
    const [form] = Form.useForm();
    const [scriptForm] = Form.useForm();
    const [activeTab, setActiveTab] = useState<"create" | "select">("create");
    const [generating, setGenerating] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        form.setFieldsValue({
            title: project.title,
            description: project.description,
            style: project.style,
            aspectRatio: project.aspectRatio,
        });
        scriptForm.setFieldsValue({ script: episode?.script || "" });
    }, [form, scriptForm, project, episode]);

    const saveNow = useCallback((options: SaveOptions = {}) => {
        const values = form.getFieldsValue();
        const script = scriptForm.getFieldValue("script") || "";
        if (episode) {
            const updatedEpisodes = project.episodes.map(ep =>
                ep.id === episode.id ? { ...ep, script } : ep
            );
            return onSave({
                title: values.title,
                description: values.description,
                style: values.style,
                aspectRatio: values.aspectRatio,
                episodes: updatedEpisodes,
            }, options);
        }
        return Promise.resolve(false);
    }, [episode, form, onSave, project, scriptForm]);

    const scheduleSave = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setSaveStatus("pending");
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            setSaveStatus("saving");
            void saveNow({ silent: true }).then((saved) => {
                setSaveStatus(saved ? "saved" : "error");
                if (saved) {
                    messageApi.success({ content: "已自动保存", key: "drama-autosave", duration: 1.5 });
                } else {
                    messageApi.error({ content: "自动保存失败", key: "drama-autosave", duration: 2 });
                }
            });
        }, 800);
    }, [saveNow]);

    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    }, []);

    // AI 生成剧本
    const handleGenerateScript = async () => {
        const values = form.getFieldsValue();
        const script = scriptForm.getFieldValue("script") || "";
        const storyOutline = script || values.description;

        if (!storyOutline || !storyOutline.trim()) {
            messageApi.error("请先输入故事梗概");
            return;
        }

        setGenerating(true);
        try {
            messageApi.loading({ content: "AI 正在生成剧本...", key: "generate-script", duration: 0 });

            const prompt = `请根据以下故事梗概创作一个短剧剧本：

${storyOutline}

要求：
1. 剧本风格：${values.style || "现代写实"}
2. 画面比例：${values.aspectRatio || "16:9"}
3. 包含场景描述、人物对话和动作指导
4. 适合短视频制作
5. 生成一集的完整剧本`;

            const response = await fetch("/api/text-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: {
                        model: "deepseek-chat",
                    },
                    context: {
                        surface: "drama",
                        projectId: project.id,
                        episodeId: activeEpisode?.id,
                        clientRequestId: `drama-script:${project.id}:${activeEpisode?.id || "episode"}:${Date.now()}`,
                    },
                    messages: [
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                }),
            });

            const data = await response.json();

            if (data.task) {
                pollScriptTask(data.task.id);
                // 轮询任务状态
                pollScriptTask(data.task.id);
            } else {
                throw new Error(data.error || "生成失败");
            }
        } catch (err) {
            messageApi.error({ content: err instanceof Error ? err.message : "生成剧本失败", key: "generate-script", duration: 3 });
            setGenerating(false);
        }
    };

    // 轮询剧本生成任务
    const pollScriptTask = async (taskId: string) => {
        const maxAttempts = 60; // 最多5分钟
        let attempts = 0;

        const poll = async () => {
            try {
                const response = await fetch(`/api/text-tasks/${taskId}`);
                const data = await response.json();

                const generatedScript = data.task?.result?.content || data.task?.result?.text;
                if ((data.task?.status === "success" || data.task?.status === "completed") && generatedScript) {
                    // 更新剧本
                    scriptForm.setFieldsValue({ script: generatedScript });
                    const saved = await saveNow();
                    if (!saved) throw new Error("保存剧本失败");
                    messageApi.success({ content: "剧本生成成功", key: "generate-script", duration: 3 });
                    setGenerating(false);
                } else if (data.task?.status === "error" || data.task?.status === "failed") {
                    throw new Error(data.task.error || "剧本生成失败");
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(poll, 5000); // 5秒后再次轮询
                } else {
                    throw new Error("生成超时，请重试");
                }
            } catch (err) {
                messageApi.error({ content: err instanceof Error ? err.message : "生成失败", key: "generate-script", duration: 3 });
                setGenerating(false);
            }
        };

        poll();
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 text-lg font-semibold">剧集信息</h2>
                <Form form={form} layout="vertical" onValuesChange={scheduleSave}>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item label="标题" name="title">
                            <Input placeholder="剧集标题" />
                        </Form.Item>
                        <Form.Item label="画面比例" name="aspectRatio">
                            <Select>
                                <Option value="16:9">16:9 横屏（默认）</Option>
                                <Option value="9:16">9:16 竖屏</Option>
                                <Option value="1:1">1:1 方形</Option>
                                <Option value="4:3">4:3 传统横屏</Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <Form.Item label="图片/视频风格" name="style">
                        <Input placeholder="例如: 写实、动漫、科幻等" />
                    </Form.Item>
                    <Form.Item label="故事梗概" name="description">
                        <TextArea rows={3} placeholder="一句话描述故事梗概" />
                    </Form.Item>
                </Form>
            </div>

            {episode && (
                <div className="rounded-lg border border-border bg-card p-6">
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as "create" | "select")}
                        items={[
                            {
                                key: "create",
                                label: "创作剧本",
                                children: (
                                    <div className="space-y-4">
                                        <Alert type="info" showIcon description="输入一段故事梗概，AI 帮你扩展成整集剧本，或直接输入小说章节。">
                                            故事生成
                                        </Alert>

                                        <Form form={scriptForm} onValuesChange={scheduleSave}>
                                            <Form.Item name="script">
                                                <TextArea
                                                    rows={15}
                                                    placeholder="将描代文学家柳宗元创作的传记文学作品《童区寄传》进行改编。一个发生在唐朝年间的悬疑故事。主人公就是十一岁，名字就叫区寄。可以模仿白夜追凶、催眠大师的套路的心里悬疑片，严格按照 10 节拍表重新整理成一个详细的故事大纲。

暴雨后的山路上，十一岁的区寄独自赶着一头水牛回家。他突然发现林中有两个区寄独自赶往一夜回到。区寄害怕极了，那两人的买卖跟区寄追问：少女饼伤到二十七下后，他终于转变逃走。少女穷极挣扎，让这大师对爹，他们意识，都村民都沾血过往边的刀剑。..."
                                                    className="font-mono text-sm"
                                                />
                                            </Form.Item>
                                        </Form>

                                        <div className="flex flex-wrap items-center gap-4">
                                            <Select defaultValue="style1" style={{ width: 140 }}>
                                                <Option value="style1">故事风格</Option>
                                                <Option value="suspense">悬疑</Option>
                                                <Option value="romance">浪漫</Option>
                                                <Option value="action">动作</Option>
                                            </Select>

                                            <Select defaultValue="default" style={{ width: 140 }}>
                                                <Option value="default">剧本类型</Option>
                                                <Option value="short">短剧</Option>
                                                <Option value="movie">电影</Option>
                                            </Select>

                                            <Input placeholder="集数" style={{ width: 100 }} defaultValue="1" />

                                            <Button
                                                type="primary"
                                                icon={<Plus className="size-4" />}
                                                onClick={handleGenerateScript}
                                                loading={generating}
                                                disabled={generating}
                                            >
                                                {generating ? "生成中..." : "生成剧本"}
                                            </Button>

                                            <Button icon={<Download className="size-4" />}>
                                                导入小说
                                            </Button>
                                            <div className="ml-auto flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                                                {saveStatus === "pending" ? <><LoaderCircle className="size-3.5 animate-spin" /> 自动保存等待中</> : null}
                                                {saveStatus === "saving" ? <><LoaderCircle className="size-3.5 animate-spin" /> 正在自动保存</> : null}
                                                {saveStatus === "saved" ? <><CheckCircle2 className="size-3.5 text-emerald-600" /> 已自动保存</> : null}
                                                {saveStatus === "error" ? <><AlertCircle className="size-3.5 text-destructive" /> 自动保存失败</> : null}
                                            </div>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            <span className="font-semibold">剧本</span>
                                            <span className="mx-2">·</span>
                                            <span>{episode.script.length} 字</span>
                                        </div>

                                        <Button block>保存当前集</Button>
                                    </div>
                                ),
                            },
                            {
                                key: "select",
                                label: "选择剧本",
                                children: (
                                    <div className="py-8 text-center text-muted-foreground">
                                        暂无已保存的剧本模板
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            )}
        </div>
    );
}

// 2. 内容审核面板
function ReviewPanel({ project, episode }: { project: Project; episode?: Episode }) {
    return (
        <div className="mx-auto max-w-4xl">
            <Alert
                type="info"
                showIcon
                message="AI 生成剧本"
                description="此功能将使用 AI 帮助您生成或完善剧本内容。"
            />
            <div className="mt-6 text-center text-muted-foreground">
                内容审核功能开发中...
            </div>
        </div>
    );
}

// 3. 资产管理面板
function AssetsPanel({
    project,
    onSave
}: {
    project: Project;
    onSave: (updates: Partial<Project>) => void;
}) {
    const [activeTab, setActiveTab] = useState<"characters" | "scenes" | "props">("characters");

    return (
        <div className="mx-auto max-w-6xl">
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as typeof activeTab)}
                items={[
                    {
                        key: "characters",
                        label: `角色 (${project.characters.length})`,
                        children: <CharactersList project={project} onSave={onSave} />,
                    },
                    {
                        key: "scenes",
                        label: `场景 (${project.scenes.length})`,
                        children: <ScenesList project={project} onSave={onSave} />,
                    },
                    {
                        key: "props",
                        label: `道具 (${project.props.length})`,
                        children: <PropsList project={project} onSave={onSave} />,
                    },
                ]}
            />
        </div>
    );
}

// 角色列表
function CharactersList({ project, onSave }: { project: Project; onSave: (updates: Partial<Project>) => void }) {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingChar, setEditingChar] = useState<Character | null>(null);
    const [form] = Form.useForm();

    const handleAdd = () => {
        setEditingChar(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleSave = () => {
        form.validateFields().then((values) => {
            if (editingChar) {
                // 编辑
                const updated = project.characters.map(c =>
                    c.id === editingChar.id ? { ...c, ...values } : c
                );
                onSave({ characters: updated });
            } else {
                // 新增
                const newChar: Character = {
                    id: `char_${Date.now()}`,
                    ...values,
                };
                onSave({ characters: [...project.characters, newChar] });
            }
            setModalVisible(false);
        });
    };

    const handleDelete = (id: string) => {
        onSave({ characters: project.characters.filter(c => c.id !== id) });
    };

    return (
        <div>
            <div className="mb-4 flex justify-between">
                <span className="text-sm text-muted-foreground">
                    暂无本剧角色库记录，可在素材库中导入或手动添加
                </span>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAdd}>
                    添加角色
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {project.characters.map((char) => (
                    <div key={char.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-2 text-base font-semibold">{char.name}</div>
                        <div className="mb-4 text-sm text-muted-foreground">
                            {char.description || "暂无描述"}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="small"
                                icon={<Edit2 className="size-3" />}
                                onClick={() => {
                                    setEditingChar(char);
                                    form.setFieldsValue(char);
                                    setModalVisible(true);
                                }}
                            >
                                编辑
                            </Button>
                            <Button
                                size="small"
                                danger
                                icon={<Trash2 className="size-3" />}
                                onClick={() => handleDelete(char.id)}
                            >
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal
                title={editingChar ? "编辑角色" : "添加角色"}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="角色名称" name="name" rules={[{ required: true }]}>
                        <Input placeholder="角色名称" />
                    </Form.Item>
                    <Form.Item label="角色描述" name="description">
                        <TextArea rows={4} placeholder="角色特征、性格等" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

// 场景列表
function ScenesList({ project, onSave }: { project: Project; onSave: (updates: Partial<Project>) => void }) {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingScene, setEditingScene] = useState<Scene | null>(null);
    const [form] = Form.useForm();

    const handleAdd = () => {
        setEditingScene(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (scene: Scene) => {
        setEditingScene(scene);
        form.setFieldsValue(scene);
        setModalVisible(true);
    };

    const handleSave = () => {
        form.validateFields().then((values) => {
            if (editingScene) {
                // 编辑
                const updated = project.scenes.map(s =>
                    s.id === editingScene.id ? { ...s, ...values } : s
                );
                onSave({ scenes: updated });
            } else {
                // 新增
                const newScene: Scene = {
                    id: `scene_${Date.now()}`,
                    ...values,
                };
                onSave({ scenes: [...project.scenes, newScene] });
            }
            setModalVisible(false);
        });
    };

    const handleDelete = (id: string) => {
        Modal.confirm({
            title: "确认删除",
            content: "确定要删除这个场景吗？",
            onOk: () => {
                onSave({ scenes: project.scenes.filter(s => s.id !== id) });
            },
        });
    };

    return (
        <div>
            <div className="mb-4 flex justify-between">
                <span className="text-sm text-muted-foreground">
                    暂无本剧场景库记录，可在素材库中导入或手动添加
                </span>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAdd}>
                    添加场景
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {project.scenes.map((scene) => (
                    <div key={scene.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-2 text-base font-semibold">{scene.location}</div>
                        <div className="mb-1 text-xs text-muted-foreground">
                            {scene.time || "未设置时间"}
                        </div>
                        <div className="mb-4 text-sm text-muted-foreground">
                            {scene.description || "暂无描述"}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="small"
                                icon={<Edit2 className="size-3" />}
                                onClick={() => handleEdit(scene)}
                            >
                                编辑
                            </Button>
                            <Button
                                size="small"
                                danger
                                icon={<Trash2 className="size-3" />}
                                onClick={() => handleDelete(scene.id)}
                            >
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal
                title={editingScene ? "编辑场景" : "添加场景"}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="场景地点" name="location" rules={[{ required: true }]}>
                        <Input placeholder="例如：公园、咖啡厅、办公室" />
                    </Form.Item>
                    <Form.Item label="时间" name="time">
                        <Input placeholder="例如：清晨、午后、夜晚" />
                    </Form.Item>
                    <Form.Item label="场景描述" name="description">
                        <TextArea rows={4} placeholder="场景特征、氛围、细节等" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

// 道具列表
function PropsList({ project, onSave }: { project: Project; onSave: (updates: Partial<Project>) => void }) {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingProp, setEditingProp] = useState<Prop | null>(null);
    const [form] = Form.useForm();

    const handleAdd = () => {
        setEditingProp(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (prop: Prop) => {
        setEditingProp(prop);
        form.setFieldsValue(prop);
        setModalVisible(true);
    };

    const handleSave = () => {
        form.validateFields().then((values) => {
            if (editingProp) {
                // 编辑
                const updated = project.props.map(p =>
                    p.id === editingProp.id ? { ...p, ...values } : p
                );
                onSave({ props: updated });
            } else {
                // 新增
                const newProp: Prop = {
                    id: `prop_${Date.now()}`,
                    ...values,
                };
                onSave({ props: [...project.props, newProp] });
            }
            setModalVisible(false);
        });
    };

    const handleDelete = (id: string) => {
        Modal.confirm({
            title: "确认删除",
            content: "确定要删除这个道具吗？",
            onOk: () => {
                onSave({ props: project.props.filter(p => p.id !== id) });
            },
        });
    };

    return (
        <div>
            <div className="mb-4 flex justify-between">
                <span className="text-sm text-muted-foreground">
                    暂无本剧道具库记录，可在素材库中导入或手动添加
                </span>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAdd}>
                    添加道具
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {project.props.map((prop) => (
                    <div key={prop.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-2 text-base font-semibold">{prop.name}</div>
                        <div className="mb-4 text-sm text-muted-foreground">
                            {prop.description || "暂无描述"}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="small"
                                icon={<Edit2 className="size-3" />}
                                onClick={() => handleEdit(prop)}
                            >
                                编辑
                            </Button>
                            <Button
                                size="small"
                                danger
                                icon={<Trash2 className="size-3" />}
                                onClick={() => handleDelete(prop.id)}
                            >
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal
                title={editingProp ? "编辑道具" : "添加道具"}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="道具名称" name="name" rules={[{ required: true }]}>
                        <Input placeholder="例如：手机、钥匙、笔记本" />
                    </Form.Item>
                    <Form.Item label="道具描述" name="description">
                        <TextArea rows={4} placeholder="道具外观、用途、特点等" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

// 4. 分镜面板
function StoryboardPanel({
    project,
    episode,
    onSave
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: Partial<Project>) => void;
}) {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingShot, setEditingShot] = useState<Shot | null>(null);
    const [form] = Form.useForm();

    // 筛选当前集的分镜
    const episodeShots = episode
        ? project.shots.filter(s => s.episodeId === episode.id).sort((a, b) => a.shotNumber - b.shotNumber)
        : [];

    const handleAdd = () => {
        setEditingShot(null);
        form.resetFields();
        form.setFieldsValue({
            episodeId: episode?.id,
            shotNumber: episodeShots.length + 1,
            duration: 3,
            characterIds: [],
            status: "draft",
        });
        setModalVisible(true);
    };

    const handleEdit = (shot: Shot) => {
        setEditingShot(shot);
        form.setFieldsValue(shot);
        setModalVisible(true);
    };

    const handleSave = () => {
        form.validateFields().then((values) => {
            if (editingShot) {
                // 编辑
                const updated = project.shots.map(s =>
                    s.id === editingShot.id ? { ...s, ...values } : s
                );
                onSave({ shots: updated });
            } else {
                // 新增
                const newShot: Shot = {
                    id: `shot_${Date.now()}`,
                    ...values,
                };
                onSave({ shots: [...project.shots, newShot] });
            }
            setModalVisible(false);
            messageApi.success(editingShot ? "分镜已更新" : "分镜已添加");
        });
    };

    const handleDelete = (id: string) => {
        Modal.confirm({
            title: "确认删除",
            content: "确定要删除这个分镜吗？",
            onOk: () => {
                onSave({ shots: project.shots.filter(s => s.id !== id) });
                messageApi.success("分镜已删除");
            },
        });
    };

    const getSceneName = (sceneId?: string) => {
        if (!sceneId) return "未设置";
        const scene = project.scenes.find(s => s.id === sceneId);
        return scene?.location || "未知场景";
    };

    const getCharacterNames = (characterIds: string[]) => {
        if (!characterIds || characterIds.length === 0) return "无角色";
        return characterIds.map(id => {
            const char = project.characters.find(c => c.id === id);
            return char?.name || "未知";
        }).join(", ");
    };

    // 生成图片
    const handleGenerateImage = async (shot: Shot) => {
        try {
            messageApi.loading({ content: "正在生成图片...", key: shot.id });

            const prompt = shot.imagePrompt || shot.script;
            const response = await fetch("/api/image-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    aspectRatio: project.aspectRatio || "16:9",
                }),
            });

            const data = await response.json();

            if (data.task) {
                // 轮询任务状态
                pollImageTask(data.task.id, shot);
            } else {
                throw new Error(data.error || "生成失败");
            }
        } catch (err) {
            messageApi.error({ content: err instanceof Error ? err.message : "生成图片失败", key: shot.id });
        }
    };

    // 轮询图片任务
    const pollImageTask = async (taskId: string, shot: Shot) => {
        const maxAttempts = 60; // 最多轮询60次（5分钟）
        let attempts = 0;

        const poll = async () => {
            try {
                const response = await fetch(`/api/image-tasks/${taskId}`);
                const data = await response.json();

                if (data.task?.status === "completed" && data.task.result?.url) {
                    // 更新分镜
                    const updated = project.shots.map(s =>
                        s.id === shot.id
                            ? { ...s, imageUrl: data.task.result.url, status: "image_generated" as const }
                            : s
                    );
                    onSave({ shots: updated });
                    messageApi.success({ content: "图片生成成功", key: shot.id });
                } else if (data.task?.status === "failed") {
                    throw new Error("图片生成失败");
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(poll, 5000); // 5秒后再次轮询
                } else {
                    throw new Error("生成超时");
                }
            } catch (err) {
                messageApi.error({ content: err instanceof Error ? err.message : "生成失败", key: shot.id });
            }
        };

        poll();
    };

    // 生成视频
    const handleGenerateVideo = async (shot: Shot) => {
        try {
            messageApi.loading({ content: "正在生成视频...", key: shot.id });

            const response = await fetch("/api/video-generation-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageUrl: shot.imageUrl,
                    prompt: shot.script,
                    videoSeconds: shot.duration || 3,
                }),
            });

            const data = await response.json();

            if (data.task) {
                // 轮询任务状态
                pollVideoTask(data.task.id, shot);
            } else {
                throw new Error(data.error || "生成失败");
            }
        } catch (err) {
            messageApi.error({ content: err instanceof Error ? err.message : "生成视频失败", key: shot.id });
        }
    };

    // 轮询视频任务
    const pollVideoTask = async (taskId: string, shot: Shot) => {
        const maxAttempts = 120; // 最多轮询120次（10分钟）
        let attempts = 0;

        const poll = async () => {
            try {
                const response = await fetch(`/api/video-generation-tasks/${taskId}`);
                const data = await response.json();

                if (data.task?.status === "completed" && data.task.result?.url) {
                    // 更新分镜
                    const updated = project.shots.map(s =>
                        s.id === shot.id
                            ? { ...s, videoUrl: data.task.result.url, status: "video_generated" as const }
                            : s
                    );
                    onSave({ shots: updated });
                    messageApi.success({ content: "视频生成成功", key: shot.id });
                } else if (data.task?.status === "failed") {
                    throw new Error("视频生成失败");
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(poll, 5000); // 5秒后再次轮询
                } else {
                    throw new Error("生成超时");
                }
            } catch (err) {
                messageApi.error({ content: err instanceof Error ? err.message : "生成失败", key: shot.id });
            }
        };

        poll();
    };

    if (!episode) {
        return <div className="text-center text-muted-foreground">请先选择一个剧集</div>;
    }

    return (
        <div className="mx-auto max-w-6xl">
            <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    当前集共 {episodeShots.length} 个分镜
                </div>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAdd}>
                    添加分镜
                </Button>
            </div>

            <div className="space-y-3">
                {episodeShots.map((shot) => (
                    <div id={`storyboard-shot-${shot.id}`} key={shot.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-3 flex items-start justify-between">
                            <div className="flex-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <span className="text-base font-semibold">分镜 {shot.shotNumber}</span>
                                    {shot.status === "image_generated" && (
                                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                            已生图
                                        </span>
                                    )}
                                    {shot.status === "video_generated" && (
                                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                            已生视频
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    场景: {getSceneName(shot.sceneId)} · 角色: {getCharacterNames(shot.characterIds)} · 时长: {shot.duration}s
                                    {shot.cameraAngle && ` · 镜头: ${shot.cameraAngle}`}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="small"
                                    icon={<Edit2 className="size-3" />}
                                    onClick={() => handleEdit(shot)}
                                >
                                    编辑
                                </Button>
                                <Button
                                    size="small"
                                    danger
                                    icon={<Trash2 className="size-3" />}
                                    onClick={() => handleDelete(shot.id)}
                                >
                                    删除
                                </Button>
                            </div>
                        </div>

                        <div className="mb-2 text-sm">{shot.script}</div>

                        {shot.imagePrompt && (
                            <div className="mt-2 rounded bg-muted p-2 text-xs text-muted-foreground">
                                <span className="font-semibold">图片提示词: </span>
                                {shot.imagePrompt}
                            </div>
                        )}

                        <div className="mt-3 flex gap-2">
                            {!shot.imageUrl && (
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Sparkles className="size-3" />}
                                    onClick={() => handleGenerateImage(shot)}
                                >
                                    生成图片
                                </Button>
                            )}
                            {shot.imageUrl && shot.status !== "video_generated" && (
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Film className="size-3" />}
                                    onClick={() => handleGenerateVideo(shot)}
                                >
                                    生成视频
                                </Button>
                            )}
                        </div>

                        {shot.imageUrl && (
                            <div className="mt-3">
                                <img
                                    src={shot.imageUrl}
                                    alt={`分镜 ${shot.shotNumber}`}
                                    className="max-h-48 rounded border"
                                />
                            </div>
                        )}

                        {shot.videoUrl && (
                            <div className="mt-3">
                                <video
                                    src={shot.videoUrl}
                                    controls
                                    className="max-h-48 rounded border"
                                />
                            </div>
                        )}
                    </div>
                ))}

                {episodeShots.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                        暂无分镜，点击"添加分镜"开始创作
                    </div>
                )}
            </div>

            <Modal
                title={editingShot ? "编辑分镜" : "添加分镜"}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
                width={600}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="episodeId" hidden>
                        <Input />
                    </Form.Item>

                    <Form.Item label="分镜序号" name="shotNumber" rules={[{ required: true }]}>
                        <Input type="number" placeholder="例如: 1, 2, 3..." />
                    </Form.Item>

                    <Form.Item label="场景" name="sceneId">
                        <Select
                            placeholder="选择场景"
                            allowClear
                        >
                            {project.scenes.map(scene => (
                                <Option key={scene.id} value={scene.id}>
                                    {scene.location} {scene.time ? `(${scene.time})` : ""}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="出场角色" name="characterIds">
                        <Select
                            mode="multiple"
                            placeholder="选择角色"
                            allowClear
                        >
                            {project.characters.map(char => (
                                <Option key={char.id} value={char.id}>
                                    {char.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="分镜台词/描述" name="script" rules={[{ required: true }]}>
                        <TextArea rows={4} placeholder="描述这一镜要表现的内容、台词、动作等" />
                    </Form.Item>

                    <Form.Item label="镜头角度" name="cameraAngle">
                        <Select placeholder="选择镜头角度" allowClear>
                            <Option value="特写">特写</Option>
                            <Option value="中景">中景</Option>
                            <Option value="全景">全景</Option>
                            <Option value="过肩">过肩</Option>
                            <Option value="主观视角">主观视角</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item label="时长(秒)" name="duration" rules={[{ required: true }]}>
                        <Input type="number" placeholder="例如: 3" />
                    </Form.Item>

                    <Form.Item label="图片提示词" name="imagePrompt">
                        <TextArea rows={3} placeholder="用于 AI 生成图片的提示词（可选）" />
                    </Form.Item>

                    <Form.Item label="状态" name="status">
                        <Select>
                            <Option value="draft">草稿</Option>
                            <Option value="image_generated">已生图</Option>
                            <Option value="video_generated">已生视频</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

// 5. 生成面板
function GeneratePanel({ project, episode }: { project: Project; episode?: Episode }) {
    return (
        <div className="mx-auto max-w-6xl text-center text-muted-foreground">
            镜头生成功能开发中...
        </div>
    );
}

// 6. 导出面板
function ExportPanel({ project, episode }: { project: Project; episode?: Episode }) {
    const [draftPath, setDraftPath] = useState("");
    const [jianyingVersion, setJianyingVersion] = useState<"5" | "6">("6");
    const [exporting, setExporting] = useState(false);

    if (!episode) {
        return (
            <div className="mx-auto max-w-2xl space-y-6 p-8">
                <Alert type="warning" showIcon>
                    请先选择一个剧集
                </Alert>
            </div>
        );
    }

    const episodeShots = project.shots?.filter((shot) => shot.episodeId === episode.id) || [];
    const videoShots = episodeShots.filter((shot) => shot.videoUrl);

    const handleExport = async () => {
        if (!draftPath.trim()) {
            messageApi.error("请输入剪映草稿文件夹路径");
            return;
        }

        if (!videoShots.length) {
            messageApi.error("当前剧集没有可导出的视频");
            return;
        }

        try {
            setExporting(true);
            const response = await fetch(`/api/drama-lab/projects/${project.id}/export-jianying`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeId: episode.id,
                    draftPath: draftPath.trim(),
                    version: jianyingVersion,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.msg || "导出失败");
            }

            // 下载文件
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project.title}_${episode.title}_剪映草稿.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            messageApi.success("导出成功！");
        } catch (error) {
            console.error("Export failed:", error);
            messageApi.error(error instanceof Error ? error.message : "导出失败");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-8">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">导出剪映草稿</h2>
                <p className="text-sm text-muted-foreground">
                    将当前剧集的所有分镜视频导出为剪映草稿，可直接在剪映中打开继续编辑
                </p>
            </div>

            {/* 剧集信息 */}
            <div className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">{episode.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {project.title}
                        </p>
                    </div>
                    <div className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                        {videoShots.length} 个分镜
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-border pt-4">
                    <div>
                        <div className="text-xs text-muted-foreground">总时长</div>
                        <div className="mt-1 text-sm font-medium">
                            {Math.round(episodeShots.reduce((sum, shot) => sum + (shot.duration || 0), 0))}秒
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">画面比例</div>
                        <div className="mt-1 text-sm font-medium">{project.aspectRatio || "16:9"}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">视频分镜</div>
                        <div className="mt-1 text-sm font-medium">{videoShots.length} / {episodeShots.length}</div>
                    </div>
                </div>
            </div>

            {/* 导出设置 */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-6">
                <h3 className="font-semibold">导出设置</h3>

                {/* 剪映版本 */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">剪映版本</label>
                    <Radio.Group
                        value={jianyingVersion}
                        onChange={(e) => setJianyingVersion(e.target.value)}
                    >
                        <Radio value="6">剪映专业版 6.x（推荐）</Radio>
                        <Radio value="5">剪映专业版 5.x</Radio>
                    </Radio.Group>
                </div>

                {/* 草稿路径 */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">
                        剪映草稿文件夹路径 <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={draftPath}
                        onChange={(e) => setDraftPath(e.target.value)}
                        placeholder="例如: C:\Users\YourName\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft"
                        className="font-mono text-sm"
                    />
                    <div className="text-xs text-muted-foreground">
                        Windows 示例: C:\Users\用户名\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft
                        <br />
                        Mac 示例: /Users/用户名/Movies/JianyingPro/User Data/Projects/com.lveditor.draft
                    </div>
                </div>
            </div>

            {/* 警告提示 */}
            {videoShots.length === 0 && (
                <Alert
                    type="warning"
                    message="当前剧集没有可导出的视频"
                    description="请先生成分镜视频后再导出"
                    showIcon
                />
            )}

            {videoShots.length > 0 && videoShots.length < episodeShots.length && (
                <Alert
                    type="info"
                    message={`还有 ${episodeShots.length - videoShots.length} 个分镜未生成视频`}
                    description="只会导出已生成视频的分镜"
                    showIcon
                />
            )}

            {/* 导出按钮 */}
            <div className="flex justify-end gap-3">
                <Button
                    type="primary"
                    size="large"
                    icon={<Download className="size-4" />}
                    loading={exporting}
                    disabled={videoShots.length === 0}
                    onClick={handleExport}
                >
                    {exporting ? "导出中..." : "导出剪映草稿"}
                </Button>
            </div>

            {/* 使用说明 */}
            <div className="rounded-lg border border-border bg-muted/50 p-6">
                <h4 className="mb-3 font-semibold">📖 使用说明</h4>
                <ol className="space-y-2 text-sm text-muted-foreground">
                    <li>1. 确保已安装剪映专业版（Windows/Mac）</li>
                    <li>2. 填写剪映草稿文件夹的绝对路径（可在剪映设置中查看）</li>
                    <li>3. 点击「导出剪映草稿」按钮，下载 ZIP 文件</li>
                    <li>4. 解压 ZIP 文件到剪映草稿文件夹</li>
                    <li>5. 打开剪映专业版，在草稿列表中找到导出的项目</li>
                    <li>6. 在剪映中继续编辑、添加特效、配音等</li>
                </ol>
            </div>
        </div>
    );
}
