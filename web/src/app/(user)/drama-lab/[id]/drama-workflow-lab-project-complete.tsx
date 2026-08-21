"use client";

import { Alert, Button, Drawer, Spin, Tabs, Input, Select, Form, List, Modal, message, Switch, Upload, Radio } from "antd";
import {
    ArrowLeft,
    Plus,
    Save,
    Trash2,
    Edit2,
    FileText,
    Users,
    MapPin,
    Package,
    Film,
    Download,
    Sparkles,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    ChevronDown,
    ChevronRight,
    LibraryBig,
    CheckCircle2,
    AlertCircle,
    LoaderCircle,
    Send,
    GitPullRequest,
    ShieldCheck,
    MessageSquare,
    LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Asset } from "@/lib/library-asset-contract";
import { createImageGenerationTask, waitForImageGenerationTask } from "@/services/api/image";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";
import { DramaLabVisualAssetsPanel, dramaLabShotPrompt, dramaLabShotReferenceImages } from "./drama-lab-visual-assets-panel";

const { TextArea } = Input;
const { Option } = Select;

// 步骤定义
const WORKFLOW_STEPS = [
    { key: "script", label: "剧本", icon: FileText },
    { key: "assets", label: "资产准备", icon: Users },
    { key: "storyboard", label: "分镜", icon: Film },
    { key: "generate", label: "镜头生成", icon: Film },
    { key: "review", label: "内容审核", icon: FileText },
    { key: "export", label: "成片导出", icon: Download },
] as const;

type StepKey = (typeof WORKFLOW_STEPS)[number]["key"];

type SaveOptions = { silent?: boolean };

type CollaborationStageKey = "script" | "asset_prompts" | "visual_images" | "storyboard_video" | "final_cut";
type CollaborationApprovalStatus = "draft" | "submitted" | "approved" | "returned" | "requires_confirmation";
type CollaborationFeedback = { id: string; stage: CollaborationStageKey; content: string; createdAt: string };

const COLLABORATION_STAGES: Array<{ key: CollaborationStageKey; label: string; step: StepKey; description: string }> = [
    { key: "script", label: "剧本审核", step: "script", description: "故事梗概、分集剧本与人物情节表达" },
    { key: "asset_prompts", label: "资产提示词审核", step: "assets", description: "角色、场景、道具及分镜提示词" },
    { key: "visual_images", label: "视觉图片审核", step: "storyboard", description: "资产图片与分镜图片的一致性" },
    { key: "storyboard_video", label: "分镜视频审核", step: "generate", description: "镜头视频、节奏与动作衔接" },
    { key: "final_cut", label: "成片审核", step: "export", description: "导出前的最终成片版本" },
];

const COLLABORATION_STATUS_STYLE: Record<CollaborationApprovalStatus, { label: string; className: string }> = {
    draft: { label: "待提交", className: "border-border bg-muted text-muted-foreground" },
    submitted: { label: "审核中", className: "border-sky-300 bg-sky-50 text-sky-800" },
    approved: { label: "已通过", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
    returned: { label: "已打回", className: "border-rose-300 bg-rose-50 text-rose-800" },
    requires_confirmation: { label: "需确认版本", className: "border-amber-300 bg-amber-50 text-amber-800" },
};

export interface Episode {
    id: string;
    title: string;
    number: number;
    script: string;
    status?: string;
}

export interface Character {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    references?: DramaLabAssetReference[];
    primaryReferenceId?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
    profile?: DramaLabAssetProfile;
}

export interface Scene {
    id: string;
    location: string;
    name?: string;
    time?: string;
    description?: string;
    imageUrl?: string;
    references?: DramaLabAssetReference[];
    primaryReferenceId?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
    profile?: DramaLabAssetProfile;
}

export interface Prop {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    references?: DramaLabAssetReference[];
    primaryReferenceId?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
    profile?: DramaLabAssetProfile;
}

export type DramaLabAssetReference = {
    id: string;
    url: string;
    storageKey?: string;
    source: "upload" | "generated" | "library";
    label: string;
    width?: number;
    height?: number;
    createdAt: string;
};

export type DramaLabAssetProfile = {
    visualIdentity: string;
    styling: string;
    colorPalette: string;
    consistencyRules: string;
};

export interface Shot {
    id: string;
    episodeId: string;
    shotNumber: number;
    sceneId?: string;
    characterIds: string[];
    propIds: string[];
    script: string;
    imagePrompt?: string;
    imageUrl?: string;
    videoUrl?: string;
    duration: number;
    cameraAngle?: string;
    status: "draft" | "image_generated" | "video_generated";
}

export interface Project {
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

interface ScriptLibraryProject {
    id: string;
    title: string;
    summary: string;
    episodeCount: number;
    updatedAt?: string;
}

function normalizeEpisodes(value: unknown): Episode[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const episode = item as Record<string, unknown>;
        const id = typeof episode.id === "string" ? episode.id : "";
        if (!id) return [];
        return [
            {
                id,
                title: typeof episode.title === "string" && episode.title.trim() ? episode.title : `第 ${index + 1} 集`,
                number: typeof episode.number === "number" && Number.isFinite(episode.number) ? episode.number : index + 1,
                script: typeof episode.script === "string" ? episode.script : "",
                status: typeof episode.status === "string" ? episode.status : undefined,
            },
        ];
    });
}

function normalizeScenes(value: unknown): Scene[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const scene = item as Record<string, unknown>;
        const id = typeof scene.id === "string" ? scene.id : "";
        const location = typeof scene.location === "string" ? scene.location : typeof scene.name === "string" ? scene.name : "";
        if (!id || !location) return [];
        return [
            {
                id,
                location,
                name: typeof scene.name === "string" ? scene.name : location,
                time: typeof scene.time === "string" ? scene.time : undefined,
                description: typeof scene.description === "string" ? scene.description : undefined,
                imageUrl: typeof scene.imageUrl === "string" ? scene.imageUrl : typeof scene.referenceImageUrl === "string" ? scene.referenceImageUrl : undefined,
                references: Array.isArray(scene.references) ? (scene.references as DramaLabAssetReference[]) : undefined,
                primaryReferenceId: typeof scene.primaryReferenceId === "string" ? scene.primaryReferenceId : undefined,
                referenceImageUrl: typeof scene.referenceImageUrl === "string" ? scene.referenceImageUrl : undefined,
                referenceStorageKey: typeof scene.referenceStorageKey === "string" ? scene.referenceStorageKey : undefined,
                profile: scene.profile && typeof scene.profile === "object" ? (scene.profile as DramaLabAssetProfile) : undefined,
            },
        ];
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
        propIds: Array.isArray(shot.propIds) ? shot.propIds.filter((item): item is string => typeof item === "string") : [],
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

export function DramaWorkflowLabProject({ projectId, initialEpisodeId }: { projectId: string; initialEpisodeId?: string }) {
    const [messageApi, contextHolder] = message.useMessage();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [activeStep, setActiveStep] = useState<StepKey>("script");
    const [activeEpisodeId, setActiveEpisodeId] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [expandedEpisodeIds, setExpandedEpisodeIds] = useState<Set<string>>(new Set());
    const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
    const [collaborationEnabled, setCollaborationEnabled] = useState(true);
    const [collaborationMode, setCollaborationMode] = useState<"strict" | "parallel">("strict");
    const [collaborationCollapsed, setCollaborationCollapsed] = useState(false);
    const [collaborationDrawerOpen, setCollaborationDrawerOpen] = useState(false);
    const [approvalStages, setApprovalStages] = useState<Record<CollaborationStageKey, boolean>>({
        script: true,
        asset_prompts: true,
        visual_images: true,
        storyboard_video: true,
        final_cut: true,
    });
    const [approvalStatuses, setApprovalStatuses] = useState<Record<CollaborationStageKey, CollaborationApprovalStatus>>({
        script: "draft",
        asset_prompts: "draft",
        visual_images: "draft",
        storyboard_video: "draft",
        final_cut: "draft",
    });
    const [feedbackRequired, setFeedbackRequired] = useState(true);
    const [notifyOnReturn, setNotifyOnReturn] = useState(true);
    const [allowFeedbackAttachments, setAllowFeedbackAttachments] = useState(false);
    const [collaborationFeedback, setCollaborationFeedback] = useState<CollaborationFeedback[]>([]);
    const pendingStoryboardShotId = useRef<string | undefined>(undefined);

    const replaceEpisodeShots = useCallback((episodeId: string, shots: Shot[]) => {
        setProject((current) => {
            if (!current) return current;
            return { ...current, shots: [...current.shots.filter((shot) => shot.episodeId !== episodeId), ...shots] };
        });
    }, []);

    // 加载项目数据
    const loadProject = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
        try {
            const response = await fetch(`/api/drama-lab/projects/${projectId}`, { signal: controller.signal });
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
                characters: (proj.characters ?? legacy.characters ?? []) as Character[],
                scenes: normalizeScenes(proj.scenes ?? legacy.scenes),
                props: (proj.props ?? legacy.props ?? []) as Prop[],
                shots: normalizeProjectShots(proj as Record<string, unknown>, episodes, legacy),
            });

            if (episodes.length > 0) {
                setActiveEpisodeId(initialEpisodeId || episodes[0].id);
            }
            setExpandedEpisodeIds(new Set(episodes.map((episode: Episode) => episode.id)));
        } catch (err) {
            setError(err instanceof DOMException && err.name === "AbortError" ? "项目加载超时，请重试" : err instanceof Error ? err.message : "加载失败");
        } finally {
            window.clearTimeout(timeoutId);
            setLoading(false);
        }
    }, [initialEpisodeId, projectId]);

    useEffect(() => {
        void loadProject();
    }, [loadProject]);

    useEffect(() => {
        if (activeStep !== "storyboard" || !pendingStoryboardShotId.current) return;
        document.getElementById(`storyboard-shot-${pendingStoryboardShotId.current}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        pendingStoryboardShotId.current = undefined;
    }, [activeEpisodeId, activeStep]);

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
            setProject((current) => (current ? { ...current, ...updates } : current));
            return true;
        } catch (err) {
            if (!options.silent) messageApi.error({ content: err instanceof Error ? err.message : "保存失败", key: "drama-project-save" });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const activeEpisode = project?.episodes.find((ep) => ep.id === activeEpisodeId);
    const locateStoryboardShot = (episodeId: string, shotId: string) => {
        pendingStoryboardShotId.current = shotId;
        setActiveEpisodeId(episodeId);
        setActiveStep("storyboard");
    };
    const activeCollaborationStage = COLLABORATION_STAGES.find((stage) => stage.step === activeStep);
    const stageApprovalBlock = (stageKey: CollaborationStageKey) => {
        if (!collaborationEnabled || collaborationMode !== "strict") return undefined;
        const stageIndex = COLLABORATION_STAGES.findIndex((stage) => stage.key === stageKey);
        const blockedBy = COLLABORATION_STAGES.slice(0, stageIndex).find((stage) => approvalStages[stage.key] && approvalStatuses[stage.key] !== "approved");
        return blockedBy ? `${blockedBy.label}尚未通过，严格审批模式下不能继续提交。` : undefined;
    };
    const setApprovalStageEnabled = (stageKey: CollaborationStageKey, enabled: boolean) => {
        setApprovalStages((current) => ({ ...current, [stageKey]: enabled }));
        if (!enabled) setApprovalStatuses((current) => ({ ...current, [stageKey]: "draft" }));
    };
    const submitForApproval = (stageKey: CollaborationStageKey) => {
        const block = stageApprovalBlock(stageKey);
        if (block) {
            messageApi.warning(block);
            return;
        }
        setApprovalStatuses((current) => ({ ...current, [stageKey]: "submitted" }));
        messageApi.success("已模拟提交审核");
    };
    const approveStage = (stageKey: CollaborationStageKey) => {
        setApprovalStatuses((current) => ({ ...current, [stageKey]: "approved" }));
        messageApi.success("已模拟通过审核");
    };
    const returnStage = (stageKey: CollaborationStageKey, content: string) => {
        const feedback = content.trim();
        if (feedbackRequired && !feedback) {
            messageApi.warning("当前项目要求打回时填写反馈");
            return;
        }
        setApprovalStatuses((current) => {
            const next = { ...current, [stageKey]: "returned" as const };
            if (collaborationMode === "parallel") {
                const stageIndex = COLLABORATION_STAGES.findIndex((stage) => stage.key === stageKey);
                COLLABORATION_STAGES.slice(stageIndex + 1).forEach((stage) => {
                    if (approvalStages[stage.key] && next[stage.key] !== "draft") next[stage.key] = "requires_confirmation";
                });
            }
            return next;
        });
        setCollaborationFeedback((current) => [
            {
                id: `${stageKey}-${Date.now()}`,
                stage: stageKey,
                content: feedback || "请核对当前交付物后重新提交。",
                createdAt: "刚刚",
            },
            ...current,
        ]);
        messageApi.info(notifyOnReturn ? "已模拟打回并提醒负责人" : "已模拟打回");
    };
    const exportBlockedByApproval = collaborationEnabled && COLLABORATION_STAGES.some((stage) => approvalStages[stage.key] && approvalStatuses[stage.key] !== "approved");

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
                    <Alert className="mt-6" type="error" showIcon message={error || "项目不存在"} />
                    <Button className="mt-4" onClick={() => void loadProject()}>
                        重新加载
                    </Button>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-screen flex-col bg-background">
            {contextHolder}
            {workflowModalOpen ? (
                <WorkflowRunModal
                    project={project}
                    activeEpisode={activeEpisode}
                    onClose={() => setWorkflowModalOpen(false)}
                    onStepChange={setActiveStep}
                    getStrictApprovalBlock={(mode) => stageApprovalBlock(mode === "assets" ? "asset_prompts" : mode === "storyboard" ? "visual_images" : "storyboard_video")}
                />
            ) : null}
            <Drawer title="团队协作与审批" placement="right" size="min(380px, calc(100vw - 12px))" open={collaborationDrawerOpen} destroyOnHidden onClose={() => setCollaborationDrawerOpen(false)}>
                <CollaborationPanel
                    activeStage={activeCollaborationStage}
                    collaborationEnabled={collaborationEnabled}
                    collaborationMode={collaborationMode}
                    approvalStages={approvalStages}
                    approvalStatuses={approvalStatuses}
                    feedbackRequired={feedbackRequired}
                    notifyOnReturn={notifyOnReturn}
                    allowFeedbackAttachments={allowFeedbackAttachments}
                    feedback={collaborationFeedback}
                    onCollaborationEnabledChange={setCollaborationEnabled}
                    onCollaborationModeChange={setCollaborationMode}
                    onApprovalStageEnabledChange={setApprovalStageEnabled}
                    onFeedbackRequiredChange={setFeedbackRequired}
                    onNotifyOnReturnChange={setNotifyOnReturn}
                    onAllowFeedbackAttachmentsChange={setAllowFeedbackAttachments}
                    onSubmit={submitForApproval}
                    onApprove={approveStage}
                    onReturn={returnStage}
                />
            </Drawer>
            {/* 顶部导航栏 */}
            <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
                <Link href={`/drama-lab/${encodeURIComponent(projectId)}/outline`} aria-label="返回项目大纲" className="grid size-8 place-items-center rounded border border-border hover:bg-muted">
                    <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-semibold">{project.title}</h1>
                    <p className="truncate text-xs text-muted-foreground">{activeEpisode?.title || `第 ${activeEpisode?.number || 1} 集`}</p>
                </div>
                <Button icon={<Sparkles className="size-4" />} onClick={() => setWorkflowModalOpen(true)}>
                    一键全流程
                </Button>
                <Button className="lg:hidden" type="text" aria-label="打开团队协作与审批" title="打开团队协作与审批" icon={<PanelRightOpen className="size-4" />} onClick={() => setCollaborationDrawerOpen(true)} />
                <Button type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void saveProject({})}>
                    保存草稿
                </Button>
            </header>

            {/* 步骤导航 */}
            <nav className="flex h-14 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-2 sm:justify-center sm:gap-8 sm:px-4">
                {WORKFLOW_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = activeStep === step.key;
                    return (
                        <button
                            key={step.key}
                            onClick={() => setActiveStep(step.key)}
                            className={cn("flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                        >
                            <span className={cn("grid size-6 place-items-center rounded-full border text-xs", isActive ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{index + 1}</span>
                            <span>{step.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* 主内容区 */}
            <div className="flex min-h-0 flex-1">
                {/* 左侧边栏 - 剧集列表 */}
                <aside className={cn("hidden min-h-0 shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex", sidebarCollapsed ? "w-14" : "w-64")}>
                    <div className={cn("flex h-12 items-center border-b border-border", sidebarCollapsed ? "justify-center px-2" : "justify-between px-4")}>
                        {!sidebarCollapsed ? (
                            <span className="text-sm font-semibold">
                                剧集 <span className="text-muted-foreground">{project.episodes.length}</span>
                            </span>
                        ) : null}
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
                                    <div className={cn("flex min-w-0 items-center rounded text-sm transition-colors", isActive ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
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
                                        ) : !sidebarCollapsed ? (
                                            <span className="size-8 shrink-0" aria-hidden />
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => setActiveEpisodeId(ep.id)}
                                            title={sidebarCollapsed ? ep.title : undefined}
                                            className={cn("min-w-0 flex-1 rounded py-2 text-left transition-colors", sidebarCollapsed ? "px-1 text-center" : "pr-2")}
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
                        <Button type="text" block={!sidebarCollapsed} size="small" aria-label="新增剧集" title="新增剧集" className={cn("mt-2", sidebarCollapsed ? "w-full" : "justify-start px-3")} icon={<Plus className="size-4" />} onClick={addEpisode}>
                            {!sidebarCollapsed ? "新增一集" : null}
                        </Button>
                    </div>
                </aside>

                {/* 主编辑区域 */}
                <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <StageCollaborationBanner
                        stage={activeCollaborationStage}
                        collaborationEnabled={collaborationEnabled}
                        status={activeCollaborationStage ? approvalStatuses[activeCollaborationStage.key] : "draft"}
                        approvalEnabled={activeCollaborationStage ? approvalStages[activeCollaborationStage.key] : false}
                        strictApprovalBlock={activeCollaborationStage ? stageApprovalBlock(activeCollaborationStage.key) : undefined}
                        onSubmit={submitForApproval}
                    />
                    {activeStep === "script" && <ScriptEditor project={project} episode={activeEpisode} onSave={saveProject} onActiveEpisodeChange={setActiveEpisodeId} messageApi={messageApi} />}
                    {activeStep === "review" && <ReviewPanel project={project} episode={activeEpisode} onStepChange={setActiveStep} />}
                    {activeStep === "assets" && <DramaLabVisualAssetsPanel project={project} episode={activeEpisode} onSave={saveProject} onLocateShot={locateStoryboardShot} messageApi={messageApi} />}
                    {activeStep === "storyboard" && <StoryboardPanel project={project} episode={activeEpisode} onSave={saveProject} onReplaceEpisodeShots={replaceEpisodeShots} messageApi={messageApi} />}
                    {activeStep === "generate" && <GeneratePanel project={project} episode={activeEpisode} />}
                    {activeStep === "export" && <ExportPanel project={project} episode={activeEpisode} messageApi={messageApi} exportBlockedByApproval={exportBlockedByApproval} />}
                </div>
                <aside className={cn("hidden min-h-0 shrink-0 flex-col border-l border-border bg-card transition-[width] duration-200 lg:flex", collaborationCollapsed ? "w-14" : "w-[340px]")}>
                    <div className={cn("flex h-12 items-center border-b border-border", collaborationCollapsed ? "justify-center px-2" : "justify-between px-4")}>
                        {!collaborationCollapsed ? <span className="text-sm font-semibold">团队协作与审批</span> : null}
                        <Button
                            type="text"
                            size="small"
                            aria-label={collaborationCollapsed ? "展开团队协作与审批" : "收起团队协作与审批"}
                            title={collaborationCollapsed ? "展开团队协作与审批" : "收起团队协作与审批"}
                            icon={collaborationCollapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
                            onClick={() => setCollaborationCollapsed((current) => !current)}
                        />
                    </div>
                    {!collaborationCollapsed ? (
                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                            <CollaborationPanel
                                activeStage={activeCollaborationStage}
                                collaborationEnabled={collaborationEnabled}
                                collaborationMode={collaborationMode}
                                approvalStages={approvalStages}
                                approvalStatuses={approvalStatuses}
                                feedbackRequired={feedbackRequired}
                                notifyOnReturn={notifyOnReturn}
                                allowFeedbackAttachments={allowFeedbackAttachments}
                                feedback={collaborationFeedback}
                                onCollaborationEnabledChange={setCollaborationEnabled}
                                onCollaborationModeChange={setCollaborationMode}
                                onApprovalStageEnabledChange={setApprovalStageEnabled}
                                onFeedbackRequiredChange={setFeedbackRequired}
                                onNotifyOnReturnChange={setNotifyOnReturn}
                                onAllowFeedbackAttachmentsChange={setAllowFeedbackAttachments}
                                onSubmit={submitForApproval}
                                onApprove={approveStage}
                                onReturn={returnStage}
                            />
                        </div>
                    ) : null}
                </aside>
            </div>
        </main>
    );
}

// ========== 子组件 ==========

// 1. 剧本编辑器
function ScriptEditor({
    project,
    episode,
    onSave,
    onActiveEpisodeChange,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: Partial<Project>, options?: SaveOptions) => Promise<boolean>;
    onActiveEpisodeChange: (episodeId: string) => void;
    messageApi: ReturnType<typeof message.useMessage>[0];
}) {
    const [form] = Form.useForm();
    const [scriptForm] = Form.useForm();
    const [activeTab, setActiveTab] = useState<"create" | "select">("create");
    const [generating, setGenerating] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [storyStyle, setStoryStyle] = useState("现代写实");
    const [scriptType, setScriptType] = useState("短剧");
    const [episodeCount, setEpisodeCount] = useState("1");
    const [scriptLibraryOpen, setScriptLibraryOpen] = useState(false);
    const [scriptLibraryLoading, setScriptLibraryLoading] = useState(false);
    const [scriptLibraryImporting, setScriptLibraryImporting] = useState(false);
    const [scriptLibraryProjects, setScriptLibraryProjects] = useState<ScriptLibraryProject[]>([]);
    const [previewEpisodeId, setPreviewEpisodeId] = useState<string>();

    useEffect(() => {
        form.setFieldsValue({
            storyOutline: project.description || "",
        });
        scriptForm.setFieldsValue({ script: episode?.script || "" });
        setPreviewEpisodeId((current) => (current && project.episodes.some((item) => item.id === current) ? current : project.episodes[0]?.id));
    }, [form, scriptForm, project, episode]);

    const saveNow = useCallback(
        (options: SaveOptions = {}) => {
            const values = form.getFieldsValue();
            const script = scriptForm.getFieldValue("script") || "";
            if (episode) {
                const updatedEpisodes = project.episodes.map((ep) => (ep.id === episode.id ? { ...ep, script } : ep));
                return onSave(
                    {
                        description: values.storyOutline || "",
                        episodes: updatedEpisodes,
                    },
                    options,
                );
            }
            return Promise.resolve(false);
        },
        [episode, form, onSave, project, scriptForm],
    );

    const scheduleSave = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setSaveStatus("pending");
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            setSaveStatus("saving");
            void saveNow({ silent: true }).then((saved) => {
                setSaveStatus(saved ? "saved" : "error");
                if (saved) {
                    messageApi.success({ content: "保存成功", key: "drama-autosave", duration: 1.5 });
                } else {
                    messageApi.error({ content: "自动保存失败", key: "drama-autosave", duration: 2 });
                }
            });
        }, 800);
    }, [saveNow]);

    useEffect(
        () => () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        },
        [],
    );

    // AI 生成剧本
    const handleGenerateScript = async () => {
        const values = form.getFieldsValue();
        const storyOutline = typeof values.storyOutline === "string" ? values.storyOutline : "";

        if (!storyOutline || !storyOutline.trim()) {
            messageApi.error("请先输入故事梗概");
            return;
        }

        setGenerating(true);
        try {
            messageApi.loading({ content: "AI 正在生成剧本...", key: "generate-script", duration: 0 });

            if (!episode) throw new Error("请先选择当前剧集");
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/generate-script`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeId: episode.id,
                    storyOutline,
                    storyStyle,
                    scriptType,
                    episodeCount,
                    requestId: `drama-script:${project.id}:${episode.id}:${Date.now()}`,
                }),
            });
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.script) throw new Error(data.msg || "生成失败");
            scriptForm.setFieldsValue({ script: data.data.script });
            const saved = await saveNow();
            if (!saved) throw new Error("保存剧本失败");
            messageApi.success({ content: "剧本生成成功", key: "generate-script", duration: 3 });
        } catch (err) {
            messageApi.error({ content: err instanceof Error ? err.message : "生成剧本失败", key: "generate-script", duration: 3 });
        } finally {
            setGenerating(false);
        }
    };

    const loadScriptLibrary = async () => {
        setScriptLibraryLoading(true);
        try {
            const response = await fetch("/api/drama-lab/projects?page=1&pageSize=100");
            const data = await response.json();
            if (data.code !== 0) throw new Error(data.msg || "剧本库加载失败");
            const projects = Array.isArray(data.data?.projects) ? data.data.projects : [];
            setScriptLibraryProjects(projects.filter((item: ScriptLibraryProject) => item.id !== project.id && item.episodeCount > 0));
        } catch (error) {
            setScriptLibraryProjects([]);
            messageApi.error(error instanceof Error ? error.message : "剧本库加载失败");
        } finally {
            setScriptLibraryLoading(false);
        }
    };

    const handleImportScript = (sourceId: string) => {
        if (scriptLibraryImporting) return;
        Modal.confirm({
            title: "导入剧本到当前项目",
            content: "将只导入所选项目的故事梗概和各集剧本文字，不会导入角色、场景、分镜、图片或视频。是否继续？",
            okText: "导入",
            cancelText: "取消",
            onOk: async () => {
                setScriptLibraryImporting(true);
                try {
                    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(sourceId)}`);
                    const data = await response.json();
                    if (data.code !== 0 || !data.data?.project) throw new Error(data.msg || "剧本加载失败");

                    const source = data.data.project as Record<string, unknown>;
                    const sourceEpisodes = normalizeEpisodes(source.episodes);
                    const sourceSummary = typeof source.summary === "string" ? source.summary : "";
                    if (!sourceEpisodes.some((sourceEpisode) => sourceEpisode.script.trim()) && !sourceSummary.trim()) {
                        throw new Error("所选剧本没有可导入的梗概或分集正文");
                    }

                    const importedEpisodes = sourceEpisodes.map((sourceEpisode, index) => ({
                        ...sourceEpisode,
                        id: project.episodes[index]?.id || `ep_${Date.now()}_${index}`,
                        number: index + 1,
                    }));
                    const saved = await onSave({
                        description: sourceSummary,
                        ...(importedEpisodes.length ? { episodes: importedEpisodes } : {}),
                    });
                    if (!saved) throw new Error("导入剧本保存失败");

                    setScriptLibraryOpen(false);
                    setActiveTab("select");
                    setPreviewEpisodeId(importedEpisodes[0]?.id);
                    if (importedEpisodes[0]) onActiveEpisodeChange(importedEpisodes[0].id);
                    messageApi.success("已导入故事梗概与剧本");
                } catch (error) {
                    messageApi.error(error instanceof Error ? error.message : "导入剧本失败");
                    throw error;
                } finally {
                    setScriptLibraryImporting(false);
                }
            },
        });
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6">
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
                                    <div className="flex flex-col gap-4">
                                        <div className="order-1">
                                            <h2 className="text-xl font-semibold">故事生成</h2>
                                            <p className="mt-2 text-sm text-muted-foreground">输入一段故事梗概，AI 帮你扩展成整集剧本，或直接输入小说章节。</p>
                                        </div>

                                        <Form className="order-2" form={form} layout="vertical" onValuesChange={scheduleSave}>
                                            <Form.Item label="故事梗概" name="storyOutline">
                                                <TextArea rows={5} placeholder="输入一段故事梗概，AI 将根据它生成完整剧本" />
                                            </Form.Item>
                                        </Form>

                                        <Form className="order-5" form={scriptForm} onValuesChange={scheduleSave}>
                                            <Form.Item name="script">
                                                <TextArea
                                                    rows={15}
                                                    placeholder="将描代文学家柳宗元创作的传记文学作品《童区寄传》进行改编。一个发生在唐朝年间的悬疑故事。主人公就是十一岁，名字就叫区寄。可以模仿白夜追凶、催眠大师的套路的心里悬疑片，严格按照 10 节拍表重新整理成一个详细的故事大纲。

暴雨后的山路上，十一岁的区寄独自赶着一头水牛回家。他突然发现林中有两个区寄独自赶往一夜回到。区寄害怕极了，那两人的买卖跟区寄追问：少女饼伤到二十七下后，他终于转变逃走。少女穷极挣扎，让这大师对爹，他们意识，都村民都沾血过往边的刀剑。..."
                                                    className="font-mono text-sm"
                                                />
                                            </Form.Item>
                                        </Form>

                                        <div className="order-3 flex flex-wrap items-center gap-4">
                                            <Select value={storyStyle} onChange={setStoryStyle} style={{ width: 140 }}>
                                                <Option value="现代写实">现代写实</Option>
                                                <Option value="悬疑">悬疑</Option>
                                                <Option value="浪漫">浪漫</Option>
                                                <Option value="动作">动作</Option>
                                            </Select>

                                            <Select value={scriptType} onChange={setScriptType} style={{ width: 140 }}>
                                                <Option value="短剧">短剧</Option>
                                                <Option value="电影">电影</Option>
                                            </Select>

                                            <Input value={episodeCount} onChange={(event) => setEpisodeCount(event.target.value)} placeholder="集数" style={{ width: 100 }} />

                                            <Button type="primary" icon={<Plus className="size-4" />} onClick={handleGenerateScript} loading={generating} disabled={generating}>
                                                {generating ? "生成中..." : "生成剧本"}
                                            </Button>

                                            <Button icon={<Download className="size-4" />}>导入小说</Button>
                                            <div className="ml-auto flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                                                {saveStatus === "pending" ? (
                                                    <>
                                                        <LoaderCircle className="size-3.5 animate-spin" /> 自动保存等待中
                                                    </>
                                                ) : null}
                                                {saveStatus === "saving" ? (
                                                    <>
                                                        <LoaderCircle className="size-3.5 animate-spin" /> 正在自动保存
                                                    </>
                                                ) : null}
                                                {saveStatus === "saved" ? (
                                                    <>
                                                        <CheckCircle2 className="size-3.5 text-emerald-600" /> 已自动保存
                                                    </>
                                                ) : null}
                                                {saveStatus === "error" ? (
                                                    <>
                                                        <AlertCircle className="size-3.5 text-destructive" /> 自动保存失败
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="order-4 border-t border-border pt-4 text-sm text-muted-foreground">
                                            <span className="font-semibold">剧本</span>
                                            <span className="mx-2">·</span>
                                            <span>{episode.script.length} 字</span>
                                        </div>

                                        <Button className="order-6 self-start" onClick={() => void saveNow()}>
                                            保存当前集
                                        </Button>
                                    </div>
                                ),
                            },
                            {
                                key: "select",
                                label: "选择剧本",
                                children: (
                                    <div className="space-y-5">
                                        <p className="text-sm text-muted-foreground">从剧本库选择后，仅把故事梗概与各集剧本文字写入当前项目，不会导入角色、场景、分镜、图片或视频。</p>
                                        <Button
                                            type="primary"
                                            icon={<FileText className="size-4" />}
                                            loading={scriptLibraryLoading}
                                            onClick={() => {
                                                setScriptLibraryOpen(true);
                                                void loadScriptLibrary();
                                            }}
                                        >
                                            从已有剧本中选择…
                                        </Button>

                                        {project.description || project.episodes.length ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <h3 className="mb-2 text-base font-semibold">故事梗概</h3>
                                                    <TextArea value={project.description || ""} readOnly rows={4} />
                                                </div>
                                                {project.episodes.length > 0 && (
                                                    <div>
                                                        <h3 className="mb-2 text-base font-semibold">分集剧本</h3>
                                                        <Tabs
                                                            activeKey={previewEpisodeId || project.episodes[0]?.id}
                                                            onChange={setPreviewEpisodeId}
                                                            items={project.episodes.map((item) => ({
                                                                key: item.id,
                                                                label: item.title || `第 ${item.number} 集`,
                                                                children: <TextArea value={item.script || ""} readOnly rows={14} />,
                                                            }))}
                                                        />
                                                    </div>
                                                )}
                                                <Button onClick={() => setActiveTab("create")}>切换到创作剧本以编辑</Button>
                                            </div>
                                        ) : (
                                            <div className="py-8 text-center text-muted-foreground">尚未选择剧本，请点击上方按钮</div>
                                        )}
                                    </div>
                                ),
                            },
                        ]}
                    />
                    <Modal title="从剧本库导入" open={scriptLibraryOpen} onCancel={() => setScriptLibraryOpen(false)} footer={null} destroyOnHidden>
                        <div className="space-y-2">
                            {scriptLibraryLoading ? (
                                <div className="flex justify-center py-8">
                                    <Spin />
                                </div>
                            ) : scriptLibraryProjects.length > 0 ? (
                                scriptLibraryProjects.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        disabled={scriptLibraryImporting}
                                        className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={() => handleImportScript(item.id)}
                                    >
                                        <div className="font-medium">{item.title || "未命名剧本"}</div>
                                        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary || "暂无简介"}</div>
                                        <div className="mt-2 text-xs text-muted-foreground">{item.episodeCount} 集</div>
                                    </button>
                                ))
                            ) : (
                                <div className="py-8 text-center text-muted-foreground">剧本库为空，请先创建包含剧本的项目</div>
                            )}
                        </div>
                    </Modal>
                </div>
            )}
        </div>
    );
}

type WorkflowRunMode = "assets" | "storyboard" | "video";
type WorkflowRunScope = "current" | "all";

const WORKFLOW_RUN_MODES: Array<{ value: WorkflowRunMode; label: string; description: string }> = [
    { value: "assets", label: "生成到资产", description: "生成角色、场景、道具的提示词与资产准备结果后停止。" },
    { value: "storyboard", label: "生成到分镜图", description: "完成资产、分镜提示词与分镜图后停止。" },
    { value: "video", label: "生成完整视频", description: "继续生成镜头视频，并进入内容审核与可选导出。" },
];

function CollaborationPanel({
    activeStage,
    collaborationEnabled,
    collaborationMode,
    approvalStages,
    approvalStatuses,
    feedbackRequired,
    notifyOnReturn,
    allowFeedbackAttachments,
    feedback,
    onCollaborationEnabledChange,
    onCollaborationModeChange,
    onApprovalStageEnabledChange,
    onFeedbackRequiredChange,
    onNotifyOnReturnChange,
    onAllowFeedbackAttachmentsChange,
    onSubmit,
    onApprove,
    onReturn,
}: {
    activeStage?: (typeof COLLABORATION_STAGES)[number];
    collaborationEnabled: boolean;
    collaborationMode: "strict" | "parallel";
    approvalStages: Record<CollaborationStageKey, boolean>;
    approvalStatuses: Record<CollaborationStageKey, CollaborationApprovalStatus>;
    feedbackRequired: boolean;
    notifyOnReturn: boolean;
    allowFeedbackAttachments: boolean;
    feedback: CollaborationFeedback[];
    onCollaborationEnabledChange: (enabled: boolean) => void;
    onCollaborationModeChange: (mode: "strict" | "parallel") => void;
    onApprovalStageEnabledChange: (stage: CollaborationStageKey, enabled: boolean) => void;
    onFeedbackRequiredChange: (required: boolean) => void;
    onNotifyOnReturnChange: (enabled: boolean) => void;
    onAllowFeedbackAttachmentsChange: (enabled: boolean) => void;
    onSubmit: (stage: CollaborationStageKey) => void;
    onApprove: (stage: CollaborationStageKey) => void;
    onReturn: (stage: CollaborationStageKey, content: string) => void;
}) {
    const [feedbackDraft, setFeedbackDraft] = useState("");

    const handleReturn = (stage: CollaborationStageKey) => {
        onReturn(stage, feedbackDraft);
        setFeedbackDraft("");
    };

    return (
        <div className="space-y-5">
            <section className="border border-border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-primary">
                        <Users className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold">星河短剧项目组</h2>
                            <Switch size="small" checked={collaborationEnabled} onChange={onCollaborationEnabledChange} aria-label="启用团队协作" />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">项目组长可决定审批节点；成员、职责和权限均为本页演示数据。</p>
                        {activeStage ? <p className="mt-1 text-xs text-primary">当前制作阶段：{activeStage.label}</p> : null}
                    </div>
                </div>
                {collaborationEnabled ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => onCollaborationModeChange("strict")}
                            className={cn("border px-2 py-2 text-left text-xs", collaborationMode === "strict" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}
                        >
                            <span className="flex items-center gap-1.5 font-medium">
                                <LockKeyhole className="size-3.5" /> 严格
                            </span>
                            <span className="mt-1 block leading-4">上游通过后再继续</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onCollaborationModeChange("parallel")}
                            className={cn("border px-2 py-2 text-left text-xs", collaborationMode === "parallel" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}
                        >
                            <span className="flex items-center gap-1.5 font-medium">
                                <GitPullRequest className="size-3.5" /> 并行
                            </span>
                            <span className="mt-1 block leading-4">继续制作，版本待确认</span>
                        </button>
                    </div>
                ) : null}
            </section>

            {collaborationEnabled ? (
                <>
                    <section>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">审批配置</h3>
                            <span className="text-xs text-muted-foreground">组长决定</span>
                        </div>
                        <div className="divide-y border border-border">
                            {COLLABORATION_STAGES.map((stage) => {
                                const enabled = approvalStages[stage.key];
                                const status = approvalStatuses[stage.key];
                                return (
                                    <div key={stage.key} className="p-3">
                                        <div className="flex items-start gap-2">
                                            <Switch size="small" checked={enabled} onChange={(checked) => onApprovalStageEnabledChange(stage.key, checked)} aria-label={`启用${stage.label}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">{stage.label}</span>
                                                    {enabled ? <ApprovalStatusTag status={status} /> : <span className="border border-border px-1.5 py-0.5 text-xs text-muted-foreground">未启用</span>}
                                                </div>
                                                <p className="mt-1 text-xs leading-4 text-muted-foreground">{stage.description}</p>
                                            </div>
                                        </div>
                                        {enabled ? (
                                            <div className="mt-2 flex flex-wrap gap-2 pl-7">
                                                {status !== "submitted" && status !== "approved" ? (
                                                    <Button size="small" icon={<Send className="size-3.5" />} onClick={() => onSubmit(stage.key)}>
                                                        {status === "requires_confirmation" ? "确认并提交" : "提交"}
                                                    </Button>
                                                ) : null}
                                                {status === "submitted" ? (
                                                    <Button size="small" type="primary" icon={<ShieldCheck className="size-3.5" />} onClick={() => onApprove(stage.key)}>
                                                        通过
                                                    </Button>
                                                ) : null}
                                                {status === "submitted" ? (
                                                    <Button size="small" icon={<GitPullRequest className="size-3.5" />} onClick={() => handleReturn(stage.key)}>
                                                        打回
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-sm font-semibold">反馈与提醒</h3>
                        <div className="space-y-1 border border-border p-3">
                            <ToggleRow label="打回时必须填写反馈" checked={feedbackRequired} onChange={onFeedbackRequiredChange} />
                            <ToggleRow label="打回后提醒负责人" checked={notifyOnReturn} onChange={onNotifyOnReturnChange} />
                            <ToggleRow label="允许反馈附件" checked={allowFeedbackAttachments} onChange={onAllowFeedbackAttachmentsChange} />
                        </div>
                        <TextArea className="mt-2" value={feedbackDraft} onChange={(event) => setFeedbackDraft(event.target.value)} rows={2} placeholder="填写后可用于模拟打回反馈" />
                    </section>

                    <section>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">项目成员</h3>
                            <span className="text-xs text-muted-foreground">演示</span>
                        </div>
                        <div className="space-y-2 border border-border p-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                                <span>林组长</span>
                                <span className="text-muted-foreground">统筹、审批</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>陈编剧</span>
                                <span className="text-muted-foreground">剧本、资产提示词</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>周制作</span>
                                <span className="text-muted-foreground">视觉图片、分镜视频</span>
                            </div>
                        </div>
                    </section>

                    {feedback.length ? (
                        <section>
                            <h3 className="mb-2 text-sm font-semibold">反馈记录</h3>
                            <div className="space-y-2 border border-border p-3">
                                {feedback.slice(0, 3).map((item) => (
                                    <div key={item.id} className="border-l-2 border-rose-400 pl-2 text-xs">
                                        <p className="font-medium">{COLLABORATION_STAGES.find((stage) => stage.key === item.stage)?.label}</p>
                                        <p className="mt-1 leading-4 text-muted-foreground">{item.content}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                    <Alert type="info" showIcon icon={<MessageSquare className="size-4" />} title="当前为本地协作演示" description="不创建项目组、不发送通知、不上传附件，刷新页面后演示状态会重置。" />
                </>
            ) : (
                <Alert type="info" showIcon title="当前按个人创作处理" description="开启团队协作后，可在此选择审批节点和协作模式。" />
            )}
        </div>
    );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex min-h-9 items-center justify-between gap-3 text-xs">
            <span>{label}</span>
            <Switch size="small" checked={checked} onChange={onChange} aria-label={label} />
        </div>
    );
}

function ApprovalStatusTag({ status }: { status: CollaborationApprovalStatus }) {
    const presentation = COLLABORATION_STATUS_STYLE[status];
    return <span className={cn("border px-1.5 py-0.5 text-xs", presentation.className)}>{presentation.label}</span>;
}

function StageCollaborationBanner({
    stage,
    collaborationEnabled,
    approvalEnabled,
    status,
    strictApprovalBlock,
    onSubmit,
}: {
    stage?: (typeof COLLABORATION_STAGES)[number];
    collaborationEnabled: boolean;
    approvalEnabled: boolean;
    status: CollaborationApprovalStatus;
    strictApprovalBlock?: string;
    onSubmit: (stage: CollaborationStageKey) => void;
}) {
    if (!stage || !collaborationEnabled || !approvalEnabled) return null;
    return (
        <Alert
            className="mx-auto mb-4 max-w-6xl"
            type={strictApprovalBlock ? "warning" : status === "approved" ? "success" : "info"}
            showIcon
            icon={strictApprovalBlock ? <LockKeyhole className="size-4" /> : <GitPullRequest className="size-4" />}
            title={`${stage.label} · ${COLLABORATION_STATUS_STYLE[status].label}`}
            description={strictApprovalBlock || (status === "requires_confirmation" ? "上游版本发生变化，请确认当前成果后重新提交。" : "团队审批为本地前端演示，真实成员与审批记录暂未保存。")}
            action={
                status !== "submitted" && status !== "approved" ? (
                    <Button size="small" disabled={Boolean(strictApprovalBlock)} icon={<Send className="size-3.5" />} onClick={() => onSubmit(stage.key)}>
                        {status === "requires_confirmation" ? "确认并提交" : "提交审核"}
                    </Button>
                ) : undefined
            }
        />
    );
}

function WorkflowRunModal({
    project,
    activeEpisode,
    onClose,
    onStepChange,
    getStrictApprovalBlock,
}: {
    project: Project;
    activeEpisode?: Episode;
    onClose: () => void;
    onStepChange: (step: StepKey) => void;
    getStrictApprovalBlock: (mode: WorkflowRunMode) => string | undefined;
}) {
    const [mode, setMode] = useState<WorkflowRunMode>("video");
    const [scope, setScope] = useState<WorkflowRunScope>("current");
    const [ratio, setRatio] = useState(project.aspectRatio || "9:16");
    const [duration, setDuration] = useState("5");
    const [language, setLanguage] = useState("中文");
    const [visualStyle, setVisualStyle] = useState(project.style || "电影感写实");
    const [autoExport, setAutoExport] = useState(false);
    const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed">("idle");
    const [runningStep, setRunningStep] = useState(-1);
    const simulationTimersRef = useRef<number[]>([]);
    const selectedMode = WORKFLOW_RUN_MODES.find((item) => item.value === mode) || WORKFLOW_RUN_MODES[2];
    const strictApprovalBlock = getStrictApprovalBlock(mode);
    const episodeLabel = scope === "all" ? `全部 ${project.episodes.length} 集` : activeEpisode?.title || "当前集";
    const executionSteps: Array<{ label: string; detail: string; target: StepKey }> = [
        { label: "解析剧本并生成提示词", detail: `${episodeLabel} · ${language}输出`, target: "script" },
        { label: "生成角色、场景与道具资产", detail: `统一视觉风格：${visualStyle || "项目默认风格"}`, target: "assets" },
        ...(mode === "assets" ? [] : [{ label: "生成分镜提示词与分镜图", detail: `${ratio} · 单镜头${duration}秒`, target: "storyboard" as StepKey }]),
        ...(mode !== "video"
            ? []
            : [
                  { label: "生成镜头视频", detail: "按镜头顺序自动推进", target: "generate" as StepKey },
                  { label: "内容审核", detail: "汇总素材、分镜图与镜头视频的审核结果", target: "review" as StepKey },
                  ...(autoExport ? [{ label: "成片导出", detail: "审核完成后自动创建导出任务", target: "export" as StepKey }] : []),
              ]),
    ];

    useEffect(
        () => () => {
            simulationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        },
        [],
    );

    const simulateRun = () => {
        if (runStatus === "running") return;
        if (strictApprovalBlock) return;
        simulationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        simulationTimersRef.current = [];
        setRunStatus("running");
        setRunningStep(0);
        onStepChange(executionSteps.at(-1)?.target || "assets");

        executionSteps.forEach((_, index) => {
            simulationTimersRef.current.push(window.setTimeout(() => setRunningStep(index), index * 350));
        });
        simulationTimersRef.current.push(
            window.setTimeout(
                () => {
                    setRunningStep(executionSteps.length);
                    setRunStatus("completed");
                    simulationTimersRef.current = [];
                },
                executionSteps.length * 350 + 250,
            ),
        );
    };

    return (
        <Modal open title="一键全流程" onCancel={onClose} footer={null} destroyOnHidden width={920} style={{ top: 24, maxWidth: "calc(100vw - 32px)" }}>
            <div className="space-y-6 pb-2">
                <div>
                    <h2 className="text-base font-semibold">执行终点</h2>
                    <p className="mt-1 text-sm text-muted-foreground">从提示词开始自动推进；个人创作不要求逐项人工确认。</p>
                    <Radio.Group
                        value={mode}
                        onChange={(event) => {
                            setMode(event.target.value);
                            if (event.target.value !== "video") setAutoExport(false);
                        }}
                        className="mt-4 grid w-full gap-3 md:grid-cols-3"
                    >
                        {WORKFLOW_RUN_MODES.map((item) => (
                            <Radio key={item.value} value={item.value} className={cn("mr-0 flex min-h-28 items-start border p-4", mode === item.value ? "border-primary bg-primary/5" : "border-border")}>
                                <span className="block pr-2">
                                    <span className="block font-medium">{item.label}</span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                                </span>
                            </Radio>
                        ))}
                    </Radio.Group>
                </div>

                <div className="border-y border-border py-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold">执行范围</h2>
                            <p className="mt-1 text-sm text-muted-foreground">选择本次自动推进的剧集范围。</p>
                        </div>
                        <Radio.Group value={scope} onChange={(event) => setScope(event.target.value)} optionType="button" buttonStyle="solid">
                            <Radio.Button value="current">当前集</Radio.Button>
                            <Radio.Button value="all">全部剧集</Radio.Button>
                        </Radio.Group>
                    </div>
                </div>

                <div>
                    <h2 className="text-base font-semibold">生成设置</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium">
                            画面比例
                            <Select
                                value={ratio}
                                onChange={setRatio}
                                options={[
                                    { value: "9:16", label: "9:16 竖屏" },
                                    { value: "16:9", label: "16:9 横屏" },
                                    { value: "1:1", label: "1:1 方形" },
                                ]}
                            />
                        </label>
                        <label className="grid gap-2 text-sm font-medium">
                            单镜头时长
                            <Select
                                value={duration}
                                onChange={setDuration}
                                options={[
                                    { value: "3", label: "3 秒" },
                                    { value: "5", label: "5 秒" },
                                    { value: "8", label: "8 秒" },
                                    { value: "10", label: "10 秒" },
                                ]}
                            />
                        </label>
                        <label className="grid gap-2 text-sm font-medium">
                            输出语言
                            <Select
                                value={language}
                                onChange={setLanguage}
                                options={[
                                    { value: "中文", label: "中文" },
                                    { value: "English", label: "English" },
                                ]}
                            />
                        </label>
                        <label className="grid gap-2 text-sm font-medium">
                            视觉风格
                            <Input value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)} placeholder="例如：电影感写实" />
                        </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                        <div>
                            <p className="text-sm font-medium">自动导出</p>
                            <p className="mt-1 text-xs text-muted-foreground">仅在“生成完整视频”时可用，内容审核完成后创建导出任务。</p>
                        </div>
                        <Switch checked={autoExport} disabled={mode !== "video"} onChange={setAutoExport} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 text-sm text-muted-foreground">
                        <span>模型：使用后台默认渠道</span>
                        <span>失败策略：跳过失败项并在完成后汇总</span>
                    </div>
                </div>

                <div className="border border-border bg-muted/30">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                            <h2 className="font-semibold">执行预览</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {episodeLabel} · {selectedMode.label}
                            </p>
                        </div>
                        {runStatus === "completed" ? <span className="text-sm font-medium text-emerald-700">模拟执行完成</span> : null}
                    </div>
                    <ol className="divide-y divide-border">
                        {executionSteps.map((step, index) => {
                            const status = runStatus === "completed" || index < runningStep ? "已完成" : runStatus === "running" && index === runningStep ? "模拟中" : "待执行";
                            return (
                                <li key={step.label} className="flex items-center gap-3 px-4 py-3">
                                    <span
                                        className={cn(
                                            "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                                            status === "已完成" ? "border-emerald-500 bg-emerald-500 text-white" : status === "模拟中" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                                        )}
                                    >
                                        {status === "已完成" ? <CheckCircle2 className="size-3.5" /> : index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium">{step.label}</p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.detail}</p>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">{status}</span>
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <Alert type="info" showIcon title="当前为前端执行演示" description="此版本只展示配置和推进状态，不会创建生成任务、不保存设置，也不会消耗后台渠道额度。" />
                {strictApprovalBlock ? <Alert type="warning" showIcon title="严格审批模式已阻断本次流程" description={strictApprovalBlock} /> : null}

                <div className="flex flex-wrap justify-end gap-3">
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" icon={runStatus === "running" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={runStatus === "running"} disabled={Boolean(strictApprovalBlock)} onClick={simulateRun}>
                        {runStatus === "completed" ? "重新模拟执行" : "开始模拟执行"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// 5. 内容审核面板
type ReviewDemoTarget = Extract<StepKey, "assets" | "storyboard" | "generate">;

type ReviewDemoIssue = {
    id: string;
    severity: "高" | "中" | "低";
    area: string;
    title: string;
    detail: string;
    action: string;
    target: ReviewDemoTarget;
};

function ReviewPanel({ project, episode, onStepChange }: { project: Project; episode?: Episode; onStepChange: (step: StepKey) => void }) {
    const [simulationStatus, setSimulationStatus] = useState<"ready" | "running">("ready");
    const [simulatedAt, setSimulatedAt] = useState("刚刚");
    const simulationTimerRef = useRef<number | null>(null);
    const episodeShots = project.shots.filter((shot) => shot.episodeId === episode?.id);
    const assetCount = project.characters.length + project.scenes.length + project.props.length;
    const storyboardImageCount = episodeShots.filter((shot) => Boolean(shot.imageUrl)).length;
    const videoCount = episodeShots.filter((shot) => Boolean(shot.videoUrl)).length;
    const issues: ReviewDemoIssue[] = [
        ...(assetCount === 0
            ? [{ id: "assets-empty", severity: "高" as const, area: "资产", title: "缺少统一视觉资产", detail: "角色、场景与道具尚未建立，后续画面一致性无法确认。", action: "查看资产准备", target: "assets" as const }]
            : [{ id: "assets-ready", severity: "低" as const, area: "资产", title: "补充资产视觉设定", detail: "建议为核心角色和场景补充统一的风格、色彩与引用图说明。", action: "查看资产准备", target: "assets" as const }]),
        ...(episodeShots.length === 0
            ? [{ id: "storyboard-empty", severity: "高" as const, area: "分镜", title: "尚未建立分镜", detail: "当前剧集没有可审核的镜头节奏、构图与叙事衔接。", action: "前往分镜", target: "storyboard" as const }]
            : storyboardImageCount < episodeShots.length
              ? [
                    {
                        id: "storyboard-missing",
                        severity: "中" as const,
                        area: "分镜图",
                        title: "部分分镜图待生成",
                        detail: `${episodeShots.length - storyboardImageCount} 个分镜缺少画面结果，无法完成视觉连续性核验。`,
                        action: "前往分镜",
                        target: "storyboard" as const,
                    },
                ]
              : [{ id: "storyboard-ready", severity: "低" as const, area: "分镜图", title: "检查镜头衔接", detail: "建议重点确认相邻镜头的景别、视线和运动方向。", action: "前往分镜", target: "storyboard" as const }]),
        ...(videoCount === 0
            ? [{ id: "video-empty", severity: "中" as const, area: "镜头视频", title: "尚未生成镜头视频", detail: "镜头动态、节奏与成片可用性将在视频结果生成后完成核验。", action: "前往镜头生成", target: "generate" as const }]
            : [{ id: "video-ready", severity: "低" as const, area: "镜头视频", title: "复核成片节奏", detail: `${videoCount} 个镜头已有视频结果，建议确认动作衔接与时长节奏。`, action: "前往镜头生成", target: "generate" as const }]),
    ];
    const blockingIssueCount = issues.filter((issue) => issue.severity === "高").length;
    const score = Math.max(64, Math.min(94, 94 - blockingIssueCount * 12 - issues.filter((issue) => issue.severity === "中").length * 5));
    const scores = [
        { label: "叙事完整性", value: Math.min(95, 78 + Math.min(episode?.script.length || 0, 600) / 35) },
        { label: "资产一致性", value: Math.min(94, 66 + Math.min(assetCount, 8) * 4) },
        { label: "视觉连续性", value: episodeShots.length ? Math.min(92, 70 + Math.round((storyboardImageCount / episodeShots.length) * 18)) : 64 },
        { label: "成片可用性", value: episodeShots.length ? Math.min(92, 68 + Math.round((videoCount / episodeShots.length) * 20)) : 64 },
    ].map((item) => ({ ...item, value: Math.round(item.value) }));

    useEffect(
        () => () => {
            if (simulationTimerRef.current) window.clearTimeout(simulationTimerRef.current);
        },
        [],
    );

    const simulateReview = () => {
        if (simulationStatus === "running") return;
        setSimulationStatus("running");
        simulationTimerRef.current = window.setTimeout(() => {
            setSimulatedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
            setSimulationStatus("ready");
            simulationTimerRef.current = null;
        }, 700);
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <section className="flex flex-wrap items-start justify-between gap-4 border border-border bg-card px-5 py-5 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-primary">
                        <Sparkles className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold">AI 内容审核</h2>
                            <span className="border border-border px-2 py-0.5 text-xs text-muted-foreground">演示报告</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            第 {episode?.number || 1} 集 · {episode?.title || "未命名剧集"}
                        </p>
                    </div>
                </div>
                <Button type="primary" icon={simulationStatus === "running" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={simulationStatus === "running"} onClick={simulateReview}>
                    重新模拟审核
                </Button>
            </section>

            <section className="grid border border-border bg-card lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
                <div className="border-b border-border p-6 lg:border-b-0 lg:border-r">
                    <p className="text-sm text-muted-foreground">审核结论</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold">{blockingIssueCount ? "建议完善后导出" : "可以进入成片导出"}</h3>
                        <span className={cn("border px-2 py-1 text-xs font-medium", blockingIssueCount ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>
                            {blockingIssueCount ? `${blockingIssueCount} 个优先处理项` : "未发现阻塞项"}
                        </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">已覆盖当前剧集的剧本、资产、分镜图和镜头视频，并给出可回到制作阶段处理的问题。</p>
                    <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3 text-sm">
                        <span>
                            <strong className="font-semibold">{issues.length}</strong> 个检查项
                        </span>
                        <span>
                            <strong className="font-semibold">{episodeShots.length}</strong> 个分镜
                        </span>
                        <span>
                            <strong className="font-semibold">{videoCount}</strong> 个视频结果
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-5 p-6">
                    <div className="grid size-24 shrink-0 place-items-center rounded-full border-8 border-primary/15 text-center">
                        <span>
                            <strong className="block text-2xl leading-none">{score}</strong>
                            <small className="mt-1 block text-xs text-muted-foreground">综合评分</small>
                        </span>
                    </div>
                    <div>
                        <p className="font-medium">审核已完成</p>
                        <p className="mt-1 text-sm text-muted-foreground">本次演示于 {simulatedAt} 生成</p>
                    </div>
                </div>
            </section>

            <section className="border border-border bg-card">
                <div className="border-b border-border px-5 py-4 sm:px-6">
                    <h3 className="font-semibold">审核覆盖范围</h3>
                </div>
                <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                    {[
                        { label: "剧本内容", value: `${episode?.script.length || 0} 字`, detail: "剧情、人物、对白" },
                        { label: "创作资产", value: `${assetCount} 项`, detail: "角色、场景、道具" },
                        { label: "分镜图", value: `${storyboardImageCount}/${episodeShots.length}`, detail: "构图、风格、连续性" },
                        { label: "镜头视频", value: `${videoCount}/${episodeShots.length}`, detail: "动态、节奏、可用性" },
                    ].map((item) => (
                        <div key={item.label} className="px-5 py-4 sm:px-6">
                            <p className="text-sm text-muted-foreground">{item.label}</p>
                            <p className="mt-1 text-xl font-semibold">{item.value}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section className="border border-border bg-card">
                    <div className="border-b border-border px-5 py-4 sm:px-6">
                        <h3 className="font-semibold">审核评分</h3>
                    </div>
                    <div className="space-y-5 p-5 sm:p-6">
                        {scores.map((item) => (
                            <div key={item.label}>
                                <div className="flex items-center justify-between gap-4 text-sm">
                                    <span>{item.label}</span>
                                    <strong className="font-semibold">{item.value}</strong>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden bg-muted" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.value}>
                                    <div className={cn("h-full", item.value >= 85 ? "bg-emerald-500" : item.value >= 70 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${item.value}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                        <h3 className="font-semibold">待处理问题</h3>
                        <span className="text-sm text-muted-foreground">{issues.length} 项</span>
                    </div>
                    <div className="divide-y divide-border">
                        {issues.map((issue) => (
                            <div key={issue.id} className="flex flex-wrap items-start gap-3 p-5 sm:px-6">
                                <span
                                    className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", issue.severity === "高" ? "bg-rose-100 text-rose-700" : issue.severity === "中" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700")}
                                >
                                    {issue.severity === "高" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{issue.area}</span>
                                        <span className={cn("px-1.5 py-0.5 text-xs", issue.severity === "高" ? "bg-rose-100 text-rose-700" : issue.severity === "中" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700")}>
                                            {issue.severity}优先级
                                        </span>
                                    </div>
                                    <h4 className="mt-1 font-medium">{issue.title}</h4>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{issue.detail}</p>
                                </div>
                                <Button size="small" onClick={() => onStepChange(issue.target)}>
                                    {issue.action}
                                </Button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

// 3. 资产管理面板
function AssetsPanel({ project, episode, onSave, messageApi }: { project: Project; episode?: Episode; onSave: (updates: Partial<Project>) => Promise<boolean>; messageApi: ReturnType<typeof message.useMessage>[0] }) {
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
                        children: <CharactersList project={project} episode={episode} onSave={onSave} messageApi={messageApi} />,
                    },
                    {
                        key: "scenes",
                        label: `场景 (${project.scenes.length})`,
                        children: <ScenesList project={project} episode={episode} onSave={onSave} messageApi={messageApi} />,
                    },
                    {
                        key: "props",
                        label: `道具 (${project.props.length})`,
                        children: <PropsList project={project} episode={episode} onSave={onSave} messageApi={messageApi} />,
                    },
                ]}
            />
        </div>
    );
}

// 角色列表
type AssetResourceType = "character" | "scene" | "prop";
type ImportedDramaAsset = { id: string; name: string; description?: string; imageUrl?: string; location?: string; time?: string };

function AssetResourceActions({
    resourceType,
    project,
    episode,
    messageApi,
    onAppend,
    manualAction,
}: {
    resourceType: AssetResourceType;
    project: Project;
    episode?: Episode;
    messageApi: ReturnType<typeof message.useMessage>[0];
    onAppend: (items: ImportedDramaAsset[]) => Promise<boolean>;
    manualAction: ReactNode;
}) {
    const [extracting, setExtracting] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryImporting, setLibraryImporting] = useState(false);
    const [libraryKeyword, setLibraryKeyword] = useState("");
    const [libraryAssets, setLibraryAssets] = useState<Asset[]>([]);
    const label = resourceType === "character" ? "角色" : resourceType === "scene" ? "场景" : "道具";
    const existingNames = resourceType === "character" ? project.characters.map((item) => item.name) : resourceType === "scene" ? project.scenes.map((item) => sceneLabel(item)) : project.props.map((item) => item.name);

    const openLibrary = async () => {
        setLibraryOpen(true);
        setLibraryLoading(true);
        try {
            const result = await listLibraryAssetPage({ page: 1, pageSize: 100 });
            setLibraryAssets(result.assets);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "素材库加载失败");
        } finally {
            setLibraryLoading(false);
        }
    };

    const extractFromScript = async () => {
        if (!episode?.script.trim()) {
            messageApi.warning("请先填写当前集剧本");
            return;
        }
        setExtracting(true);
        const key = `drama-extract-${resourceType}`;
        messageApi.loading({ content: `正在从剧本提取${label}...`, key, duration: 0 });
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/extract-assets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeId: episode.id, assetType: resourceType, requestId: `${project.id}:${episode.id}:${resourceType}:${Date.now()}` }),
            });
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "资产提取失败");
            const assets = Array.isArray(data.data?.assets)
                ? data.data.assets.map((item: ImportedDramaAsset) => ({
                      ...item,
                      ...(resourceType === "scene" ? { location: item.location || item.name } : {}),
                  }))
                : [];
            if (!assets.length) {
                messageApi.info({ content: `未发现需要新增的${label}`, key, duration: 2 });
                return;
            }
            if (!(await onAppend(assets))) throw new Error("项目保存失败");
            messageApi.success({ content: `已从剧本提取 ${assets.length} 个${label}`, key, duration: 2 });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "资产提取失败", key, duration: 3 });
        } finally {
            setExtracting(false);
        }
    };

    const importLibraryAsset = async (asset: Asset) => {
        if (existingNames.some((name) => normalizedAssetName(name) === normalizedAssetName(asset.title))) {
            messageApi.warning(`项目中已存在同名${label}`);
            return;
        }
        const imageUrl = asset.kind === "image" ? asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl || asset.coverUrl : asset.coverUrl;
        const description = asset.note || (asset.kind === "text" ? asset.data.content : asset.tags.join("、"));
        const item: ImportedDramaAsset = {
            id: `${resourceType}_${Date.now()}`,
            name: asset.title,
            description,
            ...(imageUrl ? { imageUrl } : {}),
            ...(resourceType === "scene" ? { location: asset.title } : {}),
        };
        setLibraryImporting(true);
        try {
            if (!(await onAppend([item]))) throw new Error("项目保存失败");
            messageApi.success(`已从素材库添加${label}：${asset.title}`);
            setLibraryOpen(false);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "素材导入失败");
        } finally {
            setLibraryImporting(false);
        }
    };

    const assets = libraryAssets.filter((asset) => {
        const keyword = libraryKeyword.trim().toLowerCase();
        if (keyword && !asset.title.toLowerCase().includes(keyword) && !asset.tags.some((tag) => tag.toLowerCase().includes(keyword))) return false;
        const taggedTypes = asset.tags.flatMap((tag) => resourceTypeForTag(tag));
        return !taggedTypes.length || taggedTypes.includes(resourceType);
    });

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button type="primary" icon={<Sparkles className="size-4" />} loading={extracting} disabled={!episode?.script.trim()} onClick={() => void extractFromScript()}>
                    从剧本提取{label}
                </Button>
                <Button icon={<LibraryBig className="size-4" />} onClick={() => void openLibrary()}>
                    从素材库添加
                </Button>
                {manualAction}
                {!episode?.script.trim() ? <span className="text-xs text-muted-foreground">请先填写当前集剧本后再提取</span> : null}
            </div>
            <Modal title={`从素材库添加${label}`} open={libraryOpen} footer={null} onCancel={() => setLibraryOpen(false)}>
                <Input allowClear className="mb-3" placeholder={`搜索素材${label}`} value={libraryKeyword} onChange={(event) => setLibraryKeyword(event.target.value)} />
                {libraryLoading ? (
                    <div className="flex justify-center py-8">
                        <Spin />
                    </div>
                ) : assets.length ? (
                    <List
                        dataSource={assets}
                        renderItem={(asset) => (
                            <List.Item
                                actions={[
                                    <Button key="add" type="link" loading={libraryImporting} onClick={() => void importLibraryAsset(asset)}>
                                        添加
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <div className="grid size-9 place-items-center rounded bg-muted">
                                            <LibraryBig className="size-4" />
                                        </div>
                                    }
                                    title={asset.title}
                                    description={asset.note || asset.tags.join("、") || "素材库资产"}
                                />
                            </List.Item>
                        )}
                    />
                ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">没有可导入的素材</div>
                )}
            </Modal>
        </>
    );
}

function resourceTypeForTag(tag: string): AssetResourceType[] {
    const value = tag.trim().toLowerCase();
    if (/角色|人物|character|person/.test(value)) return ["character"];
    if (/场景|地点|scene|location/.test(value)) return ["scene"];
    if (/道具|物品|prop|object/.test(value)) return ["prop"];
    return [];
}

function normalizedAssetName(value: string) {
    return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function sceneLabel(scene: Scene) {
    return scene.location || scene.name || "";
}

function CharactersList({ project, episode, onSave, messageApi }: { project: Project; episode?: Episode; onSave: (updates: Partial<Project>) => Promise<boolean>; messageApi: ReturnType<typeof message.useMessage>[0] }) {
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
                const updated = project.characters.map((c) => (c.id === editingChar.id ? { ...c, ...values } : c));
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
        onSave({ characters: project.characters.filter((c) => c.id !== id) });
    };

    return (
        <div>
            <AssetResourceActions
                resourceType="character"
                project={project}
                episode={episode}
                messageApi={messageApi}
                onAppend={(items) => onSave({ characters: [...project.characters, ...items.map((item) => ({ id: item.id, name: item.name, description: item.description, imageUrl: item.imageUrl }))] })}
                manualAction={
                    <Button icon={<Plus className="size-4" />} onClick={handleAdd}>
                        添加角色
                    </Button>
                }
            />
            <div className="mb-4">
                <span className="text-sm text-muted-foreground">暂无本剧角色库记录，可在素材库中导入或手动添加</span>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {project.characters.map((char) => (
                    <div key={char.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-2 text-base font-semibold">{char.name}</div>
                        <div className="mb-4 text-sm text-muted-foreground">{char.description || "暂无描述"}</div>
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
                            <Button size="small" danger icon={<Trash2 className="size-3" />} onClick={() => handleDelete(char.id)}>
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal title={editingChar ? "编辑角色" : "添加角色"} open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)}>
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
function ScenesList({ project, episode, onSave, messageApi }: { project: Project; episode?: Episode; onSave: (updates: Partial<Project>) => Promise<boolean>; messageApi: ReturnType<typeof message.useMessage>[0] }) {
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
                const updated = project.scenes.map((s) => (s.id === editingScene.id ? { ...s, ...values } : s));
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
                onSave({ scenes: project.scenes.filter((s) => s.id !== id) });
            },
        });
    };

    return (
        <div>
            <AssetResourceActions
                resourceType="scene"
                project={project}
                episode={episode}
                messageApi={messageApi}
                onAppend={(items) => onSave({ scenes: [...project.scenes, ...items.map((item) => ({ id: item.id, location: item.location || item.name, name: item.name, time: item.time, description: item.description, imageUrl: item.imageUrl }))] })}
                manualAction={
                    <Button icon={<Plus className="size-4" />} onClick={handleAdd}>
                        添加场景
                    </Button>
                }
            />
            <div className="mb-4">
                <span className="text-sm text-muted-foreground">暂无本剧场景库记录，可在素材库中导入或手动添加</span>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {project.scenes.map((scene) => (
                    <div key={scene.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-2 text-base font-semibold">{scene.location}</div>
                        <div className="mb-1 text-xs text-muted-foreground">{scene.time || "未设置时间"}</div>
                        <div className="mb-4 text-sm text-muted-foreground">{scene.description || "暂无描述"}</div>
                        <div className="flex gap-2">
                            <Button size="small" icon={<Edit2 className="size-3" />} onClick={() => handleEdit(scene)}>
                                编辑
                            </Button>
                            <Button size="small" danger icon={<Trash2 className="size-3" />} onClick={() => handleDelete(scene.id)}>
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal title={editingScene ? "编辑场景" : "添加场景"} open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)}>
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
function PropsList({ project, episode, onSave, messageApi }: { project: Project; episode?: Episode; onSave: (updates: Partial<Project>) => Promise<boolean>; messageApi: ReturnType<typeof message.useMessage>[0] }) {
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
                const updated = project.props.map((p) => (p.id === editingProp.id ? { ...p, ...values } : p));
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
                onSave({ props: project.props.filter((p) => p.id !== id) });
            },
        });
    };

    return (
        <div>
            <AssetResourceActions
                resourceType="prop"
                project={project}
                episode={episode}
                messageApi={messageApi}
                onAppend={(items) => onSave({ props: [...project.props, ...items.map((item) => ({ id: item.id, name: item.name, description: item.description, imageUrl: item.imageUrl }))] })}
                manualAction={
                    <Button icon={<Plus className="size-4" />} onClick={handleAdd}>
                        添加道具
                    </Button>
                }
            />
            <div className="mb-4">
                <span className="text-sm text-muted-foreground">暂无本剧道具库记录，可在素材库中导入或手动添加</span>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {project.props.map((prop) => (
                    <div key={prop.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-2 text-base font-semibold">{prop.name}</div>
                        <div className="mb-4 text-sm text-muted-foreground">{prop.description || "暂无描述"}</div>
                        <div className="flex gap-2">
                            <Button size="small" icon={<Edit2 className="size-3" />} onClick={() => handleEdit(prop)}>
                                编辑
                            </Button>
                            <Button size="small" danger icon={<Trash2 className="size-3" />} onClick={() => handleDelete(prop.id)}>
                                删除
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal title={editingProp ? "编辑道具" : "添加道具"} open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)}>
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
    onSave,
    onReplaceEpisodeShots,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: Partial<Project>) => void;
    onReplaceEpisodeShots: (episodeId: string, shots: Shot[]) => void;
    messageApi: ReturnType<typeof message.useMessage>[0];
}) {
    const config = useEffectiveConfig();
    const [modalVisible, setModalVisible] = useState(false);
    const [editingShot, setEditingShot] = useState<Shot | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [form] = Form.useForm();

    // 筛选当前集的分镜
    const episodeShots = episode ? project.shots.filter((s) => s.episodeId === episode.id).sort((a, b) => a.shotNumber - b.shotNumber) : [];

    const handleAdd = () => {
        setEditingShot(null);
        form.resetFields();
        form.setFieldsValue({
            episodeId: episode?.id,
            shotNumber: episodeShots.length + 1,
            duration: 3,
            characterIds: [],
            propIds: [],
            status: "draft",
        });
        setModalVisible(true);
    };

    const extractFromScript = async () => {
        if (!episode) return;
        try {
            setExtracting(true);
            messageApi.loading({ content: "正在从剧本提取分镜...", key: "extract-storyboards", duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/extract-storyboards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeId: episode.id, requestId: crypto.randomUUID() }),
            });
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !Array.isArray(data.data?.shots)) throw new Error(data.msg || "分镜提取失败");
            const shots = data.data.shots as Shot[];
            onReplaceEpisodeShots(episode.id, shots);
            messageApi.success({ content: `已提取 ${shots.length} 个分镜`, key: "extract-storyboards", duration: 3 });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "分镜提取失败", key: "extract-storyboards", duration: 3 });
        } finally {
            setExtracting(false);
        }
    };

    const handleExtract = () => {
        if (!episode?.script.trim()) {
            messageApi.warning("请先填写当前集剧本");
            return;
        }
        if (!episodeShots.length) {
            void extractFromScript();
            return;
        }
        Modal.confirm({
            title: "重新提取分镜",
            content: "当前集已有分镜。重新提取会替换当前集全部分镜，其他剧集不受影响。",
            okText: "确认替换",
            cancelText: "取消",
            onOk: extractFromScript,
        });
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
                const updated = project.shots.map((s) => (s.id === editingShot.id ? { ...s, ...values } : s));
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
                onSave({ shots: project.shots.filter((s) => s.id !== id) });
                messageApi.success("分镜已删除");
            },
        });
    };

    const getSceneName = (sceneId?: string) => {
        if (!sceneId) return "未设置";
        const scene = project.scenes.find((s) => s.id === sceneId);
        return scene?.location || "未知场景";
    };

    const getCharacterNames = (characterIds: string[]) => {
        if (!characterIds || characterIds.length === 0) return "无角色";
        return characterIds
            .map((id) => {
                const char = project.characters.find((c) => c.id === id);
                return char?.name || "未知";
            })
            .join(", ");
    };

    const getPropNames = (propIds: string[]) => {
        if (!propIds.length) return "无道具";
        return propIds
            .map((id) => project.props.find((prop) => prop.id === id)?.name)
            .filter(Boolean)
            .join(", ");
    };

    // 生成图片
    const handleGenerateImage = async (shot: Shot) => {
        try {
            messageApi.loading({ content: "正在生成图片...", key: shot.id });
            const prompt = dramaLabShotPrompt(project, shot);
            const references = dramaLabShotReferenceImages(project, shot);
            const imageConfig = { ...config, model: config.imageModel || config.model, imageModel: config.imageModel || config.model, size: project.aspectRatio || config.size, count: "1" };
            const task = await createImageGenerationTask(imageConfig, prompt, references, undefined, {
                logSource: "drama",
                logTitle: `${project.title} · 分镜 ${shot.shotNumber}`,
                surface: "drama",
                projectId: project.id,
                episodeId: shot.episodeId,
                shotId: shot.id,
                clientRequestId: `drama-lab-shot:${project.id}:${shot.id}:${Date.now()}`,
            });
            const result = await waitForImageGenerationTask(imageConfig, task);
            const imageUrl = result.serverUrl || result.remoteUrl || result.dataUrl;
            if (!imageUrl) throw new Error("生成结果没有可持久化图片地址");
            onSave({ shots: project.shots.map((item) => (item.id === shot.id ? { ...item, imageUrl, status: "image_generated" as const } : item)) });
            messageApi.success({ content: "图片生成成功", key: shot.id });
        } catch (err) {
            messageApi.error({ content: err instanceof Error ? err.message : "生成图片失败", key: shot.id });
        }
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
                    const updated = project.shots.map((s) => (s.id === shot.id ? { ...s, videoUrl: data.task.result.url, status: "video_generated" as const } : s));
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">当前集共 {episodeShots.length} 个分镜</div>
                <div className="flex items-center gap-2">
                    <Button type="primary" icon={<Sparkles className="size-4" />} loading={extracting} onClick={handleExtract}>
                        从剧本提取分镜
                    </Button>
                    <Button icon={<Plus className="size-4" />} onClick={handleAdd}>
                        添加分镜
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {episodeShots.map((shot) => (
                    <div id={`storyboard-shot-${shot.id}`} key={shot.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-3 flex items-start justify-between">
                            <div className="flex-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <span className="text-base font-semibold">分镜 {shot.shotNumber}</span>
                                    {shot.status === "image_generated" && <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">已生图</span>}
                                    {shot.status === "video_generated" && <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">已生视频</span>}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    场景: {getSceneName(shot.sceneId)} · 角色: {getCharacterNames(shot.characterIds)} · 道具: {getPropNames(shot.propIds)} · 时长: {shot.duration}s{shot.cameraAngle && ` · 镜头: ${shot.cameraAngle}`}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button size="small" icon={<Edit2 className="size-3" />} onClick={() => handleEdit(shot)}>
                                    编辑
                                </Button>
                                <Button size="small" danger icon={<Trash2 className="size-3" />} onClick={() => handleDelete(shot.id)}>
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
                                <Button size="small" type="primary" icon={<Sparkles className="size-3" />} onClick={() => handleGenerateImage(shot)}>
                                    生成图片
                                </Button>
                            )}
                            {shot.imageUrl && shot.status !== "video_generated" && (
                                <Button size="small" type="primary" icon={<Film className="size-3" />} onClick={() => handleGenerateVideo(shot)}>
                                    生成视频
                                </Button>
                            )}
                        </div>

                        {shot.imageUrl && (
                            <div className="mt-3">
                                <img src={shot.imageUrl} alt={`分镜 ${shot.shotNumber}`} className="max-h-48 rounded border" />
                            </div>
                        )}

                        {shot.videoUrl && (
                            <div className="mt-3">
                                <video src={shot.videoUrl} controls className="max-h-48 rounded border" />
                            </div>
                        )}
                    </div>
                ))}

                {episodeShots.length === 0 && <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">暂无分镜，点击“从剧本提取分镜”开始拆解，也可手工添加</div>}
            </div>

            <Modal title={editingShot ? "编辑分镜" : "添加分镜"} open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)} width={600}>
                <Form form={form} layout="vertical">
                    <Form.Item name="episodeId" hidden>
                        <Input />
                    </Form.Item>

                    <Form.Item label="分镜序号" name="shotNumber" rules={[{ required: true }]}>
                        <Input type="number" placeholder="例如: 1, 2, 3..." />
                    </Form.Item>

                    <Form.Item label="场景" name="sceneId">
                        <Select placeholder="选择场景" allowClear>
                            {project.scenes.map((scene) => (
                                <Option key={scene.id} value={scene.id}>
                                    {scene.location} {scene.time ? `(${scene.time})` : ""}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="出场角色" name="characterIds">
                        <Select mode="multiple" placeholder="选择角色" allowClear>
                            {project.characters.map((char) => (
                                <Option key={char.id} value={char.id}>
                                    {char.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="出场道具" name="propIds">
                        <Select mode="multiple" placeholder="选择道具" allowClear>
                            {project.props.map((prop) => (
                                <Option key={prop.id} value={prop.id}>
                                    {prop.name}
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
    return <div className="mx-auto max-w-6xl text-center text-muted-foreground">镜头生成功能开发中...</div>;
}

// 6. 导出面板
function ExportPanel({ project, episode, messageApi, exportBlockedByApproval }: { project: Project; episode?: Episode; messageApi: ReturnType<typeof message.useMessage>[0]; exportBlockedByApproval: boolean }) {
    const [draftPath, setDraftPath] = useState("");
    const [jianyingVersion, setJianyingVersion] = useState<"5" | "6">("6");
    const [exporting, setExporting] = useState(false);

    if (!episode) {
        return (
            <div className="mx-auto max-w-2xl space-y-6 p-8">
                <Alert type="warning" showIcon message="请先选择一个剧集" />
            </div>
        );
    }

    const episodeShots = project.shots?.filter((shot) => shot.episodeId === episode.id) || [];
    const videoShots = episodeShots.filter((shot) => shot.videoUrl);

    const handleExport = async () => {
        if (exportBlockedByApproval) {
            messageApi.warning("项目启用了团队审批，请先通过所有已启用的审批节点");
            return;
        }
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
                <p className="text-sm text-muted-foreground">将当前剧集的所有分镜视频导出为剪映草稿，可直接在剪映中打开继续编辑</p>
            </div>

            {/* 剧集信息 */}
            <div className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">{episode.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{project.title}</p>
                    </div>
                    <div className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{videoShots.length} 个分镜</div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-border pt-4">
                    <div>
                        <div className="text-xs text-muted-foreground">总时长</div>
                        <div className="mt-1 text-sm font-medium">{Math.round(episodeShots.reduce((sum, shot) => sum + (shot.duration || 0), 0))}秒</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">画面比例</div>
                        <div className="mt-1 text-sm font-medium">{project.aspectRatio || "16:9"}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">视频分镜</div>
                        <div className="mt-1 text-sm font-medium">
                            {videoShots.length} / {episodeShots.length}
                        </div>
                    </div>
                </div>
            </div>

            {/* 导出设置 */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-6">
                <h3 className="font-semibold">导出设置</h3>

                {/* 剪映版本 */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">剪映版本</label>
                    <Radio.Group value={jianyingVersion} onChange={(e) => setJianyingVersion(e.target.value)}>
                        <Radio value="6">剪映专业版 6.x（推荐）</Radio>
                        <Radio value="5">剪映专业版 5.x</Radio>
                    </Radio.Group>
                </div>

                {/* 草稿路径 */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">
                        剪映草稿文件夹路径 <span className="text-red-500">*</span>
                    </label>
                    <Input value={draftPath} onChange={(e) => setDraftPath(e.target.value)} placeholder="例如: C:\Users\YourName\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft" className="font-mono text-sm" />
                    <div className="text-xs text-muted-foreground">
                        Windows 示例: C:\Users\用户名\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft
                        <br />
                        Mac 示例: /Users/用户名/Movies/JianyingPro/User Data/Projects/com.lveditor.draft
                    </div>
                </div>
            </div>

            {/* 警告提示 */}
            {videoShots.length === 0 && <Alert type="warning" message="当前剧集没有可导出的视频" description="请先生成分镜视频后再导出" showIcon />}

            {videoShots.length > 0 && videoShots.length < episodeShots.length && <Alert type="info" message={`还有 ${episodeShots.length - videoShots.length} 个分镜未生成视频`} description="只会导出已生成视频的分镜" showIcon />}

            {exportBlockedByApproval ? <Alert type="warning" message="团队审批尚未完成" description="当前项目的已启用审批节点需要全部通过后，才会解除导出限制。" showIcon /> : null}

            {/* 导出按钮 */}
            <div className="flex justify-end gap-3">
                <Button type="primary" size="large" icon={<Download className="size-4" />} loading={exporting} disabled={videoShots.length === 0 || exportBlockedByApproval} onClick={handleExport}>
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
