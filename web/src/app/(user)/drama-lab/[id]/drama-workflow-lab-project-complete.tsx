"use client";

import { DRAMA_LAB_SHOT_FOCUS, focusDramaLabShot } from "@/lib/drama-lab-shot-focus";
import { DramaLabShotAssetPicker } from "./drama-lab-shot-asset-picker";
import { groupStoryboardShots } from "@/lib/drama-lab-storyboard-groups";
import { DramaLabSegmentHeader } from "./drama-lab-segment-header";
import { normalizeDramaLabStoryboardOptions } from "@/lib/drama-lab-storyboard-options";
import { DramaLabStoryboardConstraints, type StoryboardConstraintDraft } from "./drama-lab-storyboard-constraints";

import type { DramaAssetVisualDetails } from "@/lib/drama-project-contract";
import { readDramaLabAssetVisualDetails } from "@/lib/drama-lab-asset-image-prompt";

import { Alert, Button, Drawer, Spin, Tabs, Input, InputNumber, Select, Form, List, Modal, message, Switch, Radio, QRCode, Image } from "antd";
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
    Upload,
    PanelsTopLeft,
    Volume2,
    Scissors,
    RefreshCw,
    Copy,
    UserMinus,
    LogOut,
    UserCog,
    Link2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Asset } from "@/lib/library-asset-contract";
import type { CreativeReview } from "@/lib/creative-agent-contract";
import type { DramaShotAudioMode, DramaShotAudioState, DramaShotVideoFrameSnapshot, DramaUtterance } from "@/lib/drama-project-contract";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { recoverVideoGenerationTask } from "@/services/api/video-core";
import { cn } from "@/lib/utils";
import { DramaLabVisualAssetsPanel } from "./drama-lab-visual-assets-panel";
import { DramaLabNovelImport } from "./drama-lab-novel-import";
import { DramaLabFinalVideoPanel } from "./drama-lab-final-video-panel";
import { DramaLabTaskPanel } from "./drama-lab-task-panel";
import { dramaLabVideoTaskReviewDescription, requiresDramaLabVideoTaskCheck } from "./drama-lab-video-task-recovery";
import { DramaLabVideoBatchWaitError, waitForDramaLabVideoBatch, type DramaLabVideoBatchExecutionPhase } from "@/lib/drama-lab-video-batch";
import { optimizePrompt } from "@/services/api/prompt-optimization";
import { DRAMA_LAB_CUSTOM_OPTION_VALUE, DRAMA_LAB_SCRIPT_TYPE_PRESETS, DRAMA_LAB_STORY_STYLE_PRESETS, type DramaLabStoryOptionKind } from "@/lib/drama-lab-story-options";

const { TextArea } = Input;
const { Option } = Select;

function announceDramaLabTaskCreated(projectId: string) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("drama-lab-task-created", { detail: { projectId } }));
}

export function dramaLabEpisodeCanvasHref(projectId: string, episodeId: string, shotId?: string, assetType?: "character" | "scene" | "prop", assetId?: string) {
    const params = new URLSearchParams();
    params.set("episodeId", episodeId);
    if (shotId) params.set("shotId", shotId);
    if (assetType) params.set("assetType", assetType);
    if (assetId) params.set("assetId", assetId);
    return `/drama-lab/${encodeURIComponent(projectId)}/canvas?${params.toString()}`;
}

// 步骤定义
const WORKFLOW_STEPS = [
    { key: "script", label: "剧本", icon: FileText },
    { key: "assets", label: "资产准备", icon: Users },
    { key: "storyboard", label: "分镜工作台", icon: Film },
    { key: "review", label: "内容审核", icon: FileText },
    { key: "export", label: "成片导出", icon: Download },
] as const;

type StepKey = (typeof WORKFLOW_STEPS)[number]["key"];

type SaveOptions = { silent?: boolean };
type ProjectUpdate = Partial<Project> | ((current: Project) => Partial<Project>);

type CollaborationStageKey = "script" | "asset_prompts" | "storyboard" | "visual_images" | "storyboard_video" | "final_cut";
type CollaborationApprovalStatus = "draft" | "submitted" | "approved" | "returned" | "requires_confirmation";
type CollaborationFeedback = { id: string; stage: CollaborationStageKey; content: string; createdAt: string };

const COLLABORATION_STAGES: Array<{ key: CollaborationStageKey; label: string; step: StepKey; description: string }> = [
    { key: "script", label: "剧本审核", step: "script", description: "故事梗概、分集剧本与人物情节表达" },
    { key: "asset_prompts", label: "资产提示词审核", step: "assets", description: "角色、场景、道具及分镜提示词" },
    { key: "storyboard", label: "分镜审核", step: "storyboard", description: "分镜结构、镜头节奏与资产关联" },
    { key: "visual_images", label: "视觉图片审核", step: "storyboard", description: "资产图片与分镜图片的一致性" },
    { key: "storyboard_video", label: "分镜视频审核", step: "storyboard", description: "镜头视频、节奏与动作衔接" },
    { key: "final_cut", label: "成片审核", step: "export", description: "导出前的最终成片版本" },
];

const COLLABORATION_STATUS_STYLE: Record<CollaborationApprovalStatus, { label: string; className: string }> = {
    draft: { label: "待提交", className: "border-border bg-muted text-muted-foreground" },
    submitted: { label: "审核中", className: "border-sky-300 bg-sky-50 text-sky-800" },
    approved: { label: "已通过", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
    returned: { label: "已打回", className: "border-rose-300 bg-rose-50 text-rose-800" },
    requires_confirmation: { label: "需确认版本", className: "border-amber-300 bg-amber-50 text-amber-800" },
};

// The API stores canonical stage names while the workbench uses labels that
// match its six visible approval rows. Keep the translation explicit so a
// status or config can never be silently written to the wrong stage.
const DRAMA_LAB_UI_TO_API_STAGE: Record<CollaborationStageKey, string> = {
    script: "script",
    asset_prompts: "assets",
    storyboard: "storyboard",
    visual_images: "storyboard_image",
    storyboard_video: "storyboard_video",
    final_cut: "final_export",
};
const DRAMA_LAB_API_TO_UI_STAGE: Record<string, CollaborationStageKey | undefined> = {
    script: "script",
    assets: "asset_prompts",
    storyboard: "storyboard",
    storyboard_image: "visual_images",
    storyboard_video: "storyboard_video",
    final_export: "final_cut",
};

type DramaLabCollaborationApprovalRecord = {
    id: string;
    projectId: string;
    episodeId?: string;
    stage: string;
    resourceType: string;
    resourceId: string;
    versionId?: string;
    versionNumber?: number;
    submittedBy: string;
    submittedAt: string;
    snapshot?: unknown;
    status: "pending" | "approved" | "rejected" | "cancelled";
    reviewerId?: string;
    reviewComment?: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
    location?: { projectId: string; episodeId?: string; stage: string; resourceType: string; resourceId: string };
};

type DramaLabCollaborationOverview = {
    group: { id: string; projectId: string; ownerUserId: string; createdAt: string; updatedAt: string };
    viewerUserId?: string;
    members: Array<{
        userId: string;
        role: "owner" | "admin" | "member";
        status: string;
        permissions: { manageMembers: boolean; approve: boolean };
        joinedAt: string;
        updatedAt: string;
        profile?: { displayName?: string; username?: string; avatarUrl?: string };
    }>;
    invites: Array<{ id: string; projectId: string; expiresAt: string; revokedAt?: string; createdBy: string; createdAt: string; token?: string; inviteUrl?: string }>;
    joinRequests: Array<{
        id: string;
        projectId: string;
        applicantUserId: string;
        inviteId?: string;
        status: string;
        reviewedBy?: string;
        reviewedAt?: string;
        note?: string;
        createdAt: string;
        updatedAt: string;
        applicant?: { id?: string; displayName?: string; username?: string; avatarUrl?: string };
    }>;
    approvalConfigs: Array<{ stage: string; enabled: boolean; reviewerScope: "owner" | "admins"; reviewerUserIds: string[]; strictMode: boolean; updatedAt: string; updatedBy: string }>;
};

/**
 * Script and shot approvals are episode-scoped. Project/asset approvals are
 * intentionally shared by all episodes. Keeping this rule server-shaped in
 * the client prevents a pending approval from another episode being shown as
 * the action target for the currently selected episode.
 */
function dramaLabApprovalMatchesEpisode(approval: DramaLabCollaborationApprovalRecord, stage: CollaborationStageKey, episodeId?: string) {
    const episodeScoped = stage === "script" || stage === "storyboard" || stage === "visual_images" || stage === "storyboard_video";
    if (!episodeScoped) return true;
    return Boolean(episodeId && approval.episodeId === episodeId);
}

export interface Episode {
    id: string;
    title: string;
    number: number;
    script: string;
    sourceRange?: string;
    status?: string;
}

export interface Character extends DramaAssetVisualDetails {
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

export interface Scene extends DramaAssetVisualDetails {
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

export interface Prop extends DramaAssetVisualDetails {
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
    title?: string;
    description?: string;
    sourceText?: string;
    shotBoundary?: string;
    dialogue?: string;
    narration?: string;
    subtitle?: string;
    audioMode?: DramaShotAudioMode;
    /** Persisted utterances are used by the server-side TTS and split contracts. */
    utterances?: DramaUtterance[];
    imagePrompt?: string;
    videoPrompt?: string;
    cameraMotion?: string;
    shotType?: string;
    segmentIndex?: number;
    segmentTitle?: string;
    atmosphere?: string;
    lightingStyle?: string;
    depthOfField?: string;
    creationMode?: "classic" | "universal";
    universalSegmentText?: string;
    polishedPrompt?: string;
    angleH?: string;
    angleV?: string;
    angleS?: string;
    location?: string;
    time?: string;
    action?: string;
    result?: string;
    emotion?: string;
    emotionIntensity?: number;
    layoutDescription?: string;
    continuity?: {
        shotSize: string;
        cameraAngle: string;
        composition: string;
        characterBlocking: string;
        gazeDirection: string;
        actionStart: string;
        actionEnd: string;
        screenDirection: string;
        axisRule: string;
        continuityNotes: string;
    };
    imageUrl?: string;
    videoUrl?: string;
    duration: number;
    cameraAngle?: string;
    startFramePrompt?: string;
    endFramePrompt?: string;
    storyboardStatus?: DramaLabTaskStatus;
    storyboardFrameMode?: "single" | "first_last";
    storyboardAttempt?: number;
    storyboardTaskId?: string;
    storyboardError?: string;
    storyboardImageUrl?: string;
    storyboardImageWidth?: number;
    storyboardImageHeight?: number;
    storyboardHistory?: DramaLabGenerationHistory[];
    generationStatus?: DramaLabTaskStatus;
    generationAttempt?: number;
    generationTaskId?: string;
    /** Non-persisted execution detail returned by sync-generation. */
    generationExecutionPhase?: DramaLabVideoBatchExecutionPhase;
    generationNeedsReview?: boolean;
    generationError?: string;
    videoHistory?: DramaLabGenerationHistory[];
    dialogueAudio?: DramaShotAudioState;
    narrationAudio?: DramaShotAudioState;
    audioStatus?: DramaLabTaskStatus;
    audioAttempt?: number;
    audioTaskId?: string;
    audioError?: string;
    audioUrl?: string;
    audioSplitSourceShotId?: string;
    audioSplitSegmentIndex?: number;
    status?: string;
    frames?: Partial<
        Record<
            "first" | "key" | "last",
            {
                prompt: string;
                description?: string;
                status?: DramaLabTaskStatus;
                taskId?: string;
                attempt?: number;
                url?: string;
                storageKey?: string;
                width?: number;
                height?: number;
                error?: string;
                history?: DramaLabGenerationHistory[];
                source?: "generated" | "uploaded" | "video_tail" | "restored";
                sourceVideoTaskId?: string;
                sourceShotId?: string;
                sourceVideoHistoryId?: string;
                locked?: boolean;
            }
        >
    >;
    firstFrameCandidate?: {
        id: string;
        frameType: "first";
        url: string;
        storageKey?: string;
        width?: number;
        height?: number;
        source: "video_tail";
        sourceVideoTaskId: string;
        sourceShotId: string;
        sourceVideoHistoryId: string;
        createdAt: string;
        projectUpdatedAt: string;
    };
    videoFrameSnapshot?: DramaShotVideoFrameSnapshot;
}

type DramaLabTaskStatus = "idle" | "queued" | "pending" | "running" | "success" | "error" | "cancelled";
type DramaLabGenerationHistory = { id: string; taskId: string; url: string; prompt: string; createdAt: string; width?: number; height?: number };

type DramaLabAudioSplitSegment = {
    index: number;
    kind: "dialogue" | "narration";
    speaker?: string;
    text: string;
    duration: number;
    durationMs: number;
    startMs: number;
    endMs: number;
    durationSource: "audio" | "rhythm" | "estimated";
    utterances: DramaUtterance[];
    candidateId: string;
};

type DramaLabAudioSplitPlan = {
    sourceShotId: string;
    sourceShotTitle: string;
    sourceFingerprint: string;
    segments: DramaLabAudioSplitSegment[];
    totalDurationMs: number;
    options?: Record<string, unknown>;
};

export interface Project {
    id: string;
    title: string;
    description?: string;
    style?: string;
    storyStyle?: string;
    scriptType?: string;
    scriptEpisodeCount?: number;
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

async function assertJsonApiResponse(response: Response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return;

    const preview = (await response.clone().text()).replace(/\s+/g, " ").trim().slice(0, 120);
    const suffix = preview ? ` 返回内容：${preview}` : "";
    throw new Error(`接口返回了非 JSON 响应（HTTP ${response.status}）。开发服务可能已失效，请刷新页面或重启 3002。${suffix}`);
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
                sourceRange: typeof episode.sourceRange === "string" ? episode.sourceRange : undefined,
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
                ...readDramaLabAssetVisualDetails(scene),
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

function normalizeAudioState(value: unknown): DramaShotAudioState | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const input = value as Record<string, unknown>;
    const status = typeof input.status === "string" && ["idle", "queued", "pending", "running", "success", "error", "cancelled"].includes(input.status) ? (input.status as DramaLabTaskStatus) : undefined;
    const url = typeof input.url === "string" && input.url.trim() ? input.url.trim() : undefined;
    const taskId = typeof input.taskId === "string" && input.taskId.trim() ? input.taskId.trim() : undefined;
    if (!status && !url && !taskId) return undefined;
    const number = (key: string) => {
        const value = Number(input[key]);
        return Number.isFinite(value) ? value : undefined;
    };
    return {
        status: status || (url ? "success" : "idle"),
        taskId,
        attempt: number("attempt"),
        error: typeof input.error === "string" ? input.error : undefined,
        url,
        mimeType: typeof input.mimeType === "string" ? input.mimeType : undefined,
        speaker: typeof input.speaker === "string" ? input.speaker : undefined,
        voice: typeof input.voice === "string" ? input.voice : undefined,
        speed: number("speed"),
        instructions: typeof input.instructions === "string" ? input.instructions : undefined,
        durationMs: number("durationMs"),
    };
}

function normalizeUtterances(value: unknown): DramaUtterance[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const input = item as Record<string, unknown>;
        const text = typeof input.text === "string" ? input.text.trim() : "";
        if (!text) return [];
        const type = input.type === "voiceover" ? "voiceover" : "dialogue";
        return [
            {
                id: typeof input.id === "string" && input.id.trim() ? input.id : `utterance-${index + 1}`,
                order: Number.isFinite(Number(input.order)) ? Number(input.order) : index + 1,
                type,
                speaker: typeof input.speaker === "string" ? input.speaker.trim() : "",
                text,
            },
        ];
    });
}

function normalizeShot(value: unknown, episodeId: string, index: number): Shot | undefined {
    if (!value || typeof value !== "object") return undefined;
    const shot = value as Record<string, unknown>;
    const id = typeof shot.id === "string" ? shot.id : "";
    if (!id) return undefined;
    const taskStatus = (value: unknown): DramaLabTaskStatus | undefined => (typeof value === "string" && ["idle", "queued", "pending", "running", "success", "error", "cancelled"].includes(value) ? (value as DramaLabTaskStatus) : undefined);
    const continuity = shot.continuity && typeof shot.continuity === "object" ? (shot.continuity as Record<string, unknown>) : undefined;
    const description = typeof shot.description === "string" ? shot.description : typeof shot.script === "string" ? shot.script : typeof shot.title === "string" ? shot.title : "";
    const storyboardImageUrl = typeof shot.storyboardImageUrl === "string" ? shot.storyboardImageUrl : typeof shot.imageUrl === "string" ? shot.imageUrl : undefined;
    const videoUrl = typeof shot.videoUrl === "string" ? shot.videoUrl : undefined;
    const readText = (...keys: string[]) => {
        for (const key of keys) {
            if (typeof shot[key] === "string" && shot[key].trim()) return shot[key].trim();
        }
        return undefined;
    };
    const readNumber = (...keys: string[]) => {
        for (const key of keys) {
            const number = Number(shot[key]);
            if (Number.isFinite(number)) return number;
        }
        return undefined;
    };
    return {
        id,
        episodeId: typeof shot.episodeId === "string" ? shot.episodeId : episodeId,
        shotNumber: readNumber("shotNumber", "shot_number", "order") || index + 1,
        sceneId: typeof shot.sceneId === "string" ? shot.sceneId : undefined,
        characterIds: Array.isArray(shot.characterIds) ? shot.characterIds.filter((item): item is string => typeof item === "string") : [],
        propIds: Array.isArray(shot.propIds) ? shot.propIds.filter((item): item is string => typeof item === "string") : [],
        script: description,
        title: typeof shot.title === "string" && shot.title.trim() ? shot.title : `镜头 ${typeof shot.shotNumber === "number" ? shot.shotNumber : index + 1}`,
        description,
        sourceText: typeof shot.sourceText === "string" ? shot.sourceText : description,
        shotBoundary: typeof shot.shotBoundary === "string" ? shot.shotBoundary : "",
        dialogue: typeof shot.dialogue === "string" ? shot.dialogue : "",
        narration: typeof shot.narration === "string" ? shot.narration : "",
        subtitle: typeof shot.subtitle === "string" ? shot.subtitle : undefined,
        audioMode: shot.audioMode === "voiceover" || shot.audioMode === "mute" || shot.audioMode === "source" ? shot.audioMode : undefined,
        utterances: normalizeUtterances(shot.utterances),
        imagePrompt: typeof shot.imagePrompt === "string" ? shot.imagePrompt : undefined,
        videoPrompt: typeof shot.videoPrompt === "string" ? shot.videoPrompt : undefined,
        cameraMotion: typeof shot.cameraMotion === "string" ? shot.cameraMotion : undefined,
        shotType: readText("shotType", "shot_type"),
        segmentIndex: readNumber("segmentIndex", "segment_index"),
        segmentTitle: readText("segmentTitle", "segment_title"),
        atmosphere: readText("atmosphere"),
        lightingStyle: readText("lightingStyle", "lighting_style"),
        depthOfField: readText("depthOfField", "depth_of_field"),
        creationMode: readText("creationMode", "creation_mode") === "universal" ? "universal" : "classic",
        universalSegmentText: readText("universalSegmentText", "universal_segment_text"),
        polishedPrompt: readText("polishedPrompt", "polished_prompt"),
        angleH: readText("angleH", "angle_h"),
        angleV: readText("angleV", "angle_v"),
        angleS: readText("angleS", "angle_s"),
        location: readText("location", "sceneLocation", "scene_location"),
        time: readText("time", "timeOfDay", "time_of_day"),
        action: readText("action"),
        result: readText("result", "outcome"),
        emotion: readText("emotion"),
        emotionIntensity: readNumber("emotionIntensity", "emotion_intensity"),
        layoutDescription: readText("layoutDescription", "layout_description"),
        continuity: continuity
            ? {
                  shotSize: readContinuityText(continuity, "shotSize", "shot_size"),
                  cameraAngle: readContinuityText(continuity, "cameraAngle", "camera_angle"),
                  composition: readContinuityText(continuity, "composition"),
                  characterBlocking: readContinuityText(continuity, "characterBlocking", "character_blocking"),
                  gazeDirection: readContinuityText(continuity, "gazeDirection", "gaze_direction"),
                  actionStart: readContinuityText(continuity, "actionStart", "action_start"),
                  actionEnd: readContinuityText(continuity, "actionEnd", "action_end"),
                  screenDirection: readContinuityText(continuity, "screenDirection", "screen_direction"),
                  axisRule: readContinuityText(continuity, "axisRule", "axis_rule"),
                  continuityNotes: readContinuityText(continuity, "continuityNotes", "continuity_notes"),
              }
            : undefined,
        imageUrl: storyboardImageUrl,
        videoUrl,
        duration: typeof shot.duration === "number" ? shot.duration : 3,
        cameraAngle: typeof shot.cameraAngle === "string" ? shot.cameraAngle : typeof continuity?.cameraAngle === "string" ? continuity.cameraAngle : undefined,
        startFramePrompt: readText("startFramePrompt", "start_frame_prompt"),
        endFramePrompt: readText("endFramePrompt", "end_frame_prompt"),
        storyboardStatus: taskStatus(shot.storyboardStatus) || (storyboardImageUrl ? "success" : "idle"),
        storyboardFrameMode: shot.storyboardFrameMode === "first_last" ? "first_last" : "single",
        storyboardAttempt: typeof shot.storyboardAttempt === "number" ? shot.storyboardAttempt : undefined,
        storyboardTaskId: typeof shot.storyboardTaskId === "string" ? shot.storyboardTaskId : undefined,
        storyboardError: typeof shot.storyboardError === "string" ? shot.storyboardError : undefined,
        storyboardImageUrl,
        storyboardImageWidth: typeof shot.storyboardImageWidth === "number" ? shot.storyboardImageWidth : undefined,
        storyboardImageHeight: typeof shot.storyboardImageHeight === "number" ? shot.storyboardImageHeight : undefined,
        storyboardHistory: normalizeGenerationHistory(shot.storyboardHistory),
        generationStatus: taskStatus(shot.generationStatus) || (videoUrl ? "success" : "idle"),
        generationAttempt: typeof shot.generationAttempt === "number" ? shot.generationAttempt : undefined,
        generationTaskId: typeof shot.generationTaskId === "string" ? shot.generationTaskId : undefined,
        // `executionPhase` was used by the legacy generic task UI. It is not
        // a video-generation phase and must never make a shot look busy after
        // a refresh. Only the transient, video-specific field is trusted.
        generationExecutionPhase: normalizeVideoExecutionPhase(shot.generationExecutionPhase),
        generationNeedsReview: shot.generationNeedsReview === true ? true : undefined,
        generationError: typeof shot.generationError === "string" ? shot.generationError : undefined,
        videoHistory: normalizeGenerationHistory(shot.videoHistory),
        dialogueAudio: normalizeAudioState(shot.dialogueAudio),
        narrationAudio: normalizeAudioState(shot.narrationAudio),
        audioStatus: taskStatus(shot.audioStatus) || (typeof shot.audioUrl === "string" && shot.audioUrl.trim() ? "success" : undefined),
        audioAttempt: typeof shot.audioAttempt === "number" ? shot.audioAttempt : undefined,
        audioTaskId: typeof shot.audioTaskId === "string" ? shot.audioTaskId : undefined,
        audioError: typeof shot.audioError === "string" ? shot.audioError : undefined,
        audioUrl: typeof shot.audioUrl === "string" ? shot.audioUrl : undefined,
        audioSplitSourceShotId: typeof shot.audioSplitSourceShotId === "string" ? shot.audioSplitSourceShotId : undefined,
        audioSplitSegmentIndex: typeof shot.audioSplitSegmentIndex === "number" ? shot.audioSplitSegmentIndex : undefined,
        frames:
            shot.frames && typeof shot.frames === "object"
                ? (Object.fromEntries(
                      Object.entries(shot.frames).flatMap(([key, value]) => {
                          if (!(key === "first" || key === "key" || key === "last") || !value || typeof value !== "object") return [];
                          const frame = value as Record<string, unknown>;
                          return [
                              [
                                  key,
                                  {
                                      prompt: typeof frame.prompt === "string" ? frame.prompt : "",
                                      description: typeof frame.description === "string" ? frame.description : undefined,
                                      status: taskStatus(frame.status) || "idle",
                                      taskId: typeof frame.taskId === "string" ? frame.taskId : undefined,
                                      attempt: typeof frame.attempt === "number" ? frame.attempt : undefined,
                                      url: typeof frame.url === "string" ? frame.url : undefined,
                                      storageKey: typeof frame.storageKey === "string" ? frame.storageKey : undefined,
                                      width: typeof frame.width === "number" ? frame.width : undefined,
                                      height: typeof frame.height === "number" ? frame.height : undefined,
                                      error: typeof frame.error === "string" ? frame.error : undefined,
                                      history: normalizeGenerationHistory(frame.history),
                                      source: frame.source === "generated" || frame.source === "uploaded" || frame.source === "video_tail" || frame.source === "restored" ? frame.source : undefined,
                                      sourceVideoTaskId: typeof frame.sourceVideoTaskId === "string" ? frame.sourceVideoTaskId : undefined,
                                      sourceShotId: typeof frame.sourceShotId === "string" ? frame.sourceShotId : undefined,
                                      sourceVideoHistoryId: typeof frame.sourceVideoHistoryId === "string" ? frame.sourceVideoHistoryId : undefined,
                                      locked: frame.locked === true,
                                  },
                              ],
                          ];
                      }),
                  ) as Shot["frames"])
                : undefined,
        firstFrameCandidate: normalizeFrameCandidate(shot.firstFrameCandidate),
        videoFrameSnapshot: normalizeVideoFrameSnapshot(shot.videoFrameSnapshot),
    };
}

function normalizeFrameCandidate(value: unknown): Shot["firstFrameCandidate"] {
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.url !== "string" || candidate.source !== "video_tail") return undefined;
    if (typeof candidate.sourceVideoTaskId !== "string" || typeof candidate.sourceShotId !== "string" || typeof candidate.sourceVideoHistoryId !== "string") return undefined;
    return {
        id: candidate.id,
        frameType: "first",
        url: candidate.url,
        storageKey: typeof candidate.storageKey === "string" ? candidate.storageKey : undefined,
        width: typeof candidate.width === "number" ? candidate.width : undefined,
        height: typeof candidate.height === "number" ? candidate.height : undefined,
        source: "video_tail",
        sourceVideoTaskId: candidate.sourceVideoTaskId,
        sourceShotId: candidate.sourceShotId,
        sourceVideoHistoryId: candidate.sourceVideoHistoryId,
        createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
        projectUpdatedAt: typeof candidate.projectUpdatedAt === "string" ? candidate.projectUpdatedAt : "",
    };
}

function normalizeVideoFrameSnapshot(value: unknown): DramaShotVideoFrameSnapshot | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const input = value as Record<string, unknown>;
    const capturedAt = typeof input.capturedAt === "string" ? input.capturedAt : "";
    if (!capturedAt || typeof input.supportsLastFrame !== "boolean" || !Array.isArray(input.references)) return undefined;
    const references = input.references.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const reference = item as Record<string, unknown>;
        const role = reference.role === "first_frame" || reference.role === "last_frame" || reference.role === "reference" ? (reference.role as DramaShotVideoFrameSnapshot["references"][number]["role"]) : undefined;
        const url = typeof reference.url === "string" ? reference.url.trim() : "";
        if (!role || !url) return [];
        return [
            {
                role,
                frameType: reference.frameType === "first" || reference.frameType === "key" || reference.frameType === "last" ? (reference.frameType as "first" | "key" | "last") : undefined,
                url,
                storageKey: typeof reference.storageKey === "string" ? reference.storageKey : undefined,
                taskId: typeof reference.taskId === "string" ? reference.taskId : undefined,
                source:
                    reference.source === "generated" || reference.source === "uploaded" || reference.source === "video_tail" || reference.source === "restored"
                        ? (reference.source as NonNullable<DramaShotVideoFrameSnapshot["references"][number]["source"]>)
                        : undefined,
                sourceVideoTaskId: typeof reference.sourceVideoTaskId === "string" ? reference.sourceVideoTaskId : undefined,
                sourceShotId: typeof reference.sourceShotId === "string" ? reference.sourceShotId : undefined,
                sourceVideoHistoryId: typeof reference.sourceVideoHistoryId === "string" ? reference.sourceVideoHistoryId : undefined,
            },
        ];
    });
    if (!references.length) return undefined;
    return {
        capturedAt,
        model: typeof input.model === "string" ? input.model : undefined,
        supportsFirstFrame: typeof input.supportsFirstFrame === "boolean" ? input.supportsFirstFrame : undefined,
        supportsLastFrame: input.supportsLastFrame,
        maxReferenceImages: typeof input.maxReferenceImages === "number" ? input.maxReferenceImages : undefined,
        fallbackReason: typeof input.fallbackReason === "string" ? input.fallbackReason : undefined,
        references,
    };
}

// Task polling and frame actions return a complete server-side shot.  The
// response may have been based on an older project revision than a local text
// edit, so only merge fields owned by generation/synchronization workflows.
function mergeSynchronizedShot(current: Shot, raw: unknown, episodeId: string): Shot {
    const normalized = normalizeShot(raw, episodeId, Math.max(0, current.shotNumber - 1));
    if (!normalized || !raw || typeof raw !== "object" || Array.isArray(raw)) return current;
    const source = raw as Record<string, unknown>;
    const patch: Partial<Shot> = {};
    const taskFields: Array<keyof Shot> = [
        "storyboardStatus",
        "storyboardAttempt",
        "storyboardTaskId",
        "storyboardError",
        "storyboardImageUrl",
        "storyboardImageWidth",
        "storyboardImageHeight",
        "storyboardHistory",
        "generationStatus",
        "generationAttempt",
        "generationTaskId",
        "generationExecutionPhase",
        "generationNeedsReview",
        "generationError",
        "videoUrl",
        "videoHistory",
        "videoFrameSnapshot",
        "dialogueAudio",
        "narrationAudio",
        "audioStatus",
        "audioAttempt",
        "audioTaskId",
        "audioError",
        "audioUrl",
    ];
    for (const field of taskFields) {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            (patch as Record<string, unknown>)[field] = normalized[field];
        }
    }
    if (Object.prototype.hasOwnProperty.call(source, "frames")) {
        if (!source.frames || typeof source.frames !== "object" || Array.isArray(source.frames)) {
            patch.frames = normalized.frames;
        } else {
            const mergedFrames = { ...(current.frames || {}) } as NonNullable<Shot["frames"]>;
            for (const [frameType, rawFrame] of Object.entries(source.frames)) {
                if (!(frameType === "first" || frameType === "key" || frameType === "last") || !rawFrame || typeof rawFrame !== "object" || Array.isArray(rawFrame)) continue;
                const normalizedFrame = normalized.frames?.[frameType];
                if (!normalizedFrame) continue;
                const nextFrame = { ...(current.frames?.[frameType] || {}) } as Record<string, unknown>;
                for (const field of ["prompt", "description", "status", "taskId", "attempt", "url", "storageKey", "width", "height", "error", "history", "source", "sourceVideoTaskId", "sourceShotId", "sourceVideoHistoryId", "locked"]) {
                    if (!Object.prototype.hasOwnProperty.call(rawFrame, field)) continue;
                    const value = (normalizedFrame as Record<string, unknown>)[field];
                    if (value === undefined) delete nextFrame[field];
                    else nextFrame[field] = value;
                }
                mergedFrames[frameType] = nextFrame as NonNullable<Shot["frames"]>["first"];
            }
            patch.frames = mergedFrames;
        }
    }
    if (Object.prototype.hasOwnProperty.call(source, "firstFrameCandidate")) patch.firstFrameCandidate = normalized.firstFrameCandidate;
    return Object.keys(patch).length ? { ...current, ...patch } : current;
}

function readContinuityText(value: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
    return "";
}

function normalizeGenerationHistory(value: unknown): DramaLabGenerationHistory[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const id = typeof entry.id === "string" ? entry.id : "";
        const taskId = typeof entry.taskId === "string" ? entry.taskId : "";
        const url = typeof entry.url === "string" ? entry.url : "";
        if (!id || !taskId || !url) return [];
        return [
            {
                id,
                taskId,
                url,
                prompt: typeof entry.prompt === "string" ? entry.prompt : "",
                createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
                width: typeof entry.width === "number" ? entry.width : undefined,
                height: typeof entry.height === "number" ? entry.height : undefined,
            },
        ];
    });
}

function normalizeVideoExecutionPhase(value: unknown): DramaLabVideoBatchExecutionPhase | undefined {
    return typeof value === "string" && ["created", "submitting", "submitted", "polling", "result_ready", "persisting", "cancel_requested", "cancel_polling", "needs_review", "completed"].includes(value)
        ? (value as DramaLabVideoBatchExecutionPhase)
        : undefined;
}

function abortOperationError() {
    return new DOMException("Aborted", "AbortError");
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortOperationError());
    return new Promise<T>((resolve, reject) => {
        const abort = () => {
            signal.removeEventListener("abort", abort);
            reject(abortOperationError());
        };
        signal.addEventListener("abort", abort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", abort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", abort);
                reject(error);
            },
        );
    });
}

function missingShotAssetLabels(project: Project, shot: Shot) {
    const missing: string[] = [];
    const hasReference = (asset: Character | Scene | Prop) => {
        const referenceUrl = asset.referenceImageUrl || asset.imageUrl || asset.references?.find((reference) => reference.id === asset.primaryReferenceId)?.url || asset.references?.find((reference) => reference.url.trim())?.url;
        return Boolean(referenceUrl?.trim());
    };
    const scene = shot.sceneId ? project.scenes.find((asset) => asset.id === shot.sceneId) : undefined;
    if (scene && !hasReference(scene)) missing.push(`场景「${scene.name || scene.location}」`);
    shot.characterIds.forEach((id) => {
        const character = project.characters.find((asset) => asset.id === id);
        if (character && !hasReference(character)) missing.push(`角色「${character.name}」`);
    });
    shot.propIds.forEach((id) => {
        const prop = project.props.find((asset) => asset.id === id);
        if (prop && !hasReference(prop)) missing.push(`道具「${prop.name}」`);
    });
    return missing;
}

function dramaLabGenerationSyncKey(shot: Shot) {
    return `${shot.id}:${shot.storyboardTaskId || ""}:${shot.generationTaskId || ""}:${Object.entries(shot.frames || {})
        .map(([type, frame]) => `${type}:${frame?.taskId || ""}`)
        .join(",")}`;
}

function isDramaLabTaskActive(status: DramaLabTaskStatus | undefined, executionPhase?: DramaLabVideoBatchExecutionPhase, needsReview = false) {
    if (needsReview || executionPhase === "needs_review") return false;
    return status === "queued" || status === "pending" || status === "running";
}

function isDramaLabVideoTaskActive(shot: Pick<Shot, "generationTaskId" | "generationStatus" | "generationExecutionPhase" | "generationNeedsReview">) {
    if (!shot.generationTaskId?.trim() || shot.generationNeedsReview || shot.generationExecutionPhase === "needs_review") return false;
    // A terminal project status wins over stale transient metadata left by a
    // previous page instance or an interrupted sync.
    if (shot.generationStatus === "success" || shot.generationStatus === "error" || shot.generationStatus === "cancelled") return false;
    return isDramaLabTaskActive(shot.generationStatus, shot.generationExecutionPhase) || isDramaLabExecutionActive(shot.generationExecutionPhase, shot.generationTaskId);
}

function hasNonEmptyAudioText(value: string | undefined) {
    return Boolean(value?.trim());
}

function hasUtteranceType(shot: Shot, type: DramaUtterance["type"]) {
    return Boolean(shot.utterances?.some((utterance) => utterance.type === type && hasNonEmptyAudioText(utterance.text)));
}

/**
 * Legacy shots stored one audio state on the root object. Infer its owner
 * once, rather than exposing the same state in both independent track cards.
 */
function legacyAudioKind(shot: Shot): "dialogue" | "narration" {
    const hasDialogue = hasNonEmptyAudioText(shot.dialogue) || hasNonEmptyAudioText(shot.subtitle) || hasUtteranceType(shot, "dialogue");
    const hasNarration = hasNonEmptyAudioText(shot.narration) || hasUtteranceType(shot, "voiceover");
    // The legacy voiceover mode means "generated audio" and does not
    // identify narration. Infer the track from persisted text instead.
    if (hasDialogue) return "dialogue";
    if (hasNarration) return "narration";
    return "dialogue";
}

function audioStateForKind(shot: Shot, kind: "dialogue" | "narration") {
    // New projects persist each track independently. Preserve an explicitly
    // present state, including an idle/error state, without legacy fallback.
    const state = kind === "narration" ? shot.narrationAudio : shot.dialogueAudio;
    if (state) return state;

    const hasLegacyState = Boolean(shot.audioTaskId || shot.audioUrl || shot.audioStatus || shot.audioError || shot.audioAttempt !== undefined);
    if (!hasLegacyState) return undefined;

    const legacyTaskId = shot.audioTaskId?.trim();
    const opposite = kind === "narration" ? shot.dialogueAudio : shot.narrationAudio;
    // Root fields are projected from the latest requested track. If the root
    // id is the opposite dedicated track's id, it must not appear as a
    // recoverable state on the missing card.
    if (legacyTaskId && opposite?.taskId?.trim() === legacyTaskId) return undefined;
    // A partially migrated shot may still have a root task for its missing
    // track. With an opposite dedicated state, require unambiguous text
    // ownership; without one, preserve the legacy dialogue-first rule.
    if (ambiguousLegacyAudioText(shot)) return undefined;
    if (shot.dialogueAudio || shot.narrationAudio ? strictLegacyAudioKind(shot) !== kind : legacyAudioKind(shot) !== kind) return undefined;

    return {
        status: shot.audioStatus || (shot.audioUrl ? "success" : "idle"),
        taskId: shot.audioTaskId,
        attempt: shot.audioAttempt,
        error: shot.audioError,
        url: shot.audioUrl,
    } satisfies DramaShotAudioState;
}

function audioTextForKind(shot: Shot, kind: "dialogue" | "narration") {
    const utteranceType = kind === "narration" ? "voiceover" : "dialogue";
    const utteranceText = (shot.utterances || [])
        .filter((utterance) => utterance.type === utteranceType)
        .map((utterance) => utterance.text.trim())
        .filter(Boolean)
        .join("\n");
    if (utteranceText) return utteranceText;
    return (kind === "narration" ? shot.narration || "" : shot.dialogue || shot.subtitle || "").trim();
}

function strictLegacyAudioKind(shot: Shot): "dialogue" | "narration" | undefined {
    const hasDialogue = hasNonEmptyAudioText(shot.dialogue) || hasNonEmptyAudioText(shot.subtitle) || hasUtteranceType(shot, "dialogue");
    const hasNarration = hasNonEmptyAudioText(shot.narration) || hasUtteranceType(shot, "voiceover");
    if (hasDialogue && !hasNarration) return "dialogue";
    if (hasNarration && !hasDialogue) return "narration";
    return undefined;
}

function ambiguousLegacyAudioReviewReason(shot: Shot) {
    const legacyUrl = stableAudioSourceUrl(shot.audioUrl);
    if (!legacyUrl) return undefined;
    if (!ambiguousLegacyAudioText(shot)) return undefined;
    const dedicatedUrls = [shot.dialogueAudio?.url, shot.narrationAudio?.url].map((url) => stableAudioSourceUrl(url)).filter(Boolean);
    if (dedicatedUrls.includes(legacyUrl)) return undefined;
    return "旧版 audioUrl 同时对应对白和旁白文本，系统不会猜测归属；请先确认后再用于成片。";
}

function ambiguousLegacyAudioText(shot: Shot) {
    const hasDialogue = hasNonEmptyAudioText(shot.dialogue) || hasNonEmptyAudioText(shot.subtitle) || hasUtteranceType(shot, "dialogue");
    const hasNarration = hasNonEmptyAudioText(shot.narration) || hasUtteranceType(shot, "voiceover");
    return hasDialogue && hasNarration;
}

function stableAudioSourceUrl(value: unknown) {
    if (typeof value !== "string") return "";
    const url = value.trim();
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

const dramaLabRecoveryStarted = new Set<string>();

function isDramaLabExecutionActive(phase: DramaLabVideoBatchExecutionPhase | undefined, taskId?: string) {
    return Boolean(taskId?.trim()) && (phase === "created" || phase === "submitting" || phase === "submitted" || phase === "polling" || phase === "result_ready" || phase === "persisting" || phase === "cancel_requested" || phase === "cancel_polling");
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

export function DramaWorkflowLabProject({ projectId, initialEpisodeId, initialStep }: { projectId: string; initialEpisodeId?: string; initialStep?: StepKey }) {
    const [messageApi, contextHolder] = message.useMessage();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [activeStep, setActiveStep] = useState<StepKey>(initialStep || "script");
    const [activeEpisodeId, setActiveEpisodeId] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [expandedEpisodeIds, setExpandedEpisodeIds] = useState<Set<string>>(new Set());
    const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
    const [collaborationEnabled, setCollaborationEnabled] = useState(true);
    const [collaborationMode, setCollaborationMode] = useState<"strict" | "parallel">("strict");
    const [collaborationCollapsed, setCollaborationCollapsed] = useState(true);
    const [collaborationDrawerOpen, setCollaborationDrawerOpen] = useState(false);
    const [approvalStages, setApprovalStages] = useState<Record<CollaborationStageKey, boolean>>({
        script: true,
        asset_prompts: true,
        storyboard: true,
        visual_images: true,
        storyboard_video: true,
        final_cut: true,
    });
    const [approvalStatuses, setApprovalStatuses] = useState<Record<CollaborationStageKey, CollaborationApprovalStatus>>({
        script: "draft",
        asset_prompts: "draft",
        storyboard: "draft",
        visual_images: "draft",
        storyboard_video: "draft",
        final_cut: "draft",
    });
    const [feedbackRequired, setFeedbackRequired] = useState(true);
    const [notifyOnReturn, setNotifyOnReturn] = useState(true);
    const [allowFeedbackAttachments, setAllowFeedbackAttachments] = useState(false);
    const [collaborationFeedback, setCollaborationFeedback] = useState<CollaborationFeedback[]>([]);
    const [collaborationOverview, setCollaborationOverview] = useState<DramaLabCollaborationOverview | null>(null);
    const [collaborationApprovals, setCollaborationApprovals] = useState<DramaLabCollaborationApprovalRecord[]>([]);
    const [collaborationApprovalPage, setCollaborationApprovalPage] = useState(1);
    const [collaborationApprovalTotal, setCollaborationApprovalTotal] = useState(0);
    const [collaborationApprovalLoadingMore, setCollaborationApprovalLoadingMore] = useState(false);
    const [collaborationLoading, setCollaborationLoading] = useState(false);
    const [collaborationError, setCollaborationError] = useState<string>();
    const [collaborationActionBusy, setCollaborationActionBusy] = useState(false);
    const [lastInviteUrl, setLastInviteUrl] = useState<string>();
    const pendingStoryboardShotId = useRef<string | undefined>(undefined);
    const initialStoryboardHashHandledRef = useRef(false);
    const projectRef = useRef<Project | null>(null);
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    const collaborationApi = useCallback(
        async (path: string, init?: RequestInit) => {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/collaboration${path}`, {
                ...init,
                headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
                cache: "no-store",
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: unknown; msg?: unknown; data?: unknown };
            if (!response.ok || (payload.code !== undefined && Number(payload.code) !== 0)) throw new Error(String(payload.msg || `协作请求失败（${response.status}）`));
            return payload.data;
        },
        [projectId],
    );

    const loadCollaboration = useCallback(async () => {
        setCollaborationLoading(true);
        setCollaborationError(undefined);
        try {
            const [overviewData, approvalsData] = await Promise.all([collaborationApi(""), collaborationApi("/approvals?page=1&pageSize=20")]);
            const overview = overviewData as DramaLabCollaborationOverview;
            const approvalPage = (approvalsData as { items?: DramaLabCollaborationApprovalRecord[]; total?: number; page?: number } | undefined) || {};
            const approvals = approvalPage.items || [];
            setCollaborationOverview(overview);
            setCollaborationApprovals(approvals);
            setCollaborationApprovalPage(Number(approvalPage.page) || 1);
            setCollaborationApprovalTotal(Number(approvalPage.total) || approvals.length);

            const configs = overview.approvalConfigs || [];
            // A project with no config rows is a newly-created collaboration
            // group and remains available for setup. Once rows exist, the
            // switch mirrors whether at least one approval stage is enabled.
            setCollaborationEnabled(configs.length === 0 || configs.some((config) => config.enabled));
            setApprovalStages((current) => {
                const next = { ...current };
                for (const stage of COLLABORATION_STAGES) {
                    const apiStage = DRAMA_LAB_UI_TO_API_STAGE[stage.key];
                    const config = configs.find((item) => item.stage === apiStage);
                    next[stage.key] = config ? config.enabled : false;
                }
                return next;
            });
            setCollaborationMode(configs.some((config) => config.enabled && config.strictMode) ? "strict" : "parallel");
            setApprovalStatuses((current) => {
                const next = { ...current };
                for (const stage of COLLABORATION_STAGES) {
                    const apiStage = DRAMA_LAB_UI_TO_API_STAGE[stage.key];
                    const latest = approvals.filter((item) => item.stage === apiStage && dramaLabApprovalMatchesEpisode(item, stage.key, activeEpisodeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                    next[stage.key] = latest?.status === "pending" ? "submitted" : latest?.status === "approved" ? "approved" : latest?.status === "rejected" ? "returned" : "draft";
                }
                return next;
            });
            setCollaborationFeedback(
                approvals
                    .filter((item) => item.reviewComment)
                    .slice(0, 20)
                    .map((item) => ({ id: item.id, stage: DRAMA_LAB_API_TO_UI_STAGE[item.stage] || "script", content: item.reviewComment || "", createdAt: item.reviewedAt || item.updatedAt })),
            );
        } catch (error) {
            setCollaborationError(error instanceof Error ? error.message : "协作数据加载失败");
        } finally {
            setCollaborationLoading(false);
        }
    }, [activeEpisodeId, collaborationApi]);

    const loadMoreCollaborationApprovals = useCallback(async () => {
        if (collaborationApprovalLoadingMore || collaborationApprovals.length >= collaborationApprovalTotal) return;
        setCollaborationApprovalLoadingMore(true);
        try {
            const nextPage = collaborationApprovalPage + 1;
            const data = (await collaborationApi(`/approvals?page=${nextPage}&pageSize=20`)) as { items?: DramaLabCollaborationApprovalRecord[]; total?: number; page?: number } | undefined;
            const nextItems = data?.items || [];
            setCollaborationApprovals((current) => {
                const seen = new Set(current.map((item) => item.id));
                return [...current, ...nextItems.filter((item) => !seen.has(item.id))];
            });
            setCollaborationApprovalPage(Number(data?.page) || nextPage);
            setCollaborationApprovalTotal(Number(data?.total) || collaborationApprovalTotal);
        } catch (error) {
            setCollaborationError(error instanceof Error ? error.message : "瀹℃壒鍘嗗彶鍔犺浇澶辫触");
        } finally {
            setCollaborationApprovalLoadingMore(false);
        }
    }, [collaborationApi, collaborationApprovalLoadingMore, collaborationApprovalPage, collaborationApprovalTotal, collaborationApprovals.length]);

    useEffect(() => {
        void loadCollaboration();
    }, [loadCollaboration]);

    // 加载项目数据
    const loadProject = useCallback(
        async (options: { silent?: boolean } = {}) => {
            const silent = options.silent === true;
            if (!silent) setLoading(true);
            setError(undefined);
            const controller = new AbortController();
            // A cold Next.js route compile can exceed 15 seconds in development;
            // do not abort an otherwise healthy project read before it responds.
            const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
            try {
                const response = await fetch(`/api/drama-lab/projects/${projectId}`, { signal: controller.signal });
                await assertJsonApiResponse(response);
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
                    storyStyle: proj.storyStyle ?? legacy.storyStyle ?? "",
                    scriptType: proj.scriptType ?? legacy.scriptType ?? "",
                    scriptEpisodeCount: Number(proj.scriptEpisodeCount ?? legacy.scriptEpisodeCount) || 1,
                    aspectRatio: proj.ratio ?? legacy.aspectRatio ?? "16:9",
                    episodes,
                    characters: (proj.characters ?? legacy.characters ?? []) as Character[],
                    scenes: normalizeScenes(proj.scenes ?? legacy.scenes),
                    props: (proj.props ?? legacy.props ?? []) as Prop[],
                    shots: normalizeProjectShots(proj as Record<string, unknown>, episodes, legacy),
                });

                if (episodes.length > 0) {
                    // Keep the episode currently being edited when a background
                    // task recovery reloads the project.
                    setActiveEpisodeId((current) => (current && episodes.some((episode) => episode.id === current) ? current : initialEpisodeId || episodes[0].id));
                }
                setExpandedEpisodeIds(new Set(episodes.map((episode: Episode) => episode.id)));
            } catch (err) {
                setError(err instanceof DOMException && err.name === "AbortError" ? "项目加载超时，请重试" : err instanceof Error ? err.message : "加载失败");
            } finally {
                window.clearTimeout(timeoutId);
                if (!silent) setLoading(false);
            }
        },
        [initialEpisodeId, projectId],
    );

    useEffect(() => {
        void loadProject();
    }, [loadProject]);

    useEffect(() => {
        if (activeStep !== "storyboard" || !pendingStoryboardShotId.current) return;
        focusDramaLabShot(pendingStoryboardShotId.current);
        pendingStoryboardShotId.current = undefined;
    }, [activeEpisodeId, activeStep]);

    // The canvas return link carries the shot in the URL hash so the server
    // route stays cacheable. Resolve it after the client workbench mounts.
    useEffect(() => {
        if (activeStep !== "storyboard" || pendingStoryboardShotId.current || initialStoryboardHashHandledRef.current || typeof window === "undefined") return;
        const match = window.location.hash.match(/^#storyboard-shot-(.+)$/);
        if (!match?.[1]) return;
        let shotId = "";
        try {
            shotId = decodeURIComponent(match[1]);
        } catch {
            return;
        }
        if (!shotId) return;
        pendingStoryboardShotId.current = shotId;
        requestAnimationFrame(() => {
            const target = document.getElementById(`storyboard-shot-${shotId}`);
            if (target) focusDramaLabShot(shotId);
            if (target) initialStoryboardHashHandledRef.current = true;
            pendingStoryboardShotId.current = undefined;
        });
    }, [activeStep, activeEpisodeId, project]);

    // 保存项目数据
    const saveProject = async (updatesOrUpdater: ProjectUpdate, options: SaveOptions = {}): Promise<boolean> => {
        const save = async () => {
            const current = projectRef.current;
            if (!current) return false;
            const updates = typeof updatesOrUpdater === "function" ? updatesOrUpdater(current) : updatesOrUpdater;
            const nextProject = { ...current, ...updates };
            const persistedShots = nextProject.shots.map(({ generationExecutionPhase: _generationExecutionPhase, ...shot }) => shot);

            setSaving(true);
            try {
                const response = await fetch(`/api/drama-lab/projects/${projectId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: nextProject.title,
                        summary: nextProject.description,
                        style: nextProject.style,
                        ...(nextProject.storyStyle ? { storyStyle: nextProject.storyStyle } : { storyStyle: "" }),
                        ...(nextProject.scriptType ? { scriptType: nextProject.scriptType } : { scriptType: "" }),
                        scriptEpisodeCount: nextProject.scriptEpisodeCount || 1,
                        ratio: nextProject.aspectRatio,
                        episodes: nextProject.episodes,
                        characters: nextProject.characters,
                        scenes: nextProject.scenes,
                        props: nextProject.props,
                        shots: persistedShots,
                    }),
                });

                await assertJsonApiResponse(response);
                const data = await response.json();
                if (data.code !== 0) throw new Error(data.msg || "保存失败");

                if (!options.silent) messageApi.success({ content: "保存成功", key: "drama-project-save" });
                projectRef.current = nextProject;
                setProject(nextProject);
                return true;
            } catch (err) {
                if (!options.silent) messageApi.error({ content: err instanceof Error ? err.message : "保存失败", key: "drama-project-save" });
                return false;
            } finally {
                setSaving(false);
            }
        };

        // Generation requests run in parallel, but full-project writes are
        // serialized so every update is calculated from the latest project.
        const queued = saveQueueRef.current.then(save, save);
        saveQueueRef.current = queued.catch(() => false);
        return queued;
    };

    const updateProjectShotFromSync = useCallback((episodeId: string, shotId: string, rawShot: unknown) => {
        setProject((current) => {
            if (!current) return current;
            const shotIndex = current.shots.findIndex((shot) => shot.id === shotId && shot.episodeId === episodeId);
            if (shotIndex < 0) return current;
            const currentShot = current.shots[shotIndex];
            const nextShot = mergeSynchronizedShot(currentShot, rawShot, episodeId);
            if (JSON.stringify(currentShot) === JSON.stringify(nextShot)) return current;

            const shots = [...current.shots];
            shots[shotIndex] = nextShot;
            const nextProject = { ...current, shots };
            // saveProject reads this ref before React effects run. Keep it in lockstep
            // with a server-synchronized task update so a following full-project save
            // cannot write an older task state back over the persisted result.
            projectRef.current = nextProject;
            return nextProject;
        });
    }, []);

    const applyStoryboardCheckpoint = useCallback((episodeId: string, checkpointShots: unknown[]) => {
        if (!checkpointShots.length) return;
        setProject((current) => {
            if (!current) return current;
            const existing = new Set(current.shots.map((shot) => shot.id));
            const additions = checkpointShots
                .filter((shot): shot is Record<string, unknown> => Boolean(shot && typeof shot === "object" && typeof (shot as { id?: unknown }).id === "string" && !existing.has((shot as { id: string }).id)))
                .map((shot, index) => ({
                    ...shot,
                    episodeId,
                    shotNumber: Number(shot.shotNumber ?? shot.order ?? index + 1),
                    script: typeof shot.script === "string" ? shot.script : typeof shot.description === "string" ? shot.description : "",
                    duration: Number(shot.duration ?? 3),
                    characterIds: Array.isArray(shot.characterIds) ? shot.characterIds : [],
                    propIds: Array.isArray(shot.propIds) ? shot.propIds : [],
                })) as Shot[];
            if (!additions.length) return current;
            const nextProject = { ...current, shots: [...current.shots, ...additions].sort((left, right) => left.episodeId.localeCompare(right.episodeId) || left.shotNumber - right.shotNumber) };
            projectRef.current = nextProject;
            return nextProject;
        });
    }, []);

    const activeEpisode = project?.episodes.find((ep) => ep.id === activeEpisodeId);
    const locateStoryboardShot = (episodeId: string, shotId: string) => {
        pendingStoryboardShotId.current = shotId;
        if (activeStep === "storyboard" && activeEpisodeId === episodeId) {
            focusDramaLabShot(shotId);
            pendingStoryboardShotId.current = undefined;
        }
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
    const persistApprovalConfigs = useCallback(
        async (stages: Record<CollaborationStageKey, boolean>, strictMode: boolean) => {
            const existing = collaborationOverview?.approvalConfigs || [];
            const configs = ["script", "assets", "storyboard", "storyboard_image", "storyboard_video", "final_export"].map((apiStage) => {
                const uiStage = DRAMA_LAB_API_TO_UI_STAGE[apiStage];
                const previous = existing.find((item) => item.stage === apiStage);
                return {
                    stage: apiStage,
                    enabled: uiStage ? stages[uiStage] : previous?.enabled === true,
                    reviewerScope: previous?.reviewerScope || "admins",
                    reviewerUserIds: previous?.reviewerUserIds || [],
                    strictMode,
                };
            });
            await collaborationApi("", { method: "PUT", body: JSON.stringify({ configs }) });
            await loadCollaboration();
        },
        [collaborationApi, collaborationOverview?.approvalConfigs, loadCollaboration],
    );
    const setApprovalStageEnabled = (stageKey: CollaborationStageKey, enabled: boolean) => {
        const next = { ...approvalStages, [stageKey]: enabled };
        setApprovalStages(next);
        if (!enabled) setApprovalStatuses((current) => ({ ...current, [stageKey]: "draft" }));
        setCollaborationActionBusy(true);
        void persistApprovalConfigs(next, collaborationMode === "strict")
            .then(() => messageApi.success("审批配置已保存"))
            .catch((error) => {
                messageApi.error(error instanceof Error ? error.message : "审批配置保存失败");
                void loadCollaboration();
            })
            .finally(() => setCollaborationActionBusy(false));
    };
    const setCollaborationModePersisted = (nextMode: "strict" | "parallel") => {
        setCollaborationMode(nextMode);
        setCollaborationActionBusy(true);
        void persistApprovalConfigs(approvalStages, nextMode === "strict")
            .then(() => messageApi.success("协作模式已保存"))
            .catch((error) => messageApi.error(error instanceof Error ? error.message : "协作模式保存失败"))
            .finally(() => setCollaborationActionBusy(false));
    };
    const setCollaborationEnabledPersisted = (enabled: boolean) => {
        setCollaborationEnabled(enabled);
        const disabled = { script: false, asset_prompts: false, storyboard: false, visual_images: false, storyboard_video: false, final_cut: false } satisfies Record<CollaborationStageKey, boolean>;
        const restored = { script: true, asset_prompts: true, storyboard: true, visual_images: true, storyboard_video: true, final_cut: true } satisfies Record<CollaborationStageKey, boolean>;
        if (!enabled) {
            setApprovalStages(disabled);
            setCollaborationActionBusy(true);
            void persistApprovalConfigs(disabled, collaborationMode === "strict")
                .then(() => messageApi.success("已关闭阶段审批"))
                .catch((error) => messageApi.error(error instanceof Error ? error.message : "审批配置保存失败"))
                .finally(() => setCollaborationActionBusy(false));
        } else {
            const next = Object.values(approvalStages).some(Boolean) ? approvalStages : restored;
            setApprovalStages(next);
            setCollaborationActionBusy(true);
            void persistApprovalConfigs(next, collaborationMode === "strict")
                .then(() => messageApi.success("已启用团队审批"))
                .catch((error) => {
                    messageApi.error(error instanceof Error ? error.message : "审批配置保存失败");
                    void loadCollaboration();
                })
                .finally(() => setCollaborationActionBusy(false));
        }
    };
    const submitForApproval = (stageKey: CollaborationStageKey) => {
        const block = stageApprovalBlock(stageKey);
        if (block) {
            messageApi.warning(block);
            return;
        }
        if (!project) return;
        const apiStage = DRAMA_LAB_UI_TO_API_STAGE[stageKey];
        const shot = activeEpisode ? project.shots.find((item) => item.episodeId === activeEpisode.id) : undefined;
        const resource =
            (stageKey === "script" || stageKey === "storyboard") && activeEpisode
                ? { resourceType: "episode", resourceId: activeEpisode.id, episodeId: activeEpisode.id }
                : (stageKey === "visual_images" || stageKey === "storyboard_video") && shot
                  ? { resourceType: "shot", resourceId: shot.id, episodeId: shot.episodeId }
                  : { resourceType: "project", resourceId: project.id };
        setCollaborationActionBusy(true);
        void collaborationApi("/approvals", {
            method: "POST",
            body: JSON.stringify({ stage: apiStage, ...resource, snapshot: { projectId: project.id, episodeId: activeEpisode?.id, stage: stageKey, updatedAt: new Date().toISOString() } }),
        })
            .then(() => loadCollaboration())
            .then(() => messageApi.success("已提交审核"))
            .catch((error) => messageApi.error(error instanceof Error ? error.message : "提交审核失败"))
            .finally(() => setCollaborationActionBusy(false));
    };
    const findPendingApproval = (stageKey: CollaborationStageKey) => {
        const apiStage = DRAMA_LAB_UI_TO_API_STAGE[stageKey];
        return collaborationApprovals.filter((item) => item.status === "pending" && item.stage === apiStage && dramaLabApprovalMatchesEpisode(item, stageKey, activeEpisodeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    };
    const approveStage = (stageKey: CollaborationStageKey) => {
        const approval = findPendingApproval(stageKey);
        if (!approval) {
            messageApi.warning("没有可处理的待审批记录");
            return;
        }
        setCollaborationActionBusy(true);
        void collaborationApi(`/approvals/${encodeURIComponent(approval.id)}`, { method: "POST", body: JSON.stringify({ decision: "approve" }) })
            .then(() => loadCollaboration())
            .then(() => messageApi.success("审批已通过"))
            .catch((error) => messageApi.error(error instanceof Error ? error.message : "审批处理失败"))
            .finally(() => setCollaborationActionBusy(false));
    };
    const returnStage = (stageKey: CollaborationStageKey, content: string) => {
        const feedback = content.trim();
        if (feedbackRequired && !feedback) {
            messageApi.warning("当前项目要求打回时填写反馈");
            return;
        }
        const approval = findPendingApproval(stageKey);
        if (!approval) {
            messageApi.warning("没有可处理的待审批记录");
            return;
        }
        setCollaborationActionBusy(true);
        void collaborationApi(`/approvals/${encodeURIComponent(approval.id)}`, { method: "POST", body: JSON.stringify({ decision: "reject", comment: feedback || "请核对当前交付物后重新提交。" }) })
            .then(() => loadCollaboration())
            .then(() => messageApi.info(notifyOnReturn ? "已打回并记录反馈" : "已打回"))
            .catch((error) => messageApi.error(error instanceof Error ? error.message : "审批处理失败"))
            .finally(() => setCollaborationActionBusy(false));
    };
    const createCollaborationInvite = async () => {
        const data = (await collaborationApi("/invite", { method: "POST", body: JSON.stringify({}) })) as { invite?: { inviteUrl?: string } } | undefined;
        const inviteUrl = data?.invite?.inviteUrl;
        if (!inviteUrl) throw new Error("邀请链接生成失败");
        setLastInviteUrl(inviteUrl);
        await loadCollaboration();
        messageApi.success("邀请链接已生成");
        return inviteUrl;
    };
    const revokeCollaborationInvite = async (inviteId: string) => {
        await collaborationApi("/invite", { method: "DELETE", body: JSON.stringify({ inviteId }) });
        await loadCollaboration();
        messageApi.success("邀请链接已撤销");
    };
    const changeCollaborationMemberRole = async (userId: string, role: "admin" | "member") => {
        await collaborationApi(`/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ role }) });
        await loadCollaboration();
        messageApi.success("成员权限已更新");
    };
    const removeCollaborationMember = async (userId: string) => {
        await collaborationApi(`/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
        await loadCollaboration();
        messageApi.success("成员已移除");
    };
    const transferCollaborationOwnership = async (userId: string) => {
        await collaborationApi(`/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ transferOwnership: true }) });
        await loadCollaboration();
        messageApi.success("项目管理权已转交");
    };
    const leaveCollaborationProject = async () => {
        await collaborationApi("/members", { method: "DELETE" });
        messageApi.success("已退出项目");
        window.location.assign("/drama-lab");
    };
    const reviewCollaborationJoinRequest = async (requestId: string, decision: "approve" | "reject") => {
        await collaborationApi(`/requests/${encodeURIComponent(requestId)}`, { method: "POST", body: JSON.stringify({ decision }) });
        await loadCollaboration();
    };
    const locateCollaborationApproval = (approval: DramaLabCollaborationApprovalRecord) => {
        const uiStage = DRAMA_LAB_API_TO_UI_STAGE[approval.stage];
        if (!uiStage) return;
        const targetStep = COLLABORATION_STAGES.find((stage) => stage.key === uiStage)?.step;
        if (approval.episodeId) setActiveEpisodeId(approval.episodeId);
        if (approval.resourceType === "shot" && approval.episodeId) {
            locateStoryboardShot(approval.episodeId, approval.resourceId);
            return;
        }
        // Asset approvals do not carry a shot target. Open the asset stage so
        // the reviewer lands in the relevant workbench instead of the project
        // home page; episode-scoped records still select their episode above.
        if (["asset", "assets", "character", "characters", "scene", "scenes", "prop", "props"].includes(approval.resourceType.toLowerCase())) {
            setActiveStep("assets");
            return;
        }
        if (targetStep) setActiveStep(targetStep);
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

    const confirmDeleteEpisode = (episode: Episode) => {
        if (!project) return;
        const currentProject = project;
        if (currentProject.episodes.length <= 1) return messageApi.warning("至少保留一集");
        Modal.confirm({
            title: "删除剧集",
            content: `确定删除「${episode.title}」及其全部分镜吗？`,
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                const episodes = currentProject.episodes.filter((item) => item.id !== episode.id).map((item, index) => ({ ...item, number: index + 1 }));
                const shots = currentProject.shots.filter((shot) => shot.episodeId !== episode.id);
                const saved = await saveProject({ episodes, shots });
                if (!saved) return;
                if (activeEpisodeId === episode.id) setActiveEpisodeId(episodes[Math.max(0, currentProject.episodes.findIndex((item) => item.id === episode.id) - 1)]?.id || episodes[0]?.id || "");
            },
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
                    projectId={projectId}
                    project={project}
                    activeEpisode={activeEpisode}
                    onClose={() => setWorkflowModalOpen(false)}
                    onStepChange={setActiveStep}
                    getStrictApprovalBlock={(mode) => stageApprovalBlock(mode === "assets" ? "asset_prompts" : mode === "storyboard" ? "visual_images" : "storyboard_video")}
                />
            ) : null}
            <Drawer title="团队协作与审批" placement="right" size="min(380px, calc(100vw - 12px))" open={collaborationDrawerOpen} destroyOnHidden onClose={() => setCollaborationDrawerOpen(false)}>
                <CollaborationPanel
                    projectId={projectId}
                    activeStage={activeCollaborationStage}
                    collaborationEnabled={collaborationEnabled}
                    collaborationMode={collaborationMode}
                    approvalStages={approvalStages}
                    approvalStatuses={approvalStatuses}
                    feedbackRequired={feedbackRequired}
                    notifyOnReturn={notifyOnReturn}
                    allowFeedbackAttachments={allowFeedbackAttachments}
                    feedback={collaborationFeedback}
                    onCollaborationEnabledChange={setCollaborationEnabledPersisted}
                    onCollaborationModeChange={setCollaborationModePersisted}
                    onApprovalStageEnabledChange={setApprovalStageEnabled}
                    onFeedbackRequiredChange={setFeedbackRequired}
                    onNotifyOnReturnChange={setNotifyOnReturn}
                    onAllowFeedbackAttachmentsChange={setAllowFeedbackAttachments}
                    onSubmit={submitForApproval}
                    onApprove={approveStage}
                    onReturn={returnStage}
                    overview={collaborationOverview}
                    approvals={collaborationApprovals}
                    approvalTotal={collaborationApprovalTotal}
                    approvalLoadingMore={collaborationApprovalLoadingMore}
                    onLoadMoreApprovals={loadMoreCollaborationApprovals}
                    loading={collaborationLoading || collaborationActionBusy}
                    error={collaborationError}
                    onRefresh={() => void loadCollaboration()}
                    onReviewJoinRequest={async (requestId, decision) => {
                        await reviewCollaborationJoinRequest(requestId, decision);
                    }}
                    onCreateInvite={createCollaborationInvite}
                    onRevokeInvite={revokeCollaborationInvite}
                    onChangeMemberRole={changeCollaborationMemberRole}
                    onRemoveMember={removeCollaborationMember}
                    onTransferOwnership={transferCollaborationOwnership}
                    onLeaveProject={leaveCollaborationProject}
                    onLocateApproval={locateCollaborationApproval}
                    lastInviteUrl={lastInviteUrl}
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
                {activeEpisode ? (
                    <Button href={dramaLabEpisodeCanvasHref(projectId, activeEpisode.id)} icon={<PanelsTopLeft className="size-4" />} aria-label="打开本集画布" title="打开本集画布">
                        <span className="hidden xl:inline">打开本集画布</span>
                    </Button>
                ) : null}
                <Button icon={<Sparkles className="size-4" />} onClick={() => setWorkflowModalOpen(true)}>
                    一键全流程
                </Button>
                <Button className="lg:!hidden" type="text" aria-label="打开团队协作与审批" title="打开团队协作与审批" icon={<PanelRightOpen className="size-4" />} onClick={() => setCollaborationDrawerOpen(true)} />
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
                    <div className={cn("min-h-0 overflow-y-auto p-2", sidebarCollapsed ? "flex-1 px-1" : "flex-1 basis-0")}>
                        {project.episodes.map((ep) => {
                            const isActive = ep.id === activeEpisodeId;
                            const episodeShots = project.shots.filter((shot) => shot.episodeId === ep.id);
                            const isExpanded = expandedEpisodeIds.has(ep.id);

                            return (
                                <div key={ep.id} className="mb-1">
                                    <div className={cn("group flex min-w-0 items-center rounded text-sm transition-colors", isActive ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
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
                                        {!sidebarCollapsed ? (
                                            <button
                                                type="button"
                                                aria-label={`删除剧集 ${ep.title}`}
                                                title="删除剧集"
                                                className="mr-1 grid size-7 shrink-0 place-items-center rounded text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100 focus:opacity-100"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    confirmDeleteEpisode(ep);
                                                }}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        ) : null}
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
                                                        onClick={() => locateStoryboardShot(ep.id, shot.id)}
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
                    <DramaLabTaskPanel
                        projectId={projectId}
                        compact={sidebarCollapsed}
                        className={!sidebarCollapsed ? "min-h-0 flex-1 basis-0 overflow-hidden" : undefined}
                        episodes={project.episodes.map((episode) => ({ id: episode.id, title: episode.title, number: episode.number }))}
                    />
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
                    {activeStep === "script" && <ScriptEditor project={project} episode={activeEpisode} onSave={saveProject} onReload={loadProject} onActiveEpisodeChange={setActiveEpisodeId} onStepChange={setActiveStep} messageApi={messageApi} />}
                    {activeStep === "review" && <ReviewPanel project={project} episode={activeEpisode} onStepChange={setActiveStep} messageApi={messageApi} />}
                    {activeStep === "assets" && (
                        <DramaLabVisualAssetsPanel
                            project={project}
                            episode={activeEpisode}
                            onSave={saveProject}
                            onReload={loadProject}
                            onLocateShot={locateStoryboardShot}
                            onOpenCanvasHref={(assetType, assetId) => dramaLabEpisodeCanvasHref(project.id, activeEpisode?.id || project.episodes[0]?.id || "", undefined, assetType, assetId)}
                            messageApi={messageApi}
                        />
                    )}
                    {activeStep === "storyboard" && (
                        <StoryboardPanel project={project} episode={activeEpisode} onSave={saveProject} onReload={loadProject} onCheckpoint={applyStoryboardCheckpoint} onShotSynced={updateProjectShotFromSync} messageApi={messageApi} />
                    )}
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
                                projectId={projectId}
                                activeStage={activeCollaborationStage}
                                collaborationEnabled={collaborationEnabled}
                                collaborationMode={collaborationMode}
                                approvalStages={approvalStages}
                                approvalStatuses={approvalStatuses}
                                feedbackRequired={feedbackRequired}
                                notifyOnReturn={notifyOnReturn}
                                allowFeedbackAttachments={allowFeedbackAttachments}
                                feedback={collaborationFeedback}
                                onCollaborationEnabledChange={setCollaborationEnabledPersisted}
                                onCollaborationModeChange={setCollaborationModePersisted}
                                onApprovalStageEnabledChange={setApprovalStageEnabled}
                                onFeedbackRequiredChange={setFeedbackRequired}
                                onNotifyOnReturnChange={setNotifyOnReturn}
                                onAllowFeedbackAttachmentsChange={setAllowFeedbackAttachments}
                                onSubmit={submitForApproval}
                                onApprove={approveStage}
                                onReturn={returnStage}
                                overview={collaborationOverview}
                                approvals={collaborationApprovals}
                                approvalTotal={collaborationApprovalTotal}
                                approvalLoadingMore={collaborationApprovalLoadingMore}
                                onLoadMoreApprovals={loadMoreCollaborationApprovals}
                                loading={collaborationLoading || collaborationActionBusy}
                                error={collaborationError}
                                onRefresh={() => void loadCollaboration()}
                                onReviewJoinRequest={async (requestId, decision) => {
                                    await reviewCollaborationJoinRequest(requestId, decision);
                                }}
                                onCreateInvite={createCollaborationInvite}
                                onRevokeInvite={revokeCollaborationInvite}
                                onChangeMemberRole={changeCollaborationMemberRole}
                                onRemoveMember={removeCollaborationMember}
                                onTransferOwnership={transferCollaborationOwnership}
                                onLeaveProject={leaveCollaborationProject}
                                onLocateApproval={locateCollaborationApproval}
                                lastInviteUrl={lastInviteUrl}
                            />
                        </div>
                    ) : null}
                </aside>
            </div>
        </main>
    );
}

// ========== 子组件 ==========

function createDramaLabClientRequestId() {
    const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    return `drama-lab-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// 1. 剧本编辑器
function ScriptEditor({
    project,
    episode,
    onSave,
    onReload,
    onActiveEpisodeChange,
    onStepChange,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: Partial<Project>, options?: SaveOptions) => Promise<boolean>;
    onReload: () => Promise<void>;
    onActiveEpisodeChange: (episodeId: string) => void;
    messageApi: ReturnType<typeof message.useMessage>[0];
    onStepChange: (step: StepKey) => void;
}) {
    const [form] = Form.useForm();
    const [scriptForm] = Form.useForm();
    const [activeTab, setActiveTab] = useState<"create" | "select">("create");
    const [generating, setGenerating] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [storyStyle, setStoryStyle] = useState("");
    const [scriptType, setScriptType] = useState("");
    const [customStoryOptions, setCustomStoryOptions] = useState<{ styles: string[]; types: string[] }>({ styles: [], types: [] });
    const [customOptionKind, setCustomOptionKind] = useState<DramaLabStoryOptionKind | null>(null);
    const [customOptionDraft, setCustomOptionDraft] = useState("");
    const [customOptionBusy, setCustomOptionBusy] = useState(false);
    const [episodeCount, setEpisodeCount] = useState(project.scriptEpisodeCount || 1);
    const [scriptLibraryOpen, setScriptLibraryOpen] = useState(false);
    const [scriptLibraryLoading, setScriptLibraryLoading] = useState(false);
    const [scriptLibraryImporting, setScriptLibraryImporting] = useState(false);
    const [scriptLibraryProjects, setScriptLibraryProjects] = useState<ScriptLibraryProject[]>([]);
    const [previewEpisodeId, setPreviewEpisodeId] = useState<string>();

    type StoryTaskState = { status?: string; error?: string; episodeCount?: number; persistedEpisodeCount?: number; taskId?: string };
    useEffect(() => {
        form.setFieldsValue({
            storyOutline: project.description || "",
        });
        scriptForm.setFieldsValue({ script: episode?.script || "" });
        setStoryStyle(project.storyStyle || "");
        setScriptType(project.scriptType || "");
        setEpisodeCount(project.scriptEpisodeCount || 1);
        setPreviewEpisodeId((current) => (current && project.episodes.some((item) => item.id === current) ? current : project.episodes[0]?.id));
    }, [form, scriptForm, project, episode]);

    useEffect(() => {
        let disposed = false;
        void fetch("/api/drama-lab/story-options", { cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "自定义选项加载失败");
                if (!disposed) setCustomStoryOptions(payload.data || { styles: [], types: [] });
            })
            .catch(() => undefined);
        return () => {
            disposed = true;
        };
    }, []);

    const openCustomOption = (kind: DramaLabStoryOptionKind) => {
        setCustomOptionKind(kind);
        setCustomOptionDraft("");
    };

    const deleteCustomOption = async (kind: DramaLabStoryOptionKind, value: string) => {
        const confirmed = typeof window === "undefined" ? true : window.confirm(`确定删除自定义${kind === "style" ? "剧本风格" : "剧本类型"}“${value}”吗？`);
        if (!confirmed) return;
        setCustomOptionBusy(true);
        try {
            const response = await fetch("/api/drama-lab/story-options", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value }) });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "删除自定义选项失败");
            setCustomStoryOptions((current) => ({ ...current, [kind === "style" ? "styles" : "types"]: current[kind === "style" ? "styles" : "types"].filter((item) => item !== value) }));
            if (kind === "style" && storyStyle === value) {
                setStoryStyle("");
                scheduleSave({ storyStyle: "" });
            }
            if (kind === "type" && scriptType === value) {
                setScriptType("");
                scheduleSave({ scriptType: "" });
            }
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "删除自定义选项失败");
        } finally {
            setCustomOptionBusy(false);
        }
    };

    const saveCustomOption = async () => {
        if (!customOptionKind || !customOptionDraft.trim()) return;
        setCustomOptionBusy(true);
        try {
            const response = await fetch("/api/drama-lab/story-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: customOptionKind, value: customOptionDraft.trim() }) });
            const payload = await response.json();
            if (!response.ok || payload.code !== 0 || !payload.data?.value) throw new Error(payload.msg || "自定义选项保存失败");
            const value = String(payload.data.value);
            setCustomStoryOptions((current) => ({ ...current, [customOptionKind === "style" ? "styles" : "types"]: Array.from(new Set([...current[customOptionKind === "style" ? "styles" : "types"], value])) }));
            if (customOptionKind === "style") {
                setStoryStyle(value);
                scheduleSave({ storyStyle: value });
            } else {
                setScriptType(value);
                scheduleSave({ scriptType: value });
            }
            setCustomOptionKind(null);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "自定义选项保存失败");
        } finally {
            setCustomOptionBusy(false);
        }
    };

    type StoryOptionPatch = Partial<Pick<Project, "storyStyle" | "scriptType" | "scriptEpisodeCount">>;

    const saveNow = useCallback(
        (options: SaveOptions = {}, optionPatch: StoryOptionPatch = {}) => {
            const values = form.getFieldsValue();
            const script = scriptForm.getFieldValue("script") || "";
            if (episode) {
                const updatedEpisodes = project.episodes.map((ep) => (ep.id === episode.id ? { ...ep, script } : ep));
                return onSave(
                    {
                        description: values.storyOutline || "",
                        episodes: updatedEpisodes,
                        storyStyle: optionPatch.storyStyle ?? storyStyle,
                        scriptType: optionPatch.scriptType ?? scriptType,
                        scriptEpisodeCount: optionPatch.scriptEpisodeCount ?? episodeCount,
                    },
                    options,
                );
            }
            return Promise.resolve(false);
        },
        [episode, episodeCount, form, onSave, project, scriptForm, scriptType, storyStyle],
    );

    const addScriptEpisode = async () => {
        const newEpisode: Episode = { id: `ep_${Date.now()}`, title: `第 ${project.episodes.length + 1} 集`, number: project.episodes.length + 1, script: "" };
        const saved = await onSave({ episodes: [...project.episodes, newEpisode] });
        if (saved) onActiveEpisodeChange(newEpisode.id);
    };

    const switchScriptEpisode = async (episodeId: string) => {
        if (episodeId === episode?.id) return;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        const saved = await saveNow({ silent: true });
        if (saved) onActiveEpisodeChange(episodeId);
    };

    const scheduleSave = useCallback(
        (optionPatch: StoryOptionPatch = {}) => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            setSaveStatus("pending");
            saveTimerRef.current = setTimeout(() => {
                saveTimerRef.current = null;
                setSaveStatus("saving");
                void saveNow({ silent: true }, optionPatch).then((saved) => {
                    setSaveStatus(saved ? "saved" : "error");
                    if (saved) {
                        messageApi.success({ content: "保存成功", key: "drama-autosave", duration: 1.5 });
                    } else {
                        messageApi.error({ content: "自动保存失败", key: "drama-autosave", duration: 2 });
                    }
                });
            }, 800);
        },
        [messageApi, saveNow],
    );

    useEffect(
        () => () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        },
        [],
    );

    const waitForStoryTask = useCallback(
        async (taskId: string, isCancelled: () => boolean = () => false) => {
            const deadline = Date.now() + 30 * 60 * 1000;
            let taskState: StoryTaskState | null = null;
            while (Date.now() < deadline) {
                if (isCancelled()) return null;
                await new Promise((resolve) => window.setTimeout(resolve, 1500));
                if (isCancelled()) return null;
                const poll = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/generate-script?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
                await assertJsonApiResponse(poll);
                const payload = await poll.json();
                if (!poll.ok || payload.code !== 0) throw new Error(payload.msg || "剧本任务查询失败");
                taskState = payload.data || {};
                if (taskState?.status === "success") break;
                if (taskState?.status === "error" || taskState?.status === "cancelled") throw new Error(taskState.error || "剧本生成失败");
            }
            if (!taskState || taskState.status !== "success") throw new Error("剧本生成超时，请刷新页面继续查询");
            if (isCancelled()) return null;
            await onReload();
            return taskState;
        },
        [onReload, project.id],
    );

    // Reattach to a durable story task after a page refresh. The server owns
    // task state, so the UI must not rely on an in-memory taskId from the
    // previous page instance.
    useEffect(() => {
        let disposed = false;
        const recover = async () => {
            try {
                const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/generate-script`, { cache: "no-store" });
                await assertJsonApiResponse(response);
                const payload = await response.json();
                if (!response.ok || payload.code !== 0 || !payload.data?.taskId) return;
                if (payload.data.status === "success") {
                    await onReload();
                    return;
                }
                setGenerating(true);
                messageApi.loading({ content: "正在恢复剧本生成任务...", key: "generate-script", duration: 0 });
                const taskState = await waitForStoryTask(String(payload.data.taskId), () => disposed);
                if (!disposed && taskState) messageApi.success({ content: `剧本生成成功，共 ${taskState.episodeCount || taskState.persistedEpisodeCount || 1} 集`, key: "generate-script", duration: 3 });
            } catch (error) {
                if (!disposed) messageApi.error({ content: error instanceof Error ? error.message : "剧本任务恢复失败", key: "generate-script", duration: 3 });
            } finally {
                if (!disposed) setGenerating(false);
            }
        };
        void recover();
        return () => {
            disposed = true;
        };
    }, [messageApi, project.id, waitForStoryTask]);

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
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            setSaveStatus("saving");
            if (!(await saveNow({ silent: true }))) throw new Error("生成参数保存失败");
            setSaveStatus("saved");
            messageApi.loading({ content: "AI 正在生成剧本...", key: "generate-script", duration: 0 });

            if (!episode) throw new Error("请先选择当前剧集");
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/generate-script`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeId: episode.id,
                    storyOutline,
                    ...(storyStyle ? { storyStyle } : {}),
                    ...(scriptType ? { scriptType } : {}),
                    episodeCount,
                    requestId: `drama-script:${project.id}:${episode.id}:${Date.now()}`,
                }),
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.taskId) throw new Error(data.msg || "生成失败");
            const taskId = String(data.data.taskId);
            announceDramaLabTaskCreated(project.id);
            const taskState = await waitForStoryTask(taskId);
            if (!taskState) return;
            messageApi.success({ content: `剧本生成成功，共 ${taskState.episodeCount || taskState.persistedEpisodeCount || 1} 集`, key: "generate-script", duration: 3 });
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
            await assertJsonApiResponse(response);
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
                    await assertJsonApiResponse(response);
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
                                            <DramaLabNovelImport
                                                projectId={project.id}
                                                currentEpisodeCount={project.episodes.length}
                                                messageApi={messageApi}
                                                triggerContainerId="drama-lab-novel-import-actions"
                                                onImported={async (episodeId) => {
                                                    await onReload();
                                                    if (episodeId) onActiveEpisodeChange(episodeId);
                                                }}
                                            >
                                                <div className="mb-3 flex items-center gap-3">
                                                    <Select
                                                        aria-label="选择当前剧集"
                                                        value={episode.id}
                                                        onChange={(value) => void switchScriptEpisode(value)}
                                                        style={{ minWidth: 220, flex: 1 }}
                                                        options={project.episodes.map((item) => ({ value: item.id, label: item.title || `第 ${item.number} 集` }))}
                                                    />
                                                    <Button aria-label="添加一集" icon={<Plus className="size-4" />} onClick={() => void addScriptEpisode()}>
                                                        添加一集
                                                    </Button>
                                                </div>
                                                <Form.Item name="script">
                                                    <TextArea
                                                        rows={15}
                                                        placeholder="将描代文学家柳宗元创作的传记文学作品《童区寄传》进行改编。一个发生在唐朝年间的悬疑故事。主人公就是十一岁，名字就叫区寄。可以模仿白夜追凶、催眠大师的套路的心里悬疑片，严格按照 10 节拍表重新整理成一个详细的故事大纲。

暴雨后的山路上，十一岁的区寄独自赶着一头水牛回家。他突然发现林中有两个区寄独自赶往一夜回到。区寄害怕极了，那两人的买卖跟区寄追问：少女饼伤到二十七下后，他终于转变逃走。少女穷极挣扎，让这大师对爹，他们意识，都村民都沾血过往边的刀剑。..."
                                                        className="font-mono text-sm"
                                                    />
                                                </Form.Item>
                                            </DramaLabNovelImport>
                                        </Form>

                                        <div className="order-3 flex flex-wrap items-center gap-4">
                                            <Select
                                                aria-label="剧本风格"
                                                placeholder="剧本风格"
                                                value={storyStyle || undefined}
                                                onChange={(value) => {
                                                    if (value === DRAMA_LAB_CUSTOM_OPTION_VALUE) return openCustomOption("style");
                                                    setStoryStyle(value);
                                                    scheduleSave({ storyStyle: value });
                                                }}
                                                style={{ width: 160 }}
                                            >
                                                {DRAMA_LAB_STORY_STYLE_PRESETS.map((option) => (
                                                    <Option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </Option>
                                                ))}
                                                {customStoryOptions.styles.map((value) => (
                                                    <Option key={`custom-style-${value}`} value={value}>
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="truncate">{value}</span>
                                                            <button
                                                                type="button"
                                                                aria-label={`删除自定义选项 ${value}`}
                                                                title="删除自定义选项"
                                                                className="inline-flex size-5 items-center justify-center rounded text-sm leading-none text-destructive hover:bg-destructive/10"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void deleteCustomOption("style", value);
                                                                }}
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    </Option>
                                                ))}
                                                <Option value={DRAMA_LAB_CUSTOM_OPTION_VALUE}>＋ 自定义风格</Option>
                                            </Select>

                                            <Select
                                                aria-label="剧本类型"
                                                placeholder="剧本类型"
                                                value={scriptType || undefined}
                                                onChange={(value) => {
                                                    if (value === DRAMA_LAB_CUSTOM_OPTION_VALUE) return openCustomOption("type");
                                                    setScriptType(value);
                                                    scheduleSave({ scriptType: value });
                                                }}
                                                style={{ width: 160 }}
                                            >
                                                {DRAMA_LAB_SCRIPT_TYPE_PRESETS.map((option) => (
                                                    <Option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </Option>
                                                ))}
                                                {customStoryOptions.types.map((value) => (
                                                    <Option key={`custom-type-${value}`} value={value}>
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="truncate">{value}</span>
                                                            <button
                                                                type="button"
                                                                aria-label={`删除自定义选项 ${value}`}
                                                                title="删除自定义选项"
                                                                className="inline-flex size-5 items-center justify-center rounded text-sm leading-none text-destructive hover:bg-destructive/10"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void deleteCustomOption("type", value);
                                                                }}
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    </Option>
                                                ))}
                                                <Option value={DRAMA_LAB_CUSTOM_OPTION_VALUE}>＋ 自定义类型</Option>
                                            </Select>

                                            <InputNumber
                                                addonBefore="集数"
                                                aria-label="集数"
                                                min={1}
                                                max={100}
                                                precision={0}
                                                value={episodeCount}
                                                onChange={(value) => {
                                                    const next = Math.max(1, Math.min(100, Math.floor(Number(value) || 1)));
                                                    setEpisodeCount(next);
                                                    scheduleSave({ scriptEpisodeCount: next });
                                                }}
                                                style={{ width: 130 }}
                                            />

                                            <Button type="primary" icon={<Plus className="size-4" />} onClick={handleGenerateScript} loading={generating} disabled={generating}>
                                                {generating ? "生成中..." : "生成剧本"}
                                            </Button>
                                            <span id="drama-lab-novel-import-actions" className="inline-flex" />

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
                                        {customOptionKind ? (
                                            <div className="order-3 flex flex-wrap items-center gap-2 rounded border border-border bg-muted/30 p-2" role="dialog" aria-label={customOptionKind === "style" ? "添加自定义剧本风格" : "添加自定义剧本类型"}>
                                                <Input
                                                    autoFocus
                                                    value={customOptionDraft}
                                                    onChange={(event) => setCustomOptionDraft(event.target.value)}
                                                    onPressEnter={() => void saveCustomOption()}
                                                    placeholder={customOptionKind === "style" ? "输入自定义剧本风格" : "输入自定义剧本类型"}
                                                    maxLength={120}
                                                    style={{ width: 240 }}
                                                />
                                                <Button type="primary" size="small" loading={customOptionBusy} onClick={() => void saveCustomOption()}>
                                                    确定
                                                </Button>
                                                <Button size="small" disabled={customOptionBusy} onClick={() => setCustomOptionKind(null)}>
                                                    取消
                                                </Button>
                                            </div>
                                        ) : null}
                                        <div className="order-4 border-t border-border pt-4 text-sm text-muted-foreground">
                                            <span className="font-semibold">剧本</span>
                                            <span className="mx-2">·</span>
                                            <span>{episode.script.length} 字</span>
                                        </div>

                                        <div className="order-6 flex justify-end border-t border-border pt-4">
                                            <Button
                                                type="primary"
                                                aria-label="进入资产准备"
                                                onClick={async () => {
                                                    const saved = await saveNow();
                                                    if (saved) onStepChange("assets");
                                                }}
                                            >
                                                下一步
                                            </Button>
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                key: "select",
                                label: "选择剧本",
                                children: (
                                    <div className="space-y-5">
                                        <p className="text-sm text-muted-foreground">从已有项目中选择剧本后，仅把故事梗概与各集剧本文字写入当前项目，不会导入角色、场景、分镜、图片或视频。</p>
                                        <Button
                                            type="primary"
                                            icon={<FileText className="size-4" />}
                                            loading={scriptLibraryLoading}
                                            onClick={() => {
                                                setScriptLibraryOpen(true);
                                                void loadScriptLibrary();
                                            }}
                                        >
                                            从已有项目中选择剧本
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
                    <Modal title="从已有项目中选择剧本" open={scriptLibraryOpen} onCancel={() => setScriptLibraryOpen(false)} footer={null} destroyOnHidden>
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
                                <div className="py-8 text-center text-muted-foreground">暂无可选择的已有项目</div>
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
    projectId,
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
    overview,
    approvals,
    approvalTotal,
    approvalLoadingMore,
    loading,
    error,
    onRefresh,
    onLoadMoreApprovals,
    onReviewJoinRequest,
    onCreateInvite,
    onRevokeInvite,
    onChangeMemberRole,
    onRemoveMember,
    onTransferOwnership,
    onLeaveProject,
    onLocateApproval,
    lastInviteUrl,
}: {
    projectId: string;
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
    overview: DramaLabCollaborationOverview | null;
    approvals: DramaLabCollaborationApprovalRecord[];
    approvalTotal: number;
    approvalLoadingMore: boolean;
    loading: boolean;
    error?: string;
    onRefresh: () => void;
    onLoadMoreApprovals: () => Promise<void>;
    onReviewJoinRequest: (requestId: string, decision: "approve" | "reject") => Promise<void>;
    onCreateInvite: () => Promise<string>;
    onRevokeInvite: (inviteId: string) => Promise<void>;
    onChangeMemberRole: (userId: string, role: "admin" | "member") => Promise<void>;
    onRemoveMember: (userId: string) => Promise<void>;
    onTransferOwnership: (userId: string) => Promise<void>;
    onLeaveProject: () => Promise<void>;
    onLocateApproval: (approval: DramaLabCollaborationApprovalRecord) => void;
    lastInviteUrl?: string;
}) {
    const [feedbackDraft, setFeedbackDraft] = useState("");
    const [requestBusyId, setRequestBusyId] = useState<string>();
    const [requestError, setRequestError] = useState<string>();
    const [inviteBusy, setInviteBusy] = useState(false);
    const [memberBusyId, setMemberBusyId] = useState<string>();
    const [memberError, setMemberError] = useState<string>();
    const [memberQuery, setMemberQuery] = useState("");
    const [inviteUrl, setInviteUrl] = useState<string | undefined>(lastInviteUrl);

    useEffect(() => {
        if (lastInviteUrl) setInviteUrl(lastInviteUrl);
    }, [lastInviteUrl]);

    const handleReturn = (stage: CollaborationStageKey) => {
        onReturn(stage, feedbackDraft);
        setFeedbackDraft("");
    };

    const memberLabel = (member: DramaLabCollaborationOverview["members"][number]) => member.profile?.displayName || member.profile?.username || member.userId;
    const roleLabel = (role: DramaLabCollaborationOverview["members"][number]["role"]) => (role === "owner" ? "项目管理员" : role === "admin" ? "副管理员" : "成员");
    const approvalLabel = (approval: DramaLabCollaborationApprovalRecord) => {
        const uiStage = DRAMA_LAB_API_TO_UI_STAGE[approval.stage];
        return uiStage ? COLLABORATION_STAGES.find((stage) => stage.key === uiStage)?.label || approval.stage : approval.stage;
    };
    const approvalStatusLabel = (status: DramaLabCollaborationApprovalRecord["status"]) => (status === "pending" ? "审核中" : status === "approved" ? "已通过" : status === "rejected" ? "已驳回" : "已取消");
    const handleJoinRequest = async (requestId: string, decision: "approve" | "reject") => {
        setRequestBusyId(requestId);
        setRequestError(undefined);
        try {
            await onReviewJoinRequest(requestId, decision);
        } catch (requestActionError) {
            setRequestError(requestActionError instanceof Error ? requestActionError.message : "申请处理失败");
        } finally {
            setRequestBusyId(undefined);
        }
    };

    const viewer = overview?.members.find((member) => member.userId === overview.viewerUserId);
    const canManageMembers = Boolean(viewer?.permissions.manageMembers || viewer?.role === "owner" || viewer?.role === "admin");
    const isOwner = viewer?.role === "owner" || overview?.group.ownerUserId === overview?.viewerUserId;
    const canReviewStage = (stageKey: CollaborationStageKey) => {
        if (!viewer) return false;
        const apiStage = DRAMA_LAB_UI_TO_API_STAGE[stageKey];
        const config = overview?.approvalConfigs.find((item) => item.stage === apiStage);
        if (!config) return viewer.role === "owner" || viewer.role === "admin";
        if (config.reviewerUserIds.includes(viewer.userId)) return true;
        return config.reviewerScope === "owner" ? viewer.role === "owner" : viewer.role === "owner" || viewer.role === "admin";
    };
    const filteredMembers = (overview?.members || []).filter((member) => {
        const needle = memberQuery.trim().toLowerCase();
        if (!needle) return true;
        return [member.userId, member.profile?.displayName, member.profile?.username].some((value) => value?.toLowerCase().includes(needle));
    });
    const displayedInviteUrl = inviteUrl || lastInviteUrl;
    const activeInvite = overview?.invites.find((invite) => !invite.revokedAt && Date.parse(invite.expiresAt) > Date.now());
    const handleCreateInvite = async () => {
        setInviteBusy(true);
        setMemberError(undefined);
        try {
            const value = await onCreateInvite();
            setInviteUrl(value);
        } catch (inviteError) {
            setMemberError(inviteError instanceof Error ? inviteError.message : "邀请链接生成失败");
        } finally {
            setInviteBusy(false);
        }
    };
    const handleMemberAction = async (userId: string, action: () => Promise<void>) => {
        setMemberBusyId(userId);
        setMemberError(undefined);
        try {
            await action();
        } catch (actionError) {
            setMemberError(actionError instanceof Error ? actionError.message : "成员操作失败");
        } finally {
            setMemberBusyId(undefined);
        }
    };
    const copyInvite = async () => {
        const value = displayedInviteUrl;
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            message.success("邀请链接已复制");
        } catch {
            message.info(value);
        }
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
                            <h2 className="truncate text-sm font-semibold">{overview ? `项目组 · ${overview.group.id.slice(-8)}` : "短剧项目组"}</h2>
                            <div className="flex items-center gap-2">
                                <Button type="text" size="small" loading={loading} icon={<RefreshCw className="size-3.5" />} onClick={onRefresh} aria-label="刷新协作数据" title="刷新协作数据" />
                                <Switch size="small" checked={collaborationEnabled} onChange={onCollaborationEnabledChange} disabled={loading} aria-label="启用团队协作" />
                            </div>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">项目组长和副管理员可配置审批节点，成员权限由服务端校验。</p>
                        {activeStage ? <p className="mt-1 text-xs text-primary">当前制作阶段：{activeStage.label}</p> : null}
                        {overview ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                                当前成员 {overview.members.length} 人 · 待处理申请 {overview.joinRequests.filter((item) => item.status === "pending").length} 条
                            </p>
                        ) : null}
                    </div>
                </div>
                {error ? (
                    <Alert
                        className="mt-3"
                        type="error"
                        showIcon
                        title="协作数据加载失败"
                        description={error}
                        action={
                            <Button size="small" onClick={onRefresh}>
                                重试
                            </Button>
                        }
                    />
                ) : null}
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

            {overview ? (
                <section className="border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold">项目邀请</h3>
                            <p className="mt-1 text-xs text-muted-foreground">通过链接或二维码申请加入，管理员确认后生效。</p>
                        </div>
                        {canManageMembers ? (
                            <Button size="small" icon={<Link2 className="size-3.5" />} loading={inviteBusy} onClick={() => void handleCreateInvite()}>
                                {activeInvite ? "生成新链接" : "生成邀请链接"}
                            </Button>
                        ) : null}
                    </div>
                    {displayedInviteUrl ? (
                        <div className="flex items-start gap-3 border border-primary/20 bg-primary/5 p-2">
                            <QRCode value={displayedInviteUrl} size={92} bordered={false} />
                            <div className="min-w-0 flex-1">
                                <p className="break-all text-xs leading-5">{displayedInviteUrl}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void copyInvite()}>
                                        复制链接
                                    </Button>
                                    {canManageMembers && activeInvite ? (
                                        <Button
                                            size="small"
                                            danger
                                            icon={<Trash2 className="size-3.5" />}
                                            onClick={() =>
                                                Modal.confirm({
                                                    title: "撤销邀请链接？",
                                                    content: "撤销后，已经分享的链接将不能再提交加入申请。",
                                                    okText: "确认撤销",
                                                    cancelText: "取消",
                                                    onOk: async () => {
                                                        setInviteBusy(true);
                                                        try {
                                                            await onRevokeInvite(activeInvite.id);
                                                            setInviteUrl(undefined);
                                                        } catch (revokeError) {
                                                            setMemberError(revokeError instanceof Error ? revokeError.message : "邀请链接撤销失败");
                                                        } finally {
                                                            setInviteBusy(false);
                                                        }
                                                    },
                                                })
                                            }
                                        >
                                            撤销
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : activeInvite ? (
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>已有有效邀请（{new Date(activeInvite.expiresAt).toLocaleDateString("zh-CN")} 到期）</span>
                            {canManageMembers ? (
                                <Button type="link" size="small" onClick={() => void handleCreateInvite()}>
                                    重新生成并复制
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">暂无有效邀请链接。</p>
                    )}
                </section>
            ) : null}

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
                                            <Switch size="small" checked={enabled} onChange={(checked) => onApprovalStageEnabledChange(stage.key, checked)} disabled={loading} aria-label={`启用${stage.label}`} />
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
                                                    <Button size="small" loading={loading} icon={<Send className="size-3.5" />} onClick={() => onSubmit(stage.key)}>
                                                        {status === "requires_confirmation" ? "确认并提交" : "提交"}
                                                    </Button>
                                                ) : null}
                                                {status === "submitted" && canReviewStage(stage.key) ? (
                                                    <Button size="small" type="primary" loading={loading} icon={<ShieldCheck className="size-3.5" />} onClick={() => onApprove(stage.key)}>
                                                        通过
                                                    </Button>
                                                ) : null}
                                                {status === "submitted" && canReviewStage(stage.key) ? (
                                                    <Button size="small" loading={loading} icon={<GitPullRequest className="size-3.5" />} onClick={() => handleReturn(stage.key)}>
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
                        <TextArea className="mt-2" value={feedbackDraft} onChange={(event) => setFeedbackDraft(event.target.value)} rows={2} placeholder="驳回时填写审核意见" />
                    </section>

                    <section>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">项目成员</h3>
                            <span className="text-xs text-muted-foreground">仅显示本项目成员</span>
                        </div>
                        {overview?.members.length ? <Input.Search className="mb-2" size="small" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} allowClear placeholder="搜索项目内成员" /> : null}
                        <div className="space-y-2 border border-border p-3 text-xs">
                            {filteredMembers.length ? (
                                filteredMembers.map((member) => {
                                    const isViewer = member.userId === overview?.viewerUserId;
                                    // Managers may remove members; only the owner
                                    // may change roles or transfer ownership.
                                    const canEdit = canManageMembers && member.role !== "owner" && !isViewer;
                                    return (
                                        <div key={member.userId} className="flex items-center gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium" title={member.userId}>
                                                    {memberLabel(member)}
                                                    {isViewer ? "（我）" : ""}
                                                </p>
                                                <p className="text-muted-foreground">{roleLabel(member.role)}</p>
                                            </div>
                                            {isOwner && canEdit ? (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    loading={memberBusyId === member.userId}
                                                    icon={<UserCog className="size-3.5" />}
                                                    aria-label={member.role === "admin" ? "取消副管理员" : "设为副管理员"}
                                                    title={member.role === "admin" ? "取消副管理员" : "设为副管理员"}
                                                    onClick={() => void handleMemberAction(member.userId, () => onChangeMemberRole(member.userId, member.role === "admin" ? "member" : "admin"))}
                                                />
                                            ) : null}
                                            {isOwner && canEdit ? (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    loading={memberBusyId === member.userId}
                                                    icon={<ShieldCheck className="size-3.5" />}
                                                    aria-label="转交项目管理权"
                                                    title="转交项目管理权"
                                                    onClick={() =>
                                                        Modal.confirm({
                                                            title: "转交项目管理权？",
                                                            content: "转交后你将保留副管理员权限，新的管理员负责审批和成员管理。",
                                                            okText: "确认转交",
                                                            cancelText: "取消",
                                                            onOk: () => handleMemberAction(member.userId, () => onTransferOwnership(member.userId)),
                                                        })
                                                    }
                                                />
                                            ) : null}
                                            {canEdit ? (
                                                <Button
                                                    type="text"
                                                    danger
                                                    size="small"
                                                    loading={memberBusyId === member.userId}
                                                    icon={<UserMinus className="size-3.5" />}
                                                    aria-label="移除成员"
                                                    title="移除成员"
                                                    onClick={() =>
                                                        Modal.confirm({
                                                            title: "移除项目成员？",
                                                            content: "移除后，该成员将无法继续访问此短剧项目。",
                                                            okText: "确认移除",
                                                            cancelText: "取消",
                                                            onOk: () => handleMemberAction(member.userId, () => onRemoveMember(member.userId)),
                                                        })
                                                    }
                                                />
                                            ) : null}
                                        </div>
                                    );
                                })
                            ) : (
                                <span className="text-muted-foreground">没有匹配的项目成员</span>
                            )}
                        </div>
                        {viewer && viewer.role !== "owner" ? (
                            <Button className="mt-2" size="small" danger icon={<LogOut className="size-3.5" />} onClick={() => void handleMemberAction(viewer.userId, onLeaveProject)} loading={memberBusyId === viewer.userId}>
                                退出项目
                            </Button>
                        ) : null}
                        {memberError ? <Alert className="mt-2" type="error" showIcon message={memberError} /> : null}
                    </section>

                    {overview?.joinRequests.filter((item) => item.status === "pending").length ? (
                        <section>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold">待处理加入申请</h3>
                                <span className="text-xs text-muted-foreground">管理员确认后生效</span>
                            </div>
                            <div className="space-y-2 border border-border p-3 text-xs">
                                {overview.joinRequests
                                    .filter((item) => item.status === "pending")
                                    .map((request) => (
                                        <div key={request.id} className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate" title={request.applicantUserId}>
                                                {request.applicant?.displayName || request.applicant?.username || request.applicantUserId}
                                            </span>
                                            <Button size="small" type="primary" loading={requestBusyId === request.id} onClick={() => void handleJoinRequest(request.id, "approve")}>
                                                通过
                                            </Button>
                                            <Button size="small" loading={requestBusyId === request.id} onClick={() => void handleJoinRequest(request.id, "reject")}>
                                                拒绝
                                            </Button>
                                        </div>
                                    ))}
                            </div>
                        </section>
                    ) : null}
                    {requestError ? <Alert type="error" showIcon title={requestError} /> : null}

                    {approvals.length || feedback.length ? (
                        <section>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold">审批历史</h3>
                                <span className="text-xs text-muted-foreground">服务端记录</span>
                            </div>
                            <div className="space-y-2 border border-border p-3">
                                {approvals.map((approval) => (
                                    <button key={approval.id} type="button" className="block w-full border-l-2 border-border pl-2 text-left text-xs hover:border-primary" onClick={() => onLocateApproval(approval)} title="定位到审批内容">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium">{approvalLabel(approval)}</p>
                                            <span className="text-muted-foreground">{approvalStatusLabel(approval.status)}</span>
                                        </div>
                                        <p className="mt-1 text-muted-foreground">
                                            资源：{approval.resourceType}/{approval.resourceId}
                                        </p>
                                        {approval.reviewComment ? <p className="mt-1 leading-4 text-rose-700">意见：{approval.reviewComment}</p> : null}
                                        <p className="mt-1 text-[11px] text-muted-foreground">{new Date(approval.createdAt).toLocaleString("zh-CN")}</p>
                                    </button>
                                ))}
                                {!approvals.length &&
                                    feedback.slice(0, 3).map((item) => (
                                        <div key={item.id} className="border-l-2 border-rose-400 pl-2 text-xs">
                                            <p className="font-medium">{COLLABORATION_STAGES.find((stage) => stage.key === item.stage)?.label}</p>
                                            <p className="mt-1 leading-4 text-muted-foreground">{item.content}</p>
                                        </div>
                                    ))}
                            </div>
                            {approvals.length < approvalTotal ? (
                                <Button className="mt-2 w-full" size="small" loading={approvalLoadingMore} onClick={() => void onLoadMoreApprovals()}>
                                    加载更多审批记录（{approvals.length}/{approvalTotal}）
                                </Button>
                            ) : null}
                        </section>
                    ) : null}
                    {!overview && !loading ? <Alert type="warning" showIcon icon={<MessageSquare className="size-4" />} title="项目组尚未加载" description={`项目 ${projectId} 的协作数据暂不可用，请刷新后重试。`} /> : null}
                </>
            ) : (
                <Alert type="info" showIcon title="阶段审批已关闭" description="重新开启后，审批配置会保存到该项目组。" />
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
            description={strictApprovalBlock || (status === "requires_confirmation" ? "上游版本发生变化，请确认当前成果后重新提交。" : "团队审批状态由服务端保存，成员可以查看提交、审批意见和历史记录。")}
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
    projectId,
    project,
    activeEpisode,
    onClose,
    onStepChange,
    getStrictApprovalBlock,
}: {
    projectId: string;
    project: Project;
    activeEpisode?: Episode;
    onClose: () => void;
    onStepChange: (step: StepKey) => void;
    getStrictApprovalBlock: (mode: WorkflowRunMode) => string | undefined;
}) {
    type WorkflowStepView = {
        key: string;
        status: "pending" | "running" | "success" | "error" | "skipped" | "cancelled" | string;
        label: string;
        target?: string;
        error?: string;
        childTaskIds?: string[];
    };
    type WorkflowChildView = {
        id: string;
        type: string;
        key: string;
        episodeId?: string;
        shotId?: string;
        status: "pending" | "running" | "success" | "error" | "cancelled" | string;
        output?: Record<string, unknown>;
        error?: string;
    };
    type WorkflowTaskView = {
        id: string;
        status: "pending" | "running" | "success" | "error" | "cancelled";
        progress: number;
        currentStep?: string;
        currentStepIndex: number;
        steps: WorkflowStepView[];
        children: WorkflowChildView[];
        error?: string;
    };
    const [mode, setMode] = useState<WorkflowRunMode>("video");
    const [scope, setScope] = useState<WorkflowRunScope>("current");
    const [ratio, setRatio] = useState(project.aspectRatio || "9:16");
    const [duration, setDuration] = useState("5");
    const [language, setLanguage] = useState("中文");
    const [visualStyle, setVisualStyle] = useState(project.style || "电影感写实");
    const [autoExport, setAutoExport] = useState(false);
    const [workflowTask, setWorkflowTask] = useState<WorkflowTaskView | null>(null);
    const [workflowError, setWorkflowError] = useState<string>();
    const [workflowActionBusy, setWorkflowActionBusy] = useState(false);
    const [workflowLoading, setWorkflowLoading] = useState(true);
    const selectedMode = WORKFLOW_RUN_MODES.find((item) => item.value === mode) || WORKFLOW_RUN_MODES[2];
    const strictApprovalBlock = getStrictApprovalBlock(mode);
    const episodeLabel = scope === "all" ? `全部 ${project.episodes.length} 集` : activeEpisode?.title || "当前集";
    const executionSteps: Array<{ key: string; label: string; detail: string; target: StepKey }> = [
        { key: "script", label: "解析剧本并生成提示词", detail: `${episodeLabel} · ${language}输出`, target: "script" },
        { key: "assets", label: "生成角色、场景与道具资产", detail: `统一视觉风格：${visualStyle || "项目默认风格"}`, target: "assets" },
        ...(mode === "assets" ? [] : [{ key: "storyboard", label: "生成分镜提示词与分镜图", detail: `${ratio} · 单镜头${duration}秒`, target: "storyboard" as StepKey }]),
        ...(mode !== "video"
            ? []
            : [
                  { key: "video", label: "生成镜头视频", detail: "在分镜工作台内按镜头顺序生成", target: "storyboard" as StepKey },
                  { key: "review", label: "内容审核", detail: "汇总素材、分镜图与镜头视频的审核结果", target: "review" as StepKey },
                  ...(autoExport ? [{ key: "export", label: "成片导出", detail: "审核完成后自动创建导出任务", target: "export" as StepKey }] : []),
              ]),
    ];

    const fetchWorkflow = useCallback(
        async (taskId?: string, signal?: AbortSignal) => {
            const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/workflow${query}`, { cache: "no-store", signal });
            const payload = (await response.json().catch(() => ({}))) as { code?: unknown; msg?: unknown; data?: WorkflowTaskView | null };
            if (!response.ok || (payload.code !== undefined && Number(payload.code) !== 0)) throw new Error(String(payload.msg || `工作流请求失败（${response.status}）`));
            return payload.data || null;
        },
        [projectId],
    );

    // Recover an active server task whenever the modal opens. This also makes
    // a browser refresh safe: the task state remains the source of truth.
    useEffect(() => {
        let disposed = false;
        const controller = new AbortController();
        setWorkflowLoading(true);
        setWorkflowError(undefined);
        void fetchWorkflow(undefined, controller.signal)
            .then((task) => {
                if (!disposed) setWorkflowTask(task);
            })
            .catch((error) => {
                if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) setWorkflowError(error instanceof Error ? error.message : "工作流状态读取失败");
            })
            .finally(() => {
                if (!disposed) setWorkflowLoading(false);
            });
        return () => {
            disposed = true;
            controller.abort();
        };
    }, [fetchWorkflow]);

    const startRun = async () => {
        if (workflowActionBusy || strictApprovalBlock) return;
        setWorkflowActionBusy(true);
        setWorkflowError(undefined);
        try {
            const requestId = `workflow:${projectId}:${Date.now()}`;
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/workflow`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-vozeb-pro-client-request-id": requestId },
                body: JSON.stringify({ episodeId: activeEpisode?.id, mode, scope, ratio, duration, language, visualStyle, autoExport, requestId }),
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: unknown; msg?: unknown; data?: WorkflowTaskView | null };
            if (!response.ok || (payload.code !== undefined && Number(payload.code) !== 0) || !payload.data) throw new Error(String(payload.msg || `工作流创建失败（${response.status}）`));
            setWorkflowTask(payload.data);
            announceDramaLabTaskCreated(projectId);
        } catch (error) {
            setWorkflowError(error instanceof Error ? error.message : "工作流创建失败");
        } finally {
            setWorkflowActionBusy(false);
        }
    };

    const changeRun = async (action: "cancel" | "resume") => {
        if (!workflowTask || workflowActionBusy) return;
        setWorkflowActionBusy(true);
        setWorkflowError(undefined);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/workflow`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: workflowTask.id, action }),
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: unknown; msg?: unknown; data?: WorkflowTaskView | null };
            if (!response.ok || (payload.code !== undefined && Number(payload.code) !== 0) || !payload.data) throw new Error(String(payload.msg || "工作流状态更新失败"));
            setWorkflowTask(payload.data);
        } catch (error) {
            setWorkflowError(error instanceof Error ? error.message : "工作流状态更新失败");
        } finally {
            setWorkflowActionBusy(false);
        }
    };

    useEffect(() => {
        const currentStep = workflowTask?.currentStep;
        const target = currentStep === "video" ? "storyboard" : ["script", "assets", "storyboard", "review", "export"].includes(currentStep || "") ? (currentStep as StepKey) : undefined;
        if (target) onStepChange(target);
    }, [onStepChange, workflowTask?.currentStep]);

    useEffect(() => {
        if (!workflowTask || (workflowTask.status !== "pending" && workflowTask.status !== "running")) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const latest = await fetchWorkflow(workflowTask.id);
                if (!disposed && latest) setWorkflowTask(latest);
            } catch (error) {
                if (!disposed) setWorkflowError(error instanceof Error ? error.message : "工作流状态读取失败");
            } finally {
                if (!disposed) timer = setTimeout(poll, 1_200);
            }
        };
        timer = setTimeout(poll, 250);
        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
        };
    }, [fetchWorkflow, workflowTask?.id, workflowTask?.status]);

    const displayedSteps: Array<{ key: string; status: string; label: string; detail: string; target: StepKey; error?: string; childTaskIds?: string[] }> = workflowTask?.steps?.length
        ? workflowTask.steps.map((step) => {
              const fallback = executionSteps.find((item) => item.key === step.key);
              return {
                  key: step.key,
                  status: step.status,
                  label: fallback?.label || step.label || step.key,
                  detail: step.error || fallback?.detail || step.target || "",
                  target: fallback?.target || (step.target as StepKey | undefined) || "assets",
                  error: step.error,
                  childTaskIds: step.childTaskIds,
              };
          })
        : executionSteps.map((step) => ({ ...step, status: "pending", detail: step.detail, error: undefined, childTaskIds: [] }));
    const isActive = workflowTask?.status === "pending" || workflowTask?.status === "running";
    const taskStatusLabel = workflowTask?.status === "success" ? "执行完成" : workflowTask?.status === "error" ? "执行失败" : workflowTask?.status === "cancelled" ? "已取消" : isActive ? "执行中" : "";
    const childStepKey = (childKey: string) => childKey.split(":", 1)[0] || childKey;

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
                        {taskStatusLabel ? (
                            <span
                                className={cn("text-sm font-medium", workflowTask?.status === "success" ? "text-emerald-700" : workflowTask?.status === "error" ? "text-rose-700" : workflowTask?.status === "cancelled" ? "text-amber-700" : "text-primary")}
                            >
                                {taskStatusLabel}
                            </span>
                        ) : workflowLoading ? (
                            <span className="text-sm text-muted-foreground">正在读取任务状态…</span>
                        ) : null}
                    </div>
                    <ol className="divide-y divide-border">
                        {displayedSteps.map((step, index) => {
                            const status = step.status === "success" || step.status === "skipped" ? "已完成" : step.status === "running" ? "执行中" : step.status === "error" ? "失败" : step.status === "cancelled" ? "已取消" : "待执行";
                            const children = workflowTask?.children?.filter((child) => step.childTaskIds?.includes(child.id) || childStepKey(child.key) === step.key) || [];
                            return (
                                <li key={`${step.key}-${index}`} className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={cn(
                                                "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                                                status === "已完成"
                                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                                    : status === "执行中"
                                                      ? "border-primary bg-primary text-primary-foreground"
                                                      : status === "失败"
                                                        ? "border-rose-500 text-rose-700"
                                                        : status === "已取消"
                                                          ? "border-amber-500 text-amber-700"
                                                          : "border-border text-muted-foreground",
                                            )}
                                        >
                                            {status === "已完成" ? <CheckCircle2 className="size-3.5" /> : status === "执行中" ? <LoaderCircle className="size-3.5 animate-spin" /> : status === "失败" ? <AlertCircle className="size-3.5" /> : index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium">{step.label}</p>
                                            <p className={cn("mt-0.5 text-xs text-muted-foreground", step.error ? "text-rose-700" : "truncate")}>{step.detail}</p>
                                        </div>
                                        <span className="shrink-0 text-xs text-muted-foreground">{status}</span>
                                    </div>
                                    {children.length ? (
                                        <div className="ml-9 mt-2 space-y-1 border-l border-border pl-3">
                                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">子任务 · {children.length}</p>
                                            {children.map((child) => {
                                                const childStatus = child.status === "success" ? "已完成" : child.status === "running" ? "执行中" : child.status === "error" ? "失败" : child.status === "cancelled" ? "已取消" : "待执行";
                                                const childDetail = child.error || [child.episodeId && `剧集 ${child.episodeId}`, child.shotId && `镜头 ${child.shotId}`].filter(Boolean).join(" · ") || child.type;
                                                return (
                                                    <div key={child.id} className="flex items-center gap-2 text-xs">
                                                        {child.status === "running" ? (
                                                            <LoaderCircle className="size-3 shrink-0 animate-spin text-primary" />
                                                        ) : child.status === "success" ? (
                                                            <CheckCircle2 className="size-3 shrink-0 text-emerald-600" />
                                                        ) : child.status === "error" ? (
                                                            <AlertCircle className="size-3 shrink-0 text-rose-600" />
                                                        ) : (
                                                            <span className="size-3 shrink-0 rounded-full border border-border" />
                                                        )}
                                                        <span className="min-w-0 flex-1 truncate" title={child.key}>
                                                            {childDetail}
                                                        </span>
                                                        <span className={cn("shrink-0", child.status === "error" ? "text-rose-700" : "text-muted-foreground")}>{childStatus}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ol>
                </div>

                {workflowTask ? (
                    <div className="border border-border bg-muted/30 px-4 py-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span>任务 {workflowTask.id.slice(0, 8)}</span>
                            <span className="font-medium">{Math.max(0, Math.min(100, workflowTask.progress))}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={workflowTask.progress} aria-label="工作流进度">
                            <div
                                className={cn("h-full transition-[width]", workflowTask.status === "error" ? "bg-rose-500" : workflowTask.status === "cancelled" ? "bg-amber-500" : workflowTask.status === "success" ? "bg-emerald-500" : "bg-primary")}
                                style={{ width: `${Math.max(0, Math.min(100, workflowTask.progress))}%` }}
                            />
                        </div>
                    </div>
                ) : null}
                {workflowTask?.error ? <Alert type="error" showIcon title="工作流执行失败" description={workflowTask.error} /> : null}
                {workflowError ? <Alert type="error" showIcon title="工作流请求失败" description={workflowError} /> : null}
                {strictApprovalBlock ? <Alert type="warning" showIcon title="严格审批模式已阻断本次流程" description={strictApprovalBlock} /> : null}

                <div className="flex flex-wrap justify-end gap-3">
                    <Button onClick={onClose}>关闭</Button>
                    {isActive ? (
                        <Button danger loading={workflowActionBusy} disabled={workflowLoading} onClick={() => void changeRun("cancel")}>
                            取消任务
                        </Button>
                    ) : null}
                    {workflowTask?.status === "error" || workflowTask?.status === "cancelled" ? (
                        <Button loading={workflowActionBusy} disabled={workflowLoading} onClick={() => void changeRun("resume")}>
                            恢复任务
                        </Button>
                    ) : null}
                    {!isActive ? (
                        <Button type="primary" icon={<Sparkles className="size-4" />} loading={workflowActionBusy} disabled={Boolean(strictApprovalBlock) || workflowLoading} onClick={() => void startRun()}>
                            {workflowTask?.status === "success" ? "再次执行" : "开始执行"}
                        </Button>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
}

// 5. 内容审核面板
function ReviewPanel({ project, episode, onStepChange, messageApi: providedMessageApi }: { project: Project; episode?: Episode; onStepChange: (step: StepKey) => void; messageApi?: ReturnType<typeof message.useMessage>[0] }) {
    const [fallbackMessageApi] = message.useMessage();
    const messageApi = providedMessageApi || fallbackMessageApi;
    const [review, setReview] = useState<CreativeReview | null>(null);
    const [reviewStatus, setReviewStatus] = useState<"idle" | "running" | "done">("idle");
    const [reviewError, setReviewError] = useState("");
    const episodeShots = project.shots.filter((shot) => shot.episodeId === episode?.id);
    const assetCount = project.characters.length + project.scenes.length + project.props.length;
    const storyboardImageCount = episodeShots.filter((shot) => Boolean(shot.imageUrl || shot.storyboardImageUrl)).length;
    const videoCount = episodeShots.filter((shot) => Boolean(shot.videoUrl)).length;

    const runReview = async () => {
        if (!episode || reviewStatus === "running") return;
        setReviewStatus("running");
        setReviewError("");
        messageApi.loading({ content: "正在调用服务端审核模型...", key: "drama-review", duration: 0 });
        try {
            const response = await fetch("/api/drama/review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                    project: { id: project.id, title: project.title, summary: project.description || "", style: project.style || "", ratio: project.aspectRatio || "" },
                    episode: {
                        id: episode.id,
                        title: episode.title,
                        script: episode.script,
                        shots: episodeShots.map((shot) => ({
                            id: shot.id,
                            title: shot.title,
                            description: shot.description,
                            imagePrompt: shot.imagePrompt,
                            videoPrompt: shot.videoPrompt,
                            storyboardImageUrl: shot.storyboardImageUrl || shot.imageUrl,
                            storyboardEndImageUrl: (shot as Shot & { storyboardEndImageUrl?: string }).storyboardEndImageUrl,
                            videoUrl: shot.videoUrl,
                            sceneId: shot.sceneId,
                            characterIds: shot.characterIds,
                            propIds: shot.propIds,
                        })),
                    },
                }),
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { review?: CreativeReview } };
            if (!response.ok || payload.code !== 0 || !payload.data?.review) throw new Error(payload.msg || "审核服务返回无效结果");
            setReview(payload.data.review);
            setReviewStatus("done");
            messageApi.success({ content: payload.data.review.status === "passed" ? "服务端审核已通过" : payload.data.review.status === "needs_revision" ? "审核完成，请按问题修改" : "审核暂不可用，请稍后重试", key: "drama-review", duration: 4 });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "审核请求失败";
            setReviewError(errorMessage);
            setReviewStatus("idle");
            messageApi.error({ content: errorMessage, key: "drama-review", duration: 5 });
        }
    };

    const issues = review?.issues || [];
    const blockingIssueCount = issues.filter((issue) => issue.severity === "high").length;
    const conclusion = !review ? "尚未执行审核" : review.status === "passed" ? "可以进入成片导出" : review.status === "needs_revision" ? "建议修改后再导出" : "审核服务暂不可用";
    const statusLabel = !review ? "待执行" : review.status === "passed" ? "已通过" : review.status === "needs_revision" ? "需修改" : "暂不可用";
    const statusClass = !review
        ? "border-border bg-muted text-muted-foreground"
        : review.status === "passed"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : review.status === "needs_revision"
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-rose-300 bg-rose-50 text-rose-800";
    const severityLabel = (severity: "low" | "medium" | "high") => (severity === "high" ? "高" : severity === "medium" ? "中" : "低");
    const issueTarget = (taskId?: string): StepKey => (taskId?.startsWith("assets") ? "assets" : "storyboard");

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
                            <span className={cn("border px-2 py-0.5 text-xs", statusClass)}>{statusLabel}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            第 {episode?.number || 1} 集 · {episode?.title || "未命名剧集"}
                        </p>
                    </div>
                </div>
                <Button type="primary" icon={reviewStatus === "running" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={reviewStatus === "running"} disabled={!episode} onClick={() => void runReview()}>
                    {review ? "重新审核" : "开始审核"}
                </Button>
            </section>
            {reviewError ? <Alert type="error" showIcon message="审核请求失败" description={reviewError} /> : null}
            <section className="grid border border-border bg-card lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
                <div className="border-b border-border p-6 lg:border-b-0 lg:border-r">
                    <p className="text-sm text-muted-foreground">审核结论</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold">{conclusion}</h3>
                        <span className={cn("border px-2 py-1 text-xs font-medium", statusClass)}>
                            {review ? (blockingIssueCount ? `${blockingIssueCount} 个高优先级问题` : review.status === "passed" ? "未发现阻塞项" : "请查看审核意见") : "点击开始审核"}
                        </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">审核请求由服务端组合项目方向、资产关系和当前剧集产物后提交，结果会随任务状态持久化。</p>
                    <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3 text-sm">
                        <span>
                            <strong className="font-semibold">{issues.length}</strong> 个问题
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
                            <strong className="block text-2xl leading-none">{review?.score ?? "--"}</strong>
                            <small className="mt-1 block text-xs text-muted-foreground">综合评分</small>
                        </span>
                    </div>
                    <div>
                        <p className="font-medium">{review ? "服务端审核结果" : "等待审核"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{review?.summary || "尚未生成审核报告"}</p>
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
                    <div className="p-5 sm:p-6">
                        {review?.score !== undefined ? (
                            <div>
                                <div className="flex items-center justify-between gap-4 text-sm">
                                    <span>综合评分</span>
                                    <strong className="font-semibold">{review.score}</strong>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden bg-muted" role="progressbar" aria-label="综合评分" aria-valuemin={0} aria-valuemax={100} aria-valuenow={review.score}>
                                    <div className={cn("h-full", review.score >= 85 ? "bg-emerald-500" : review.score >= 70 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${review.score}%` }} />
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">执行审核后显示模型返回的评分，不使用前端估算值。</p>
                        )}
                    </div>
                </section>
                <section className="border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                        <h3 className="font-semibold">待处理问题</h3>
                        <span className="text-sm text-muted-foreground">{issues.length} 项</span>
                    </div>
                    <div className="divide-y divide-border">
                        {issues.length ? (
                            issues.map((issue, index) => {
                                const label = severityLabel(issue.severity);
                                const target = issueTarget(issue.taskId);
                                return (
                                    <div key={`${issue.taskId || "issue"}-${index}`} className="flex flex-wrap items-start gap-3 p-5 sm:px-6">
                                        <span
                                            className={cn(
                                                "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                                                issue.severity === "high" ? "bg-rose-100 text-rose-700" : issue.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700",
                                            )}
                                        >
                                            {issue.severity === "high" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs text-muted-foreground">{issue.category}</span>
                                                <span className={cn("px-1.5 py-0.5 text-xs", issue.severity === "high" ? "bg-rose-100 text-rose-700" : issue.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700")}>
                                                    {label}优先级
                                                </span>
                                            </div>
                                            <h4 className="mt-1 font-medium">{issue.message}</h4>
                                            {issue.correction ? <p className="mt-1 text-sm leading-6 text-muted-foreground">修改建议：{issue.correction}</p> : null}
                                        </div>
                                        {issue.taskId ? (
                                            <Button size="small" onClick={() => onStepChange(target)}>
                                                {target === "assets" ? "查看资产" : "前往分镜"}
                                            </Button>
                                        ) : null}
                                    </div>
                                );
                            })
                        ) : (
                            <p className="p-6 text-sm text-muted-foreground">{review ? "服务端未返回需要处理的问题。" : "执行审核后显示服务端问题清单。"}</p>
                        )}
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
            await assertJsonApiResponse(response);
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
    onReload,
    onCheckpoint,
    onShotSynced,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: ProjectUpdate, options?: SaveOptions) => Promise<boolean>;
    onReload: (options?: { silent?: boolean }) => Promise<void>;
    onCheckpoint: (episodeId: string, shots: unknown[]) => void;
    onShotSynced: (episodeId: string, shotId: string, shot: unknown) => void;
    messageApi: ReturnType<typeof message.useMessage>[0];
}) {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingShot, setEditingShot] = useState<Shot | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [constraintDrafts, setConstraintDrafts] = useState<Record<string, StoryboardConstraintDraft>>({});
    const [storyboardFrameModes, setStoryboardFrameModes] = useState<Record<string, "single" | "first_last">>({});
    const [collapsedShots, setCollapsedShots] = useState<Record<string, boolean>>({});
    useEffect(() => {
        const reveal = (event: Event) => {
            const shotId = (event as CustomEvent<{ shotId?: string }>).detail?.shotId;
            if (!shotId) return;
            setCollapsedShots((current) => ({ ...current, [shotId]: false }));
        };
        window.addEventListener(DRAMA_LAB_SHOT_FOCUS, reveal);
        return () => window.removeEventListener(DRAMA_LAB_SHOT_FOCUS, reveal);
    }, []);
    const constraintDraft = constraintDrafts[episode?.id || ""] || { shotCount: "", totalDuration: "", creationMode: "classic" as const, generateNarration: false };
    const lastExtractionCheckpointRef = useRef(0);
    const [startingKeys, setStartingKeys] = useState<Set<string>>(() => new Set());
    const startingKeysRef = useRef(new Set<string>());
    const [batchRunning, setBatchRunning] = useState<"image" | "video" | "">("");
    const batchRunningRef = useRef<"image" | "video" | "">("");
    const batchAbortRef = useRef<AbortController | null>(null);
    const operationAbortRef = useRef(new Map<string, AbortController>());
    const extractionAbortRef = useRef<AbortController | null>(null);
    const [audioSplitPlans, setAudioSplitPlans] = useState<Record<string, DramaLabAudioSplitPlan>>({});
    const disposedRef = useRef(false);
    const latestProjectRef = useRef(project);
    latestProjectRef.current = project;
    const [form] = Form.useForm();
    const episodeId = episode?.id;

    const episodeShots = episode ? project.shots.filter((s) => s.episodeId === episode.id).sort((a, b) => a.shotNumber - b.shotNumber) : [];
    const storyboardFrameMode = episode ? storyboardFrameModes[episode.id] || (episodeShots.some((shot) => shot.storyboardFrameMode === "first_last") ? "first_last" : "single") : "single";
    const updateStoryboardFrameMode = async (value: "single" | "first_last") => {
        if (!episode) return;
        setStoryboardFrameModes((current) => ({ ...current, [episode.id]: value }));
        const saved = await onSave({ shots: project.shots.map((shot) => (shot.episodeId === episode.id ? { ...shot, storyboardFrameMode: value } : shot)) }, { silent: true });
        if (!saved) messageApi.error("首尾帧模式保存失败");
    };
    const activeTaskShots = episodeShots.filter((shot) => isDramaLabTaskActive(shot.storyboardStatus) || isDramaLabVideoTaskActive(shot) || Object.values(shot.frames || {}).some((frame) => isDramaLabTaskActive(frame?.status)));
    const activeTaskShotsRef = useRef(activeTaskShots);
    activeTaskShotsRef.current = activeTaskShots;
    const activeTaskSignature = activeTaskShots.map(dramaLabGenerationSyncKey).join("|");
    const activeAudioTaskShots = episodeShots.filter((shot) => isDramaLabTaskActive(audioStateForKind(shot, "dialogue")?.status) || isDramaLabTaskActive(audioStateForKind(shot, "narration")?.status));
    const activeAudioTaskShotsRef = useRef(activeAudioTaskShots);
    activeAudioTaskShotsRef.current = activeAudioTaskShots;
    const activeAudioTaskSignature = activeAudioTaskShots
        .map(
            (shot) =>
                `${shot.id}:dialogue:${audioStateForKind(shot, "dialogue")?.taskId || ""}:${audioStateForKind(shot, "dialogue")?.status || ""}:narration:${audioStateForKind(shot, "narration")?.taskId || ""}:${audioStateForKind(shot, "narration")?.status || ""}`,
        )
        .join("|");
    // Keep refresh recovery keyed to durable task identity/state instead of
    // the freshly allocated episodeShots array from each render.
    const audioRecoverySignature = episodeShots
        .map((shot) => {
            const dialogue = audioStateForKind(shot, "dialogue");
            const narration = audioStateForKind(shot, "narration");
            return [shot.id, shot.episodeId, "d", dialogue?.taskId || "", dialogue?.status || "", dialogue?.attempt ?? "", "n", narration?.taskId || "", narration?.status || "", narration?.attempt ?? ""].join(":");
        })
        .join("|");
    const automaticSyncPausedRef = useRef(new Set<string>());
    const automaticAudioSyncPausedRef = useRef(new Set<string>());
    const syncInFlightRef = useRef(new Map<string, { promise: Promise<Shot | undefined>; controller: AbortController }>());
    const audioSyncInFlightRef = useRef(new Map<string, { promise: Promise<Shot | undefined>; controller: AbortController }>());
    const audioRecoveryAttemptedRef = useRef(new Set<string>());
    const [automaticAudioSyncRevision, setAutomaticAudioSyncRevision] = useState(0);
    const currentEpisodeIdRef = useRef(episodeId);
    currentEpisodeIdRef.current = episodeId;
    const [automaticSyncRevision, setAutomaticSyncRevision] = useState(0);
    const recoveryAttemptedRef = useRef(new Set<string>());
    const recoveryInFlightRef = useRef(new Map<string, Promise<boolean>>());
    const recoveryStateRef = useRef(new Map<string, "pending" | "ready" | "failed">());
    const recoveryStartedRef = useRef(new Set<string>());
    const recoveryAbortRef = useRef<AbortController | null>(null);
    const recoveryReloadRef = useRef(onReload);
    recoveryReloadRef.current = onReload;
    const recoveryMessageRef = useRef(messageApi);
    recoveryMessageRef.current = messageApi;

    const updateShot = async (shotId: string, patch: Partial<Shot>, options: SaveOptions = { silent: true }) => {
        const saved = await onSave(
            (current) => ({
                shots: current.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
            }),
            options,
        );
        if (!saved) throw new Error("保存分镜失败");
    };

    const syncShot = useCallback(
        async (shotId: string, silent = true, signal?: AbortSignal): Promise<Shot | undefined> => {
            if (!episodeId) return;
            const syncKey = `${project.id}:${episodeId}:${shotId}`;
            const existing = syncInFlightRef.current.get(syncKey);
            if (existing) return raceWithAbort(existing.promise, signal);
            const controller = new AbortController();
            const pending = Promise.resolve().then(async () => {
                const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
                const abortFromCaller = () => controller.abort();
                if (signal?.aborted) controller.abort();
                signal?.addEventListener("abort", abortFromCaller, { once: true });
                try {
                    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shotId)}/sync-generation?episodeId=${encodeURIComponent(episodeId)}`, {
                        method: "POST",
                        signal: controller.signal,
                    });
                    await assertJsonApiResponse(response);
                    const data = await response.json();
                    if (!response.ok || data.code !== 0) throw new Error(data.msg || "任务状态同步失败");
                    if (!data.data?.shot) throw new Error("任务状态同步响应缺少分镜数据");
                    // The generic `executionPhase` response is scheduler
                    // metadata for older clients. Video UI state must only
                    // consume the explicit video field.
                    const responsePhase = normalizeVideoExecutionPhase(data.data.shot.generationExecutionPhase);
                    const responseShot = responsePhase && typeof data.data.shot === "object" ? { ...data.data.shot, generationExecutionPhase: responsePhase } : data.data.shot;
                    if (!disposedRef.current && currentEpisodeIdRef.current === episodeId) onShotSynced(episodeId, shotId, responseShot);
                    if (!disposedRef.current && !silent) messageApi.success("任务状态已同步");
                    return responseShot as Shot;
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError" && (controller.signal.aborted || signal?.aborted || disposedRef.current)) throw error;
                    if (error instanceof DOMException && error.name === "AbortError") throw new Error("任务状态同步超时，请稍后使用同步按钮继续检查");
                    throw error;
                } finally {
                    signal?.removeEventListener("abort", abortFromCaller);
                    window.clearTimeout(timeoutId);
                    if (syncInFlightRef.current.get(syncKey)?.promise === pending) syncInFlightRef.current.delete(syncKey);
                }
            });
            syncInFlightRef.current.set(syncKey, { promise: pending, controller });
            return pending;
        },
        [episodeId, messageApi, onShotSynced, project.id],
    );

    const syncAudio = useCallback(
        async (shotId: string, kind: "dialogue" | "narration", silent = true, signal?: AbortSignal, requestedTaskId?: string): Promise<Shot | undefined> => {
            if (!episodeId) return;
            const sourceShot = latestProjectRef.current.shots.find((shot) => shot.id === shotId && shot.episodeId === episodeId);
            const taskId = requestedTaskId || (sourceShot ? audioStateForKind(sourceShot, kind)?.taskId : undefined);
            if (!taskId) return;
            const syncKey = `${project.id}:${episodeId}:${shotId}:${kind}:${taskId}`;
            const existing = audioSyncInFlightRef.current.get(syncKey);
            if (existing) return raceWithAbort(existing.promise, signal);
            const controller = new AbortController();
            const pending = Promise.resolve().then(async () => {
                const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
                const abortFromCaller = () => controller.abort();
                if (signal?.aborted) controller.abort();
                signal?.addEventListener("abort", abortFromCaller, { once: true });
                try {
                    const query = new URLSearchParams({ episodeId, taskId, kind });
                    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shotId)}/sync-audio?${query.toString()}`, {
                        method: "POST",
                        signal: controller.signal,
                    });
                    await assertJsonApiResponse(response);
                    const data = await response.json();
                    if (!response.ok || data.code !== 0) throw new Error(data.msg || "audio sync failed");
                    if (!data.data?.shot) throw new Error("audio sync response missing shot");
                    if (controller.signal.aborted || disposedRef.current || currentEpisodeIdRef.current !== episodeId) return undefined;
                    onShotSynced(episodeId, shotId, data.data.shot);
                    if (!silent) messageApi.success("闊抽鐘舵€佸凡鍚屾");
                    return data.data.shot as Shot;
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError" && (controller.signal.aborted || signal?.aborted || disposedRef.current)) throw error;
                    if (error instanceof DOMException && error.name === "AbortError") throw new Error("audio sync timed out; retry");
                    throw error;
                } finally {
                    signal?.removeEventListener("abort", abortFromCaller);
                    window.clearTimeout(timeoutId);
                    if (audioSyncInFlightRef.current.get(syncKey)?.promise === pending) audioSyncInFlightRef.current.delete(syncKey);
                }
            });
            audioSyncInFlightRef.current.set(syncKey, { promise: pending, controller });
            return pending;
        },
        [episodeId, messageApi, onShotSynced, project.id],
    );

    const recoverAudio = useCallback(
        async (shot: Shot, kind: "dialogue" | "narration", silent = false, signal?: AbortSignal): Promise<boolean> => {
            if (!episodeId) return false;
            const state = audioStateForKind(shot, kind);
            const taskId = state?.taskId;
            if (!taskId) {
                if (!silent) messageApi.info(`${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}鏆傛棤鍙仮澶嶇殑闊抽浠诲姟`);
                return false;
            }
            const actionKey = `audio-recover:${kind}:${shot.id}`;
            if (startingKeysRef.current.has(actionKey)) return false;
            const controller = signal ? undefined : new AbortController();
            const requestSignal = signal || controller?.signal;
            if (controller) operationAbortRef.current.set(actionKey, controller);
            try {
                setActionBusy(actionKey, true);
                if (!silent) messageApi.loading({ content: `姝ｅ湪鎭㈠${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}闊抽浠诲姟...`, key: actionKey, duration: 0 });
                const query = new URLSearchParams({ episodeId, taskId, kind });
                const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/recover-audio?${query.toString()}`, {
                    method: "POST",
                    signal: requestSignal,
                });
                await assertJsonApiResponse(response);
                const data = await response.json();
                if (!response.ok || data.code !== 0) throw new Error(data.msg || "闊抽浠诲姟鎭㈠澶辫触");
                if (requestSignal?.aborted || disposedRef.current || currentEpisodeIdRef.current !== episodeId) return false;
                if (data.data?.project) {
                    await onReload();
                } else if (data.data?.shot) {
                    onShotSynced(episodeId, shot.id, data.data.shot);
                } else {
                    await syncAudio(shot.id, kind, true, requestSignal, taskId);
                }
                if (!silent) messageApi.success({ content: `${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}闊抽浠诲姟宸叉仮澶嶅苟鍚屾`, key: actionKey, duration: 4 });
                return true;
            } catch (error) {
                if (!silent && !requestSignal?.aborted && !disposedRef.current) messageApi.error({ content: error instanceof Error ? error.message : "闊抽浠诲姟鎭㈠澶辫触", key: actionKey, duration: 6 });
                return false;
            } finally {
                if (controller && operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
                if (!disposedRef.current) setActionBusy(actionKey, false);
                else startingKeysRef.current.delete(actionKey);
                if (requestSignal?.aborted || disposedRef.current) messageApi.destroy(actionKey);
            }
        },
        [episodeId, messageApi, onReload, onShotSynced, project.id, syncAudio],
    );

    const setActionBusy = (key: string, busy: boolean) => {
        if (busy) startingKeysRef.current.add(key);
        else startingKeysRef.current.delete(key);
        setStartingKeys((current) => {
            const next = new Set(current);
            if (busy) next.add(key);
            else next.delete(key);
            return next;
        });
    };

    const abortTrackedOperations = useCallback(() => {
        batchAbortRef.current?.abort();
        extractionAbortRef.current?.abort();
        extractionAbortRef.current = null;
        recoveryAbortRef.current?.abort();
        for (const controller of operationAbortRef.current.values()) controller.abort();
        operationAbortRef.current.clear();
        for (const request of syncInFlightRef.current.values()) request.controller.abort();
        syncInFlightRef.current.clear();
        for (const request of audioSyncInFlightRef.current.values()) request.controller.abort();
        audioSyncInFlightRef.current.clear();
        for (const key of startingKeysRef.current) messageApi.destroy(key);
        messageApi.destroy("drama-video-batch");
        startingKeysRef.current.clear();
        if (!disposedRef.current) {
            setStartingKeys(new Set());
            batchRunningRef.current = "";
            setBatchRunning("");
            batchAbortRef.current = null;
        }
    }, [messageApi]);

    useEffect(() => {
        disposedRef.current = false;
        return () => {
            disposedRef.current = true;
            abortTrackedOperations();
        };
    }, [abortTrackedOperations]);

    // Register the scope cleanup before the polling effects below. React runs
    // dependency cleanups before the next effect setup; keeping this effect
    // first guarantees that an old episode is aborted before the new episode
    // starts its initial automatic sync.
    useEffect(() => {
        return () => {
            abortTrackedOperations();
        };
    }, [abortTrackedOperations, episodeId, project.id]);

    const applyCreatedTask = (shot: Shot, kind: "image" | "video", taskId: string) => {
        announceDramaLabTaskCreated(project.id);
        onShotSynced(episodeId!, shot.id, {
            id: shot.id,
            ...(kind === "image"
                ? { storyboardStatus: "running", storyboardTaskId: taskId, storyboardError: undefined }
                : { generationStatus: "running", generationTaskId: taskId, generationExecutionPhase: "created" as const, generationNeedsReview: undefined, generationError: undefined }),
        });
    };

    const applyCreatedFrameTask = (shot: Shot, frameType: "first" | "key" | "last", taskId: string, prompt?: string, description?: string) => {
        announceDramaLabTaskCreated(project.id);
        onShotSynced(episodeId!, shot.id, {
            id: shot.id,
            frames: {
                [frameType]: {
                    prompt: prompt || shot.frames?.[frameType]?.prompt || "",
                    description: description || shot.frames?.[frameType]?.description,
                    status: "running",
                    taskId,
                    error: undefined,
                },
            },
        });
    };

    const syncShotManually = async (shot: Shot) => {
        await syncShot(shot.id, false);
        const taskKey = dramaLabGenerationSyncKey(shot);
        automaticSyncPausedRef.current.delete(taskKey);
        setAutomaticSyncRevision((current) => current + 1);
    };

    useEffect(() => {
        if (!episodeId || !activeTaskSignature) return;
        let disposed = false;
        let timer: number | undefined;
        const activeKeys = new Set(activeTaskShotsRef.current.map(dramaLabGenerationSyncKey));
        for (const key of automaticSyncPausedRef.current) {
            if (!activeKeys.has(key)) automaticSyncPausedRef.current.delete(key);
        }
        const sync = async () => {
            for (const shot of activeTaskShotsRef.current) {
                if (disposed) return;
                const taskKey = dramaLabGenerationSyncKey(shot);
                if (automaticSyncPausedRef.current.has(taskKey)) continue;
                try {
                    await syncShot(shot.id);
                } catch (error) {
                    if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
                    if (!automaticSyncPausedRef.current.has(taskKey)) {
                        automaticSyncPausedRef.current.add(taskKey);
                        messageApi.warning({
                            key: `drama-lab-auto-sync-paused:${shot.id}`,
                            content: "任务状态自动同步已暂停，请使用分镜卡片右上角的同步按钮继续检查。",
                            duration: 6,
                        });
                    }
                }
            }
            const hasPendingAutomaticSync = activeTaskShotsRef.current.some((shot) => !automaticSyncPausedRef.current.has(dramaLabGenerationSyncKey(shot)));
            if (!disposed && hasPendingAutomaticSync) timer = window.setTimeout(() => void sync(), 2500);
        };
        void sync();
        return () => {
            disposed = true;
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [activeTaskSignature, automaticSyncRevision, episodeId, messageApi, syncShot]);

    // Audio tracks use their own synchronization route and task identity. A
    // video sync request must never overwrite one track with the other, so we
    // poll each active dialogue/narration task independently.
    useEffect(() => {
        if (!episodeId || !activeAudioTaskSignature) return;
        let disposed = false;
        let timer: number | undefined;
        const activeKeys = new Set(
            activeAudioTaskShotsRef.current.flatMap((shot) =>
                (["dialogue", "narration"] as const).flatMap((kind) => {
                    const state = audioStateForKind(shot, kind);
                    return state?.taskId && isDramaLabTaskActive(state.status) ? [`${shot.id}:${kind}:${state.taskId}`] : [];
                }),
            ),
        );
        for (const key of automaticAudioSyncPausedRef.current) if (!activeKeys.has(key)) automaticAudioSyncPausedRef.current.delete(key);
        const sync = async () => {
            for (const shot of activeAudioTaskShotsRef.current) {
                for (const kind of ["dialogue", "narration"] as const) {
                    if (disposed) return;
                    const state = audioStateForKind(shot, kind);
                    if (!state?.taskId || !isDramaLabTaskActive(state.status)) continue;
                    const key = `${shot.id}:${kind}:${state.taskId}`;
                    if (automaticAudioSyncPausedRef.current.has(key)) continue;
                    try {
                        await syncAudio(shot.id, kind);
                    } catch (error) {
                        if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
                        automaticAudioSyncPausedRef.current.add(key);
                        messageApi.warning({
                            key: `drama-lab-audio-auto-sync-paused:${shot.id}:${kind}`,
                            content: `${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}闊抽鑷姩鍚屾宸叉殏鍋滐紝璇峰湪闀滃ご鍗＄墖涓墜鍔ㄥ悓姝ユ垨鎭㈠銆俙`,
                            duration: 6,
                        });
                    }
                }
            }
            const pending = activeAudioTaskShotsRef.current.some((shot) =>
                (["dialogue", "narration"] as const).some((kind) => {
                    const state = audioStateForKind(shot, kind);
                    return Boolean(state?.taskId && isDramaLabTaskActive(state.status) && !automaticAudioSyncPausedRef.current.has(`${shot.id}:${kind}:${state.taskId}`));
                }),
            );
            if (!disposed && pending) timer = window.setTimeout(() => void sync(), 2500);
        };
        void sync();
        return () => {
            disposed = true;
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [activeAudioTaskSignature, automaticAudioSyncRevision, episodeId, messageApi, syncAudio]);

    // Reattach to audio tasks after a refresh. The original task id is sent to
    // the recovery route; no new task is submitted and no duplicate charge is
    // possible. Each track is attempted once per task id in this mount.
    useEffect(() => {
        if (!episodeId) return;
        let disposed = false;
        for (const shot of episodeShots) {
            for (const kind of ["dialogue", "narration"] as const) {
                const state = audioStateForKind(shot, kind);
                if (!state?.taskId || !isDramaLabTaskActive(state.status)) continue;
                const key = `${project.id}:${episodeId}:${shot.id}:${kind}:${state.taskId}`;
                if (audioRecoveryAttemptedRef.current.has(key)) continue;
                audioRecoveryAttemptedRef.current.add(key);
                void (async () => {
                    try {
                        const synced = await syncAudio(shot.id, kind, true);
                        if (disposed) return;
                        const observed = normalizeShot(synced || shot, episodeId, Math.max(0, shot.shotNumber - 1));
                        const observedState = observed ? audioStateForKind(observed, kind) : state;
                        if (observedState?.taskId === state.taskId && isDramaLabTaskActive(observedState?.status)) await recoverAudio(observed || shot, kind, true);
                    } catch {
                        // The card's explicit recovery button remains available
                        // when a provider is temporarily unavailable on mount.
                    }
                })();
            }
        }
        return () => {
            disposed = true;
        };
    }, [audioRecoverySignature, episodeId, project.id, recoverAudio, syncAudio]);

    // Re-discover durable video tasks whenever an episode is opened. This is
    // intentionally scoped to the current project and episode; it repairs a
    // lost in-memory binding without allowing a task from another project to
    // be guessed from a prompt or a display name.
    useEffect(() => {
        if (!episodeId) return;
        const recoveryKey = `${project.id}:${episodeId}`;
        const previousState = recoveryStateRef.current.get(recoveryKey);
        if (dramaLabRecoveryStarted.has(recoveryKey) || recoveryStartedRef.current.has(recoveryKey) || previousState === "pending" || previousState === "ready" || recoveryAttemptedRef.current.has(recoveryKey)) return;
        dramaLabRecoveryStarted.add(recoveryKey);
        recoveryStartedRef.current.add(recoveryKey);
        let disposed = false;
        const controller = new AbortController();
        recoveryAbortRef.current?.abort();
        recoveryAbortRef.current = controller;
        recoveryStateRef.current.set(recoveryKey, "pending");

        const recover = async (): Promise<boolean> => {
            try {
                const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/episodes/${encodeURIComponent(episodeId)}/recover-generation`, {
                    method: "GET",
                    cache: "no-store",
                    signal: controller.signal,
                });
                await assertJsonApiResponse(response);
                const data = await response.json();
                if (!response.ok || data.code !== 0) throw new Error(data.msg || "视频任务恢复失败");
                if (disposed) return false;
                const result = data.data as { tasks?: Array<{ binding?: string }>; syncedShotIds?: string[]; syncErrors?: unknown[] } | undefined;
                const discovered = Boolean(result?.tasks?.some((task) => task.binding === "discovered"));
                const changed = discovered || Boolean(result?.syncedShotIds?.length);
                if (changed) await recoveryReloadRef.current();
                if (disposed || controller.signal.aborted) return false;
                if (result?.syncErrors?.length) {
                    recoveryMessageRef.current.warning({ key: `drama-lab-recovery:${episodeId}`, content: "部分分镜视频任务未能自动恢复，请在对应分镜卡片中手动同步。", duration: 6 });
                }
                recoveryAttemptedRef.current.add(recoveryKey);
                recoveryStateRef.current.set(recoveryKey, "ready");
                return true;
            } catch (error) {
                if (disposed || controller.signal.aborted) return false;
                recoveryStateRef.current.set(recoveryKey, "failed");
                messageApi.warning({ key: `drama-lab-recovery:${episodeId}`, content: error instanceof Error ? `${error.message}，可在分镜卡片中手动同步。` : "视频任务恢复失败，可在分镜卡片中手动同步。", duration: 6 });
                return false;
            } finally {
                if (recoveryAbortRef.current === controller) recoveryAbortRef.current = null;
            }
        };
        const pending = recover();
        recoveryInFlightRef.current.set(recoveryKey, pending);
        void pending.then(
            () => {
                if (recoveryInFlightRef.current.get(recoveryKey) === pending) recoveryInFlightRef.current.delete(recoveryKey);
            },
            () => {
                if (recoveryInFlightRef.current.get(recoveryKey) === pending) recoveryInFlightRef.current.delete(recoveryKey);
            },
        );
        return () => {
            disposed = true;
            controller.abort();
            if (recoveryAbortRef.current === controller) recoveryAbortRef.current = null;
            if (recoveryInFlightRef.current.get(recoveryKey) === pending) recoveryInFlightRef.current.delete(recoveryKey);
        };
    }, [episodeId, project.id]);

    const handleAdd = () => {
        setEditingShot(null);
        form.resetFields();
        form.setFieldsValue({
            episodeId: episode?.id,
            shotNumber: episodeShots.length + 1,
            title: `镜头 ${episodeShots.length + 1}`,
            duration: 3,
            characterIds: [],
            propIds: [],
        });
        setModalVisible(true);
    };

    const extractFromScript = async () => {
        if (!episode || extracting) return;
        const controller = new AbortController();
        extractionAbortRef.current?.abort();
        extractionAbortRef.current = controller;
        try {
            setExtracting(true);
            const storyboardOptions = normalizeDramaLabStoryboardOptions(constraintDraft);
            lastExtractionCheckpointRef.current = episodeShots.length;
            messageApi.loading({ content: "正在从剧本提取分镜...", key: "extract-storyboards", duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/extract-storyboards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeId: episode.id, requestId: createDramaLabClientRequestId(), storyboardOptions }),
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || typeof data.data?.taskId !== "string") throw new Error(data.msg || "分镜提取任务创建失败");
            const taskId = data.data.taskId as string;
            announceDramaLabTaskCreated(project.id);
            for (;;) {
                if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
                const statusResponse = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/workflow?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store", signal: controller.signal });
                await assertJsonApiResponse(statusResponse);
                const statusData = await statusResponse.json();
                if (!statusResponse.ok || statusData.code !== 0 || !statusData.data) throw new Error(statusData.msg || "分镜提取任务状态读取失败");
                const status = statusData.data.status as string;
                const checkpoint = statusData.data.checkpoint as { episodeId?: string; shotCount?: number; shots?: unknown[] } | undefined;
                const checkpointCount = checkpoint?.episodeId === episode.id && Number.isFinite(Number(checkpoint.shotCount)) ? Number(checkpoint.shotCount) : 0;
                if (checkpointCount > lastExtractionCheckpointRef.current) {
                    lastExtractionCheckpointRef.current = checkpointCount;
                    if (checkpoint?.shots?.length) onCheckpoint(episode.id, checkpoint.shots);
                    else await onReload({ silent: true });
                }
                if (status === "success") break;
                if (status === "error" || status === "cancelled") throw new Error(statusData.data.error || (status === "cancelled" ? "分镜提取任务已取消" : "分镜提取失败"));
                await new Promise<void>((resolve) => window.setTimeout(resolve, 1_000));
            }
            await onReload({ silent: true });
            messageApi.success({ content: "分镜提取完成", key: "extract-storyboards", duration: 3 });
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) messageApi.error({ content: error instanceof Error ? error.message : "分镜提取失败", key: "extract-storyboards", duration: 3 });
        } finally {
            if (extractionAbortRef.current === controller) extractionAbortRef.current = null;
            if (!disposedRef.current) setExtracting(false);
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
        form.validateFields()
            .then(async (values) => {
                const details = {
                    ...values,
                    segmentIndex: values.segmentIndex === "" || values.segmentIndex === undefined ? undefined : Number(values.segmentIndex),
                    shotNumber: Math.max(1, Number(values.shotNumber) || 1),
                    duration: Math.max(1, Number(values.duration) || 3),
                    script: values.description || "",
                    sourceText: values.sourceText || values.description || "",
                    description: values.description || "",
                };
                if (editingShot) {
                    await updateShot(editingShot.id, details);
                } else {
                    const newShot: Shot = {
                        ...details,
                        id: `shot_${crypto.randomUUID()}`,
                        episodeId: episode?.id || "",
                        sceneId: details.sceneId,
                        characterIds: details.characterIds || [],
                        propIds: details.propIds || [],
                        shotNumber: details.shotNumber,
                        title: details.title || `镜头 ${details.shotNumber}`,
                        description: details.description,
                        sourceText: details.sourceText,
                        shotBoundary: details.shotBoundary || "",
                        dialogue: details.dialogue || "",
                        narration: details.narration || "",
                        script: details.script,
                        imagePrompt: details.imagePrompt,
                        videoPrompt: details.videoPrompt,
                        cameraMotion: details.cameraMotion,
                        duration: details.duration,
                        cameraAngle: details.cameraAngle,
                        storyboardStatus: "idle",
                        generationStatus: "idle",
                    };
                    const saved = await onSave((current) => ({ shots: [...current.shots.map((shot) => (shot.episodeId === newShot.episodeId && shot.shotNumber >= newShot.shotNumber ? { ...shot, shotNumber: shot.shotNumber + 1 } : shot)), newShot] }));
                    if (!saved) throw new Error("保存分镜失败");
                }
                setModalVisible(false);
                messageApi.success(editingShot ? "分镜已更新" : "分镜已添加");
            })
            .catch((error) => messageApi.error(error instanceof Error ? error.message : "分镜保存失败"));
    };

    const handleDelete = (id: string) => {
        Modal.confirm({
            title: "确认删除",
            content: "确定要删除这个分镜吗？",
            onOk: async () => {
                const saved = await onSave({ shots: project.shots.filter((s) => s.id !== id) });
                if (!saved) throw new Error("删除分镜失败");
                messageApi.success("分镜已删除");
            },
        });
    };

    const startGeneration = async (shot: Shot, kind: "image" | "video", signal?: AbortSignal): Promise<string | undefined> => {
        if (!episode) return undefined;
        if (signal?.aborted || disposedRef.current) return undefined;
        if (currentEpisodeIdRef.current !== episode.id || latestProjectRef.current.id !== project.id) return undefined;
        if (kind === "video" && requiresDramaLabVideoTaskCheck(shot)) {
            messageApi.warning("当前视频任务待检查，请先点击“检查状态”，不会重复提交生成任务。");
            return undefined;
        }
        if (kind === "video" && shot.creationMode !== "universal" && !shot.frames?.key?.url && !shot.storyboardImageUrl) {
            Modal.warning({
                title: "无法生成分镜视频",
                content: "请先生成当前镜头的关键帧或分镜图，再提交视频生成任务。",
                okText: "知道了",
            });
            return undefined;
        }
        if (kind === "image") {
            const missing = missingShotAssetLabels(project, shot);
            if (missing.length) {
                Modal.warning({
                    title: "无法生成分镜图",
                    content: `当前镜头绑定的资产缺少参考图：${missing.join("、")}。请先到“资产准备”中生成或添加参考图。`,
                    okText: "知道了",
                });
                return undefined;
            }
        }
        const actionKey = `${kind}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const ownedController = signal ? undefined : new AbortController();
        const requestSignal = signal || ownedController?.signal;
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        if (ownedController) operationAbortRef.current.set(actionKey, ownedController);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: kind === "image" ? "正在创建分镜图任务..." : "正在创建分镜视频任务...", key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/generate-${kind}?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
                signal: requestSignal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "任务创建失败");
            const taskId = typeof data.data?.task?.id === "string" ? data.data.task.id : "";
            if (!taskId) throw new Error("任务创建响应缺少任务 ID");
            if (requestSignal?.aborted || isStale()) return taskId;
            // Keep the new task in this view even if the immediately following
            // sync request fails. The server has already persisted it.
            applyCreatedTask(shot, kind, taskId);
            // The generation route already persists the task ID. Sync just this
            // shot so a slow project reload cannot leave the card in a stale state.
            if (requestSignal?.aborted || isStale()) return taskId;
            await syncShot(shot.id, false, requestSignal).catch((error) => {
                if (requestSignal?.aborted || isStale()) throw error;
                messageApi.warning({ content: error instanceof Error ? `${error.message}，任务已创建，可稍后同步。` : "任务已创建，可稍后同步。", key: `drama-lab-initial-sync:${shot.id}`, duration: 6 });
            });
            if (requestSignal?.aborted || isStale()) return taskId;
            messageApi.success({ content: kind === "image" ? "分镜图任务已提交" : "分镜视频任务已提交", key: actionKey });
            return taskId;
        } catch (err) {
            if (requestSignal?.aborted || isStale()) return undefined;
            messageApi.error({ content: err instanceof Error ? err.message : "任务创建失败", key: actionKey, duration: 6 });
            return undefined;
        } finally {
            if (ownedController && operationAbortRef.current.get(actionKey) === ownedController) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (requestSignal?.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const startAudioGeneration = async (shot: Shot, kind: "dialogue" | "narration") => {
        if (!episode) return;
        const text = audioTextForKind(shot, kind);
        if (!text) {
            Modal.warning({
                title: `鏃犳硶鐢熸垚${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}闊抽`,
                content: `褰撳墠闀滃ご娌℃湁${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}鏂囨湰锛岃鍏堣ˉ鍏呮枃鏈悗鍐嶇敓鎴愩€?`,
                okText: "鐭ラ亾浜?",
            });
            return;
        }
        const actionKey = `audio:${kind}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: `姝ｅ湪鍒涘缓${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}闊抽浠诲姟...`, key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/generate-audio?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind }),
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "闊抽浠诲姟鍒涘缓澶辫触");
            const taskId = typeof data.data?.task?.id === "string" ? data.data.task.id : "";
            if (!taskId) throw new Error("闊抽浠诲姟鍒涘缓鍝嶅簲缂哄皯浠诲姟 ID");
            if (controller.signal.aborted || isStale()) return;
            const state: DramaShotAudioState = {
                status: "running",
                taskId,
                attempt: typeof data.data?.task?.attemptNo === "number" ? data.data.task.attemptNo : undefined,
                speaker: typeof data.data?.speaker === "string" ? data.data.speaker : undefined,
            };
            onShotSynced(episode.id, shot.id, {
                id: shot.id,
                ...(kind === "narration" ? { narrationAudio: state } : { dialogueAudio: state }),
                audioStatus: "running",
                audioTaskId: taskId,
                audioError: undefined,
            });
            // Sync once immediately so an already-completed provider result is
            // shown without waiting for the automatic polling tick.
            await syncAudio(shot.id, kind, true, controller.signal, taskId).catch((error) => {
                if (controller.signal.aborted || isStale()) throw error;
                messageApi.warning({ content: error instanceof Error ? `${error.message}; task created, retry sync later` : "audio task created; retry sync later", key: `drama-lab-audio-initial-sync:${shot.id}:${kind}`, duration: 6 });
            });
            if (!controller.signal.aborted && !isStale()) messageApi.success({ content: `${kind === "dialogue" ? "对话" : "旁白"}音频任务已提交`, key: actionKey, duration: 4 });
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "闊抽浠诲姟鍒涘缓澶辫触", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const syncAudioManually = async (shot: Shot, kind: "dialogue" | "narration") => {
        const state = audioStateForKind(shot, kind);
        if (!state?.taskId) {
            messageApi.info(`${kind === "dialogue" ? "瀵圭櫧" : "鏃佺櫧"}鏆傛棤闊抽浠诲姟`);
            return;
        }
        const actionKey = `audio-sync:${kind}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        setActionBusy(actionKey, true);
        try {
            await syncAudio(shot.id, kind, false, undefined, state.taskId);
            automaticAudioSyncPausedRef.current.delete(`${shot.id}:${kind}:${state.taskId}`);
            setAutomaticAudioSyncRevision((current) => current + 1);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "audio sync failed");
        } finally {
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
        }
    };

    const recoverAudioManually = async (shot: Shot, kind: "dialogue" | "narration") => {
        const recovered = await recoverAudio(shot, kind, false);
        if (recovered) {
            const state = audioStateForKind(shot, kind);
            if (state?.taskId) automaticAudioSyncPausedRef.current.delete(`${shot.id}:${kind}:${state.taskId}`);
            setAutomaticAudioSyncRevision((current) => current + 1);
        }
    };

    const previewAudioSplit = async (shot: Shot) => {
        if (!episode || shot.audioSplitSourceShotId) return;
        const actionKey = `audio-split-preview:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const controller = new AbortController();
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在按音频分析拆镜候选", key: actionKey, duration: 0 });
            const query = `?episodeId=${encodeURIComponent(episode.id)}`;
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/split-by-audio${query}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "preview" }),
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.plan) throw new Error(data.msg || "闊抽鎷嗛暅棰勮澶辫触");
            setAudioSplitPlans((current) => ({ ...current, [shot.id]: data.data.plan as DramaLabAudioSplitPlan }));
            messageApi.success({ content: "闊抽鎷嗛暅棰勮宸茬敓鎴愶紝璇锋鏌ュ悗纭", key: actionKey, duration: 4 });
        } catch (error) {
            if (!controller.signal.aborted) messageApi.error({ content: error instanceof Error ? error.message : "闊抽鎷嗛暅棰勮澶辫触", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
        }
    };

    const applyAudioSplit = async (shot: Shot) => {
        if (!episode) return;
        const plan = audioSplitPlans[shot.id];
        if (!plan) return;
        const actionKey = `audio-split-apply:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const controller = new AbortController();
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在保存音频拆镜候选", key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/split-by-audio?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "apply", plan }),
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "闊抽鎷嗛暅淇濆瓨澶辫触");
            if (controller.signal.aborted || disposedRef.current) return;
            setAudioSplitPlans((current) => {
                const next = { ...current };
                delete next[shot.id];
                return next;
            });
            await onReload();
            messageApi.success({ content: data.msg || "闊抽鎷嗛暅鍊欓€夊凡淇濆瓨", key: actionKey, duration: 5 });
        } catch (error) {
            if (!controller.signal.aborted) messageApi.error({ content: error instanceof Error ? error.message : "闊抽鎷嗛暅淇濆瓨澶辫触", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
        }
    };

    const checkVideoStatus = async (shot: Shot) => {
        if (!shot.generationTaskId) return;
        const actionKey = `video-status:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episodeId;
        const operationProjectId = project.id;
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        const controller = new AbortController();
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在检查原视频任务状态...", key: actionKey, duration: 0 });
            const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
            try {
                await recoverVideoGenerationTask(
                    {
                        id: shot.generationTaskId,
                        serverTaskId: shot.generationTaskId,
                        provider: "generation",
                        model: "drama-lab-video",
                        pollPath: "server",
                    },
                    { signal: controller.signal },
                );
            } finally {
                window.clearTimeout(timeoutId);
            }
            if (controller.signal.aborted || isStale()) return;
            await syncShot(shot.id, true, controller.signal);
            if (controller.signal.aborted || isStale()) return;
            messageApi.success({ content: "已检查原视频任务状态，正在同步结果。", key: actionKey, duration: 3 });
        } catch (error) {
            // The recovery endpoint may have just settled the original task. Sync it once
            // so the card receives its definitive result or terminal error.
            if (!controller.signal.aborted && !isStale()) {
                await syncShot(shot.id, true, controller.signal).catch(() => undefined);
                if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "检查原视频任务状态失败", key: actionKey, duration: 6 });
            }
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const waitForEpisodeRecovery = async (recoveryKey: string, signal: AbortSignal) => {
        const pending = recoveryInFlightRef.current.get(recoveryKey);
        if (pending) await raceWithAbort(pending, signal);
        const state = recoveryStateRef.current.get(recoveryKey);
        // A batch must never race the mount effect that starts recovery. An
        // absent state means recovery has not been established yet, not that
        // it succeeded; the user can retry once the episode is ready.
        return state === "ready" || recoveryAttemptedRef.current.has(recoveryKey);
    };

    const runBatch = async (kind: "image" | "video") => {
        if (!episode || batchRunningRef.current) return;
        const currentEpisode = episode;
        const recoveryKey = `${project.id}:${currentEpisode.id}`;
        // Set the lock before the first await. React state is intentionally not
        // used as the mutex because two clicks can arrive in the same event
        // turn before a re-render commits.
        batchRunningRef.current = kind;
        setBatchRunning(kind);
        const abortController = new AbortController();
        batchAbortRef.current?.abort();
        batchAbortRef.current = abortController;
        try {
            try {
                const recoveryReady = await waitForEpisodeRecovery(recoveryKey, abortController.signal);
                if (!recoveryReady) {
                    if (!disposedRef.current && !abortController.signal.aborted) messageApi.warning("剧集任务恢复未完成，请先同步现有任务后再批量生成");
                    return;
                }
            } catch (error) {
                if (abortController.signal.aborted || disposedRef.current) return;
                messageApi.warning({ content: error instanceof Error ? error.message : "剧集任务恢复失败，请先同步现有任务", key: "drama-video-batch", duration: 6 });
                return;
            }
            if (abortController.signal.aborted || disposedRef.current) return;
            const sourceProject = latestProjectRef.current;
            const sourceShots = sourceProject.shots.filter((shot) => shot.episodeId === currentEpisode.id).sort((a, b) => a.shotNumber - b.shotNumber);
            const candidates = sourceShots.filter((shot) =>
                kind === "image"
                    ? !shot.storyboardImageUrl && !isDramaLabTaskActive(shot.storyboardStatus)
                    : (shot.creationMode === "universal" || Boolean(shot.frames?.key?.url || shot.storyboardImageUrl)) && !shot.videoUrl && !requiresDramaLabVideoTaskCheck(shot) && !isDramaLabVideoTaskActive(shot),
            );
            if (!candidates.length) {
                if (!disposedRef.current) messageApi.info(kind === "image" ? "没有待生成的分镜图" : "没有待生成的分镜视频");
                return;
            }
            const missingByShot = candidates.map((shot) => ({ shot, missing: missingShotAssetLabels(sourceProject, shot) })).filter((item) => item.missing.length);
            const executableCandidates = candidates.filter((shot) => !missingByShot.some((item) => item.shot.id === shot.id));
            if (missingByShot.length && !disposedRef.current && !abortController.signal.aborted) {
                const details = missingByShot
                    .slice(0, 8)
                    .map((item) => `镜头 ${item.shot.shotNumber}：${item.missing.join("、")}`)
                    .join("；");
                const suffix = missingByShot.length > 8 ? `；另有 ${missingByShot.length - 8} 个镜头缺少资产参考图` : "";
                messageApi.warning({ content: `已跳过 ${missingByShot.length} 个缺少资产参考图的镜头：${details}${suffix}`, key: "drama-batch-missing-assets", duration: 8 });
            }
            if (!executableCandidates.length) return;
            const targets: Array<{ shotId: string; taskId: string }> = [];
            const submissionFailures: Array<{ shotId: string; error: string }> = [];
            for (const shot of executableCandidates) {
                if (abortController.signal.aborted || disposedRef.current) return;
                let observedShot = shot;
                if (kind === "video" && shot.generationTaskId) {
                    // Reconcile a task retained by the server before creating
                    // a new one after a stale page refresh.
                    observedShot = (await syncShot(shot.id, true, abortController.signal).catch(() => undefined)) || shot;
                    const observedVideoTaskId = observedShot.generationTaskId?.trim();
                    if (observedVideoTaskId && isDramaLabVideoTaskActive(observedShot)) {
                        targets.push({ shotId: observedShot.id, taskId: observedVideoTaskId });
                        continue;
                    }
                }
                const taskId = await startGeneration(observedShot, kind, abortController.signal);
                if (kind === "video") {
                    if (taskId) targets.push({ shotId: observedShot.id, taskId });
                    else if (!abortController.signal.aborted && !disposedRef.current) submissionFailures.push({ shotId: observedShot.id, error: "任务未创建" });
                }
            }
            if (kind === "video" && (targets.length || submissionFailures.length) && !abortController.signal.aborted && !disposedRef.current) {
                const summary = await waitForDramaLabVideoBatch({
                    targets,
                    initialFailures: submissionFailures,
                    signal: abortController.signal,
                    // Keep a stuck provider from leaving the workbench in a
                    // spinner forever; the task remains recoverable by sync.
                    maxPollRounds: 240,
                    read: async (target, context) => {
                        if (context.signal?.aborted || disposedRef.current) throw new DOMException("Aborted", "AbortError");
                        let synced: Shot | undefined;
                        try {
                            synced = await syncShot(target.shotId, true, context.signal);
                        } catch (error) {
                            if (context.signal?.aborted || disposedRef.current) throw error;
                            // A temporary sync/read failure should not make the
                            // whole batch appear failed. Keep this child
                            // pending and let the next round retry it.
                            return {
                                ...target,
                                status: "running",
                                executionPhase: "polling",
                                error: error instanceof Error ? error.message : "任务状态同步失败",
                            };
                        }
                        if (context.signal?.aborted || disposedRef.current) throw new DOMException("Aborted", "AbortError");
                        const latestProject = latestProjectRef.current;
                        const latestShot = latestProject.shots.find((shot) => shot.id === target.shotId && shot.episodeId === currentEpisode.id);
                        const syncedRecord = synced && typeof synced === "object" ? (synced as unknown as Record<string, unknown>) : undefined;
                        const syncedEpisodeId = typeof syncedRecord?.episodeId === "string" ? syncedRecord.episodeId : typeof syncedRecord?.episode_id === "string" ? syncedRecord.episode_id : undefined;
                        const syncedScopeMismatch = Boolean(syncedEpisodeId && syncedEpisodeId !== currentEpisode.id);
                        const syncedShot = synced ? normalizeShot(synced as unknown, currentEpisode.id, Math.max(0, (latestShot?.shotNumber || 1) - 1)) : undefined;
                        // If a user or another recovery pass replaced the task
                        // while this batch was polling, prefer the latest
                        // project binding so the helper records a mismatch
                        // instead of attaching the old result to the shot.
                        const latestReplacedTask = Boolean(latestShot?.generationTaskId && latestShot.generationTaskId !== target.taskId);
                        const observed = latestReplacedTask ? latestShot : syncedShot || latestShot;
                        const observedShotId = syncedScopeMismatch ? "" : observed?.id || target.shotId;
                        const observedTaskId = observed ? observed.generationTaskId || "" : target.taskId;
                        const executionPhase =
                            observed?.generationExecutionPhase ||
                            (observed?.generationNeedsReview ? "needs_review" : observed?.generationStatus === "success" || observed?.generationStatus === "error" || observed?.generationStatus === "cancelled" ? "completed" : "polling");
                        return {
                            shotId: observedShotId,
                            taskId: observedTaskId,
                            status: observed?.generationStatus || "running",
                            executionPhase,
                            needsReview: observed?.generationNeedsReview,
                            videoUrl: observed?.videoUrl,
                            error: observed?.generationError,
                        };
                    },
                    onProgress: (progress) => {
                        if (disposedRef.current || abortController.signal.aborted) return;
                        messageApi.loading({ content: `视频批量处理中：${progress.terminalCount}/${progress.totalCount} 已结束`, key: "drama-video-batch", duration: 0 });
                    },
                });
                const detail = [`成功 ${summary.successCount}`, `失败 ${summary.failedCount}`, `待检查 ${summary.needsReviewCount}`, `取消 ${summary.cancelledCount}`].join("，");
                messageApi[summary.allSucceeded ? "success" : "warning"]({ content: `视频批量任务已结束：${detail}`, key: "drama-video-batch", duration: 6 });
            }
        } catch (error) {
            if (!disposedRef.current && error instanceof DramaLabVideoBatchWaitError && error.reason === "aborted") {
                messageApi.info({ content: "批量任务已停止，已经提交的任务仍会继续同步。", key: "drama-video-batch", duration: 5 });
            } else if (!disposedRef.current && error instanceof DramaLabVideoBatchWaitError && error.reason !== "aborted") {
                messageApi.warning({ content: `视频批量仍有 ${error.progress.pendingCount} 个任务未结束，已保留任务状态，可稍后继续同步。`, key: "drama-video-batch", duration: 8 });
            } else if (!disposedRef.current && !(error instanceof DOMException && error.name === "AbortError")) {
                messageApi.error({ content: error instanceof Error ? error.message : "批量视频任务等待失败", key: "drama-video-batch", duration: 8 });
            }
        } finally {
            if (batchAbortRef.current === abortController) {
                batchAbortRef.current = null;
                batchRunningRef.current = "";
                if (!disposedRef.current) setBatchRunning("");
            }
            if (abortController.signal.aborted || disposedRef.current) messageApi.destroy("drama-video-batch");
        }
    };

    const exportStoryboard = async (kind: "xlsx" | "srt") => {
        if (!episode) return;
        try {
            const { buildStoryboardNarrationSrt, buildStoryboardXlsx, storyboardExportFilename } = await import("@/lib/drama-lab-storyboard-export");
            const input = { projectTitle: project.title, episode: { id: episode?.id || "", number: episode?.number }, shots: episodeShots, scenes: project.scenes, characters: project.characters, props: project.props };
            if (kind === "srt") {
                const blob = new Blob([buildStoryboardNarrationSrt(input)], { type: "text/plain;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = storyboardExportFilename(input, "srt");
                a.click();
                URL.revokeObjectURL(a.href);
            } else {
                const bytes = await buildStoryboardXlsx(input);
                const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = storyboardExportFilename(input, "xlsx");
                a.click();
                URL.revokeObjectURL(a.href);
            }
            messageApi.success(kind === "srt" ? "解说 SRT 已导出" : "分镜表 Excel 已导出");
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "导出失败");
        }
    };

    const startFrame = async (shot: Shot, frameType: "first" | "key" | "last") => {
        if (!episode) return;
        const missing = missingShotAssetLabels(project, shot);
        if (missing.length) {
            Modal.warning({
                title: `无法生成${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧`,
                content: `当前镜头绑定的资产缺少参考图：${missing.join("、")}。请先到“资产准备”中生成或添加参考图。`,
                okText: "知道了",
            });
            return;
        }
        const actionKey = `frame:${frameType}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: `正在规划并创建${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧任务...`, key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/generate-frame?episodeId=${encodeURIComponent(episode.id)}&frameType=${frameType}`, {
                method: "POST",
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "帧任务创建失败");
            const taskId = typeof data.data?.task?.id === "string" ? data.data.task.id : "";
            if (!taskId) throw new Error("帧任务创建响应缺少任务 ID");
            if (controller.signal.aborted || isStale()) return;
            applyCreatedFrameTask(shot, frameType, taskId, typeof data.data?.prompt === "string" ? data.data.prompt : undefined, typeof data.data?.description === "string" ? data.data.description : undefined);
            await syncShot(shot.id, false, controller.signal).catch((error) => {
                if (controller.signal.aborted || isStale()) throw error;
                messageApi.warning({ content: error instanceof Error ? `${error.message}，任务已创建，可稍后同步。` : "任务已创建，可稍后同步。", key: `drama-lab-initial-sync:${shot.id}`, duration: 6 });
            });
            if (controller.signal.aborted || isStale()) return;
            messageApi.success({ content: `${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧任务已提交`, key: actionKey });
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "帧任务创建失败", key: actionKey });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const extractTailFrame = async (shot: Shot) => {
        if (!episode || !shot.generationTaskId) {
            messageApi.warning("请先完成当前分镜视频，再提取真实尾帧");
            return;
        }
        const actionKey = `tail-frame:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在从已完成视频提取尾帧...", key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/extract-tail-frame?episodeId=${encodeURIComponent(episode.id)}`, { method: "POST", signal: controller.signal });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.frame) throw new Error(data.msg || "视频尾帧提取失败");
            if (controller.signal.aborted || isStale()) return;
            onShotSynced(episode.id, shot.id, { id: shot.id, frames: { last: data.data.frame } });
            const next = data.data.nextShot;
            if (next?.id && next.candidate) {
                const nextShot = project.shots.find((item) => item.id === next.id && item.episodeId === episode.id);
                if (nextShot) onShotSynced(episode.id, next.id, { id: next.id, firstFrameCandidate: next.candidate });
                messageApi.success({ content: "尾帧已提取，下一镜出现待确认的首帧候选", key: actionKey, duration: 5 });
            } else {
                messageApi.success({ content: "尾帧已提取并保存", key: actionKey, duration: 4 });
            }
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "视频尾帧提取失败", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const acceptFirstFrameCandidate = async (shot: Shot, replaceExisting = false) => {
        const candidate = shot.firstFrameCandidate;
        if (!episode || !candidate) return;
        if (shot.frames?.first?.url && !replaceExisting) {
            Modal.confirm({
                title: "当前分镜已有首帧",
                content: "应用候选会保留当前首帧到历史记录并替换它，是否继续？",
                okText: "替换并锁定",
                cancelText: "保留当前首帧",
                onOk: () => acceptFirstFrameCandidate(shot, true),
            });
            return;
        }
        const actionKey = `candidate-accept:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在应用候选首帧...", key: actionKey, duration: 0 });
            const query = new URLSearchParams({ episodeId: episode.id, candidateId: candidate.id });
            if (replaceExisting) query.set("replaceExisting", "true");
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/accept-first-frame-candidate?${query.toString()}`, { method: "POST", signal: controller.signal });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.shot) throw new Error(data.msg || "候选首帧应用失败");
            if (controller.signal.aborted || isStale()) return;
            onShotSynced(episode.id, shot.id, { ...data.data.shot, firstFrameCandidate: data.data.candidate ?? null });
            messageApi.success({ content: "候选首帧已应用并锁定", key: actionKey, duration: 4 });
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "候选首帧应用失败", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const toggleFrameLock = async (shot: Shot, frameType: "first" | "key" | "last") => {
        const frame = shot.frames?.[frameType];
        if (!episode || !frame?.url) return;
        const actionKey = `frame-lock:${frameType}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/frames/${frameType}/lock?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locked: !frame.locked }),
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.frame) throw new Error(data.msg || "帧锁定状态保存失败");
            if (controller.signal.aborted || isStale()) return;
            onShotSynced(episode.id, shot.id, { id: shot.id, frames: { [frameType]: data.data.frame } });
            messageApi.success({ content: data.msg || (frame.locked ? "帧已解锁" : "帧已锁定"), key: actionKey, duration: 3 });
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "帧锁定状态保存失败", key: actionKey, duration: 5 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const uploadFrame = async (shot: Shot, frameType: "first" | "key" | "last", file: File) => {
        if (!episode) return;
        const actionKey = `frame-upload:${frameType}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            const formData = new FormData();
            formData.set("file", file);
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/frames/upload?episodeId=${encodeURIComponent(episode.id)}&frameType=${frameType}`, {
                method: "POST",
                body: formData,
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.frame) throw new Error(data.msg || "帧图片上传失败");
            if (controller.signal.aborted || isStale()) return;
            onShotSynced(episode.id, shot.id, { id: shot.id, frames: { [frameType]: data.data.frame } });
            messageApi.success({ content: `${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧图片已上传`, key: actionKey, duration: 3 });
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "帧图片上传失败", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    const uploadVideo = async (shot: Shot, file: File) => {
        if (!episode) return;
        const actionKey = `video-upload:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        const operationEpisodeId = episode.id;
        const operationProjectId = project.id;
        const controller = new AbortController();
        const isStale = () => disposedRef.current || currentEpisodeIdRef.current !== operationEpisodeId || latestProjectRef.current.id !== operationProjectId;
        operationAbortRef.current.set(actionKey, controller);
        try {
            setActionBusy(actionKey, true);
            const formData = new FormData();
            formData.set("file", file);
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/video/upload?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
                body: formData,
                signal: controller.signal,
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.shot) throw new Error(data.msg || "分镜视频上传失败");
            if (controller.signal.aborted || isStale()) return;
            onShotSynced(episode.id, shot.id, data.data.shot);
            messageApi.success({ content: "分镜视频已上传", key: actionKey, duration: 3 });
        } catch (error) {
            if (!controller.signal.aborted && !isStale()) messageApi.error({ content: error instanceof Error ? error.message : "分镜视频上传失败", key: actionKey, duration: 6 });
        } finally {
            if (operationAbortRef.current.get(actionKey) === controller) operationAbortRef.current.delete(actionKey);
            if (!disposedRef.current) setActionBusy(actionKey, false);
            else startingKeysRef.current.delete(actionKey);
            if (controller.signal.aborted || isStale()) messageApi.destroy(actionKey);
        }
    };

    if (!episode) {
        return <div className="text-center text-muted-foreground">请先选择一个剧集</div>;
    }

    return (
        <div className="mx-auto max-w-[1440px]" aria-label="分镜工作台模块">
            <section className="mb-5 space-y-4 rounded-xl border border-border bg-card p-4">
                <h2 className="text-lg font-semibold">
                    分镜生成 <span className="text-sm font-normal text-muted-foreground">根据剧本、角色、场景生成分镜头脚本</span>
                </h2>
                <DramaLabStoryboardConstraints
                    value={constraintDraft}
                    disabled={extracting}
                    onChange={(value) => setConstraintDrafts((current) => ({ ...current, [episode.id]: value }))}
                    storyboardFrameMode={storyboardFrameMode}
                    onStoryboardFrameModeChange={(value) => void updateStoryboardFrameMode(value)}
                    onExportXlsx={() => void exportStoryboard("xlsx")}
                    onExportSrt={() => void exportStoryboard("srt")}
                />
                <div className="flex flex-wrap items-center justify-between gap-3" aria-label="分镜操作">
                    <div className="flex flex-wrap gap-2">
                        <Button type="primary" icon={<Sparkles className="size-4" />} loading={extracting} onClick={handleExtract}>
                            {episodeShots.length ? "重新生成分镜" : "AI 生成分镜"}
                        </Button>
                        <Button icon={<Plus className="size-4" />} onClick={handleAdd}>
                            添加一个分镜
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button loading={batchRunning === "image"} disabled={Boolean(batchRunning)} icon={<Sparkles className="size-4" />} onClick={() => void runBatch("image")}>
                            批量生成分镜图
                        </Button>
                        <Button loading={batchRunning === "video"} disabled={Boolean(batchRunning)} icon={<Film className="size-4" />} onClick={() => void runBatch("video")}>
                            批量生成分镜视频
                        </Button>
                        {batchRunning === "image" || batchRunning === "video" ? (
                            <Button danger aria-label="取消批量任务" onClick={() => batchAbortRef.current?.abort()}>
                                {batchRunning === "image" ? "停止图片" : "停止视频"}
                            </Button>
                        ) : null}
                    </div>
                </div>
            </section>

            <div className="space-y-4">
                {groupStoryboardShots(episodeShots).map((group) => (
                    <section key={group.id} aria-label={group.label}>
                        <DramaLabSegmentHeader group={group} />
                        <div id={`segment-${group.id}`} className="space-y-4 pt-3">
                            {group.shots.map((shot) => (
                                <StoryboardWorkbenchCard
                                    key={shot.id}
                                    shot={shot}
                                    project={project}
                                    storyboardFrameMode={storyboardFrameMode}
                                    busyKeys={startingKeys}
                                    collapsed={Boolean(collapsedShots[shot.id])}
                                    onToggleCollapse={() => setCollapsedShots((current) => ({ ...current, [shot.id]: !current[shot.id] }))}
                                    onStartGeneration={startGeneration}
                                    onCheckVideoStatus={checkVideoStatus}
                                    onStartFrame={startFrame}
                                    onExtractTailFrame={extractTailFrame}
                                    onAcceptFirstFrameCandidate={acceptFirstFrameCandidate}
                                    onKeepFirstFrameCandidate={() => messageApi.info("候选首帧已保留，未覆盖当前首帧")}
                                    onToggleFrameLock={toggleFrameLock}
                                    onUploadFrame={uploadFrame}
                                    onUploadVideo={uploadVideo}
                                    onStartAudio={startAudioGeneration}
                                    onSyncAudio={syncAudioManually}
                                    onRecoverAudio={recoverAudioManually}
                                    onPreviewAudioSplit={previewAudioSplit}
                                    onApplyAudioSplit={applyAudioSplit}
                                    audioSplitPlan={audioSplitPlans[shot.id]}
                                    onUpdate={(patch) => void updateShot(shot.id, patch).catch((error) => messageApi.error(error instanceof Error ? error.message : "保存分镜失败"))}
                                    onEdit={() => handleEdit(shot)}
                                    onDelete={() => handleDelete(shot.id)}
                                    onInsertBefore={() => {
                                        handleAdd();
                                        form.setFieldsValue({ shotNumber: shot.shotNumber, segmentIndex: shot.segmentIndex, segmentTitle: shot.segmentTitle });
                                    }}
                                />
                            ))}
                        </div>
                    </section>
                ))}

                {episodeShots.length === 0 && <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">暂无分镜，点击“从剧本提取分镜”开始拆解，也可手工添加</div>}
            </div>

            <Modal title={editingShot ? "分镜配置" : "添加分镜"} open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)} width={800}>
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

                    <Form.Item label="分镜标题" name="title" rules={[{ required: true }]}>
                        <Input placeholder="例如：雨夜来电" />
                    </Form.Item>

                    <Form.Item label="分镜描述" name="description" rules={[{ required: true }]}>
                        <TextArea rows={4} placeholder="描述这一镜要表现的内容、台词、动作等" />
                    </Form.Item>

                    <Form.Item label="对白" name="dialogue">
                        <TextArea rows={2} placeholder="可选" />
                    </Form.Item>

                    <Form.Item label="解说旁白" name="narration">
                        <TextArea rows={2} placeholder="可选" />
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

                    <Form.Item label="视频提示词" name="videoPrompt">
                        <TextArea rows={3} placeholder="用于 AI 生成视频的动态提示词（可选）" />
                    </Form.Item>
                    <div className="grid gap-x-4 sm:grid-cols-2" aria-label="分镜摄影与段落配置">
                        {(
                            [
                                ["segmentTitle", "幕 / 段落标题"],
                                ["location", "场景地点"],
                                ["time", "场景时间"],
                                ["shotType", "景别"],
                                ["cameraMotion", "运镜方式"],
                                ["atmosphere", "氛围 / 情绪"],
                                ["lightingStyle", "灯光"],
                                ["depthOfField", "景深"],
                                ["angleH", "镜头视角 · 水平方向"],
                                ["angleV", "俯仰角度"],
                                ["angleS", "画面景别"],
                            ] as const
                        ).map(([name, label]) => (
                            <Form.Item key={name} name={name} label={label}>
                                <Input />
                            </Form.Item>
                        ))}
                        <Form.Item
                            name="segmentIndex"
                            label="幕索引（从 0 开始）"
                            rules={[{ validator: (_, value) => (value === undefined || value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0) ? Promise.resolve() : Promise.reject(new Error("幕索引必须为非负整数"))) }]}
                        >
                            <Input type="number" step="1" />
                        </Form.Item>
                    </div>
                    {(
                        [
                            ["layoutDescription", "空间布局锚点（首尾帧人物站位合同）"],
                            ["action", "动作"],
                            ["result", "画面结果"],
                            ["startFramePrompt", "起始状态 / 首帧提示词"],
                            ["endFramePrompt", "结束状态 / 尾帧提示词"],
                            ["universalSegmentText", "全能片段提示词"],
                        ] as const
                    ).map(([name, label]) => (
                        <Form.Item key={name} name={name} label={label}>
                            <TextArea rows={3} />
                        </Form.Item>
                    ))}
                </Form>
            </Modal>
        </div>
    );
}

function StoryboardWorkbenchCard({
    shot,
    project,
    storyboardFrameMode = "single",
    busyKeys,
    onStartGeneration,
    onStartAudio,
    onSyncAudio,
    onRecoverAudio,
    onPreviewAudioSplit,
    onApplyAudioSplit,
    audioSplitPlan,
    onCheckVideoStatus,
    onUpdate,
    onEdit,
    onDelete,
    onInsertBefore,
    collapsed,
    onToggleCollapse,
    onStartFrame,
    onExtractTailFrame,
    onAcceptFirstFrameCandidate,
    onKeepFirstFrameCandidate,
    onToggleFrameLock,
    onUploadFrame,
    onUploadVideo,
}: {
    shot: Shot;
    project: Project;
    storyboardFrameMode?: "single" | "first_last";
    busyKeys: ReadonlySet<string>;
    onStartGeneration: (shot: Shot, kind: "image" | "video") => Promise<string | undefined>;
    onStartAudio: (shot: Shot, kind: "dialogue" | "narration") => Promise<void>;
    onSyncAudio: (shot: Shot, kind: "dialogue" | "narration") => Promise<void>;
    onRecoverAudio: (shot: Shot, kind: "dialogue" | "narration") => Promise<void>;
    onPreviewAudioSplit: (shot: Shot) => Promise<void>;
    onApplyAudioSplit: (shot: Shot) => Promise<void>;
    audioSplitPlan?: DramaLabAudioSplitPlan;
    onCheckVideoStatus: (shot: Shot) => Promise<void>;
    onStartFrame: (shot: Shot, frameType: "first" | "key" | "last") => Promise<void>;
    onExtractTailFrame: (shot: Shot) => Promise<void>;
    onAcceptFirstFrameCandidate: (shot: Shot, replaceExisting?: boolean) => Promise<void>;
    onKeepFirstFrameCandidate: (shot: Shot) => void;
    onToggleFrameLock: (shot: Shot, frameType: "first" | "key" | "last") => Promise<void>;
    onUploadFrame: (shot: Shot, frameType: "first" | "key" | "last", file: File) => Promise<void>;
    onUploadVideo: (shot: Shot, file: File) => Promise<void>;
    onUpdate: (patch: Partial<Shot>) => void;
    onEdit: () => void;
    onDelete: () => void;
    onInsertBefore: () => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
}) {
    const imageBusy = busyKeys.has(`image:${shot.id}`) || isDramaLabTaskActive(shot.storyboardStatus);
    const videoBusy = busyKeys.has(`video:${shot.id}`) || isDramaLabVideoTaskActive(shot);
    const checkingVideoStatus = busyKeys.has(`video-status:${shot.id}`);
    const videoNeedsCheck = requiresDramaLabVideoTaskCheck(shot);
    const dialogueAudio = audioStateForKind(shot, "dialogue");
    const narrationAudio = audioStateForKind(shot, "narration");
    const dialogueAudioBusy = busyKeys.has(`audio:dialogue:${shot.id}`) || isDramaLabTaskActive(dialogueAudio?.status);
    const narrationAudioBusy = busyKeys.has(`audio:narration:${shot.id}`) || isDramaLabTaskActive(narrationAudio?.status);
    const splitPreviewBusy = busyKeys.has(`audio-split-preview:${shot.id}`);
    const splitApplyBusy = busyKeys.has(`audio-split-apply:${shot.id}`);
    const splitEligible = Boolean(audioTextForKind(shot, "dialogue") || audioTextForKind(shot, "narration"));
    const legacyAudioReviewReason = ambiguousLegacyAudioReviewReason(shot);
    const isUniversal = shot.creationMode === "universal";
    const isFirstLast = !isUniversal && storyboardFrameMode === "first_last";
    const isClassic = !isUniversal && !isFirstLast;
    const classicImageUrl = shot.frames?.key?.url || shot.storyboardImageUrl;
    const [promptWrap, setPromptWrap] = useState(true);
    const [promptEditorOpen, setPromptEditorOpen] = useState(false);
    const [audioEditorOpen, setAudioEditorOpen] = useState(false);
    const [promptDraft, setPromptDraft] = useState({ imagePrompt: "", polishedPrompt: "", firstPrompt: "", lastPrompt: "", videoPrompt: "", universalPrompt: "" });
    const [universalPromptAction, setUniversalPromptAction] = useState<"generate" | "generate-force" | "polish" | "polish-force" | null>(null);
    const [promptFieldAction, setPromptFieldAction] = useState<"classic" | "first" | "last" | null>(null);
    const [universalPromptError, setUniversalPromptError] = useState<string | null>(null);
    const uploadInputRefs = useRef<Partial<Record<"first" | "key" | "last", HTMLInputElement | null>>>({});
    const videoUploadInputRef = useRef<HTMLInputElement>(null);
    const frameLabel: Record<"first" | "key" | "last", string> = { first: "首帧", key: "关键帧", last: "尾帧" };
    const openPromptEditor = () => {
        setPromptDraft({
            imagePrompt: shot.imagePrompt || "",
            polishedPrompt: shot.polishedPrompt || "",
            firstPrompt: shot.frames?.first?.prompt || shot.startFramePrompt || "",
            lastPrompt: shot.frames?.last?.prompt || shot.endFramePrompt || "",
            videoPrompt: shot.videoPrompt || "",
            universalPrompt: shot.universalSegmentText || "",
        });
        setPromptEditorOpen(true);
    };
    const savePromptEditor = () => {
        const patch: Partial<Shot> = { imagePrompt: promptDraft.imagePrompt.trim(), videoPrompt: promptDraft.videoPrompt.trim() };
        if (isClassic) patch.polishedPrompt = promptDraft.polishedPrompt.trim();
        if (isFirstLast) {
            patch.startFramePrompt = promptDraft.firstPrompt.trim();
            patch.endFramePrompt = promptDraft.lastPrompt.trim();
            patch.frames = {
                ...shot.frames,
                first: { ...(shot.frames?.first || { prompt: "" }), prompt: promptDraft.firstPrompt.trim() },
                last: { ...(shot.frames?.last || { prompt: "" }), prompt: promptDraft.lastPrompt.trim() },
            };
        }
        if (isUniversal) patch.universalSegmentText = promptDraft.universalPrompt.trim();
        onUpdate(patch);
        setPromptEditorOpen(false);
    };
    const universalReferences = [
        shot.sceneId ? project.scenes.find((asset) => asset.id === shot.sceneId) : undefined,
        ...shot.characterIds.map((id) => project.characters.find((asset) => asset.id === id)),
        ...shot.propIds.map((id) => project.props.find((asset) => asset.id === id)),
    ].flatMap((asset) => {
        if (!asset) return [];
        const url = asset.referenceImageUrl || asset.imageUrl || asset.references?.find((reference) => reference.id === asset.primaryReferenceId)?.url || asset.references?.find((reference) => reference.url.trim())?.url;
        return url ? [{ label: "name" in asset ? asset.name : asset.location, url }] : [];
    });
    const handleUniversalPromptAction = async (action: "generate" | "generate-force" | "polish" | "polish-force") => {
        if (universalPromptAction) return;
        const currentPrompt = shot.universalSegmentText?.trim() || "";
        if (action.startsWith("polish") && !currentPrompt) {
            setUniversalPromptError("请先填写全能片段描述，再进行润色");
            return;
        }
        const references = universalReferences.map((reference, index) => `@图片${index + 1}：${reference.label}`).join("；");
        const force = action.endsWith("force");
        if (!force && !universalReferences.length) {
            setUniversalPromptError("请至少为场景、角色或道具准备一张主参考图；也可选择无参考图生成/润色");
            return;
        }
        const source = action.startsWith("polish") ? currentPrompt : [shot.description?.trim(), references ? `参考图引用：${references}` : ""].filter(Boolean).join("\n");
        if (!source.trim()) {
            setUniversalPromptError("请先填写分镜描述或绑定资产，再生成全能提示词");
            return;
        }
        setUniversalPromptError(null);
        setUniversalPromptAction(action);
        try {
            const optimizedPrompt = await optimizePrompt({ requestId: `drama-lab-universal-${shot.id}-${Date.now()}`, prompt: source, mode: "video" });
            onUpdate({ universalSegmentText: optimizedPrompt });
            setPromptDraft((current) => ({ ...current, universalPrompt: optimizedPrompt }));
            message.success(action.startsWith("generate") ? (force ? "全能提示词已无参考图生成" : "全能提示词已生成") : force ? "全能提示词已无参考图润色" : "全能提示词已润色");
        } catch (error) {
            setUniversalPromptError(error instanceof Error ? error.message : "全能提示词处理失败，请稍后重试");
        } finally {
            setUniversalPromptAction(null);
        }
    };
    const regeneratePromptField = async (target: "classic" | "first" | "last") => {
        if (promptFieldAction) return;
        setPromptFieldAction(target);
        try {
            const assetNames = universalReferences.map((item) => item.label).join("、");
            const contract =
                target === "classic"
                    ? "请输出经典单张分镜图最终提示词，严格依次包含【主体与动作】【场景与空间】【景别/机位/构图】【光线与色调】【角色白名单】【一致性与禁止项】，不得输出内部资产ID。"
                    : target === "first"
                      ? "请输出首帧最终图片提示词：固定空间布局、人物初始站位、景别、轴线和动作起点；不得写运动过程。"
                      : "请输出尾帧最终图片提示词：继承首帧空间、轴线、人物位置，仅演化动作结束状态；不得引入新人物。";
            const base = [
                contract,
                `项目风格：${project.style || "未设置"}`,
                `画幅：${project.aspectRatio}`,
                `镜头：${shot.description || shot.sourceText}`,
                shot.layoutDescription ? `空间布局锚点：${shot.layoutDescription}` : "",
                assetNames ? `资产白名单：${assetNames}` : "",
                target === "last" && promptDraft.firstPrompt ? `首帧提示词：${promptDraft.firstPrompt}` : "",
            ]
                .filter(Boolean)
                .join("\n");
            const value = await optimizePrompt({ requestId: `drama-lab-shot-prompt-${target}-${shot.id}-${Date.now()}`, prompt: base, mode: "image" });
            setPromptDraft((current) => ({ ...current, [target === "classic" ? "polishedPrompt" : target === "first" ? "firstPrompt" : "lastPrompt"]: value }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提示词重新生成失败");
        } finally {
            setPromptFieldAction(null);
        }
    };
    const openPromptFromCardBlank = (event: React.MouseEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button,a,input,textarea,select,[role='button'],[role='combobox'],[data-no-prompt-editor='true']")) return;
        openPromptEditor();
    };
    return (
        <article id={`storyboard-shot-${shot.id}`} aria-label="分镜卡片空白区域" className="group/storyboard @container/storyboard relative min-w-0 overflow-hidden rounded-lg border border-border bg-card" onClick={openPromptFromCardBlank}>
            <header className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                            分镜 {shot.shotNumber} · {shot.title}
                        </h3>
                        <StoryboardTaskTag status={shot.storyboardStatus} label="分镜图" />
                        <StoryboardTaskTag status={shot.generationStatus} executionPhase={shot.generationExecutionPhase} label="视频" needsReview={videoNeedsCheck} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {shot.duration}s{shot.cameraAngle ? ` · ${shot.cameraAngle}` : ""}
                        {shot.cameraMotion ? ` · ${shot.cameraMotion}` : ""}
                    </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
                    <Button size="small" title="画布定位" aria-label="画布定位" href={dramaLabEpisodeCanvasHref(project.id, shot.episodeId, shot.id)} icon={<PanelsTopLeft className="size-4" />}>
                        画布定位
                    </Button>
                    <Button type="text" size="small" title="编辑分镜" aria-label="编辑分镜" icon={<Edit2 className="size-4" />} onClick={onEdit}>
                        分镜配置
                    </Button>
                    <Button size="small" onClick={() => onUpdate({ creationMode: shot.creationMode === "universal" ? "classic" : "universal" })}>
                        {shot.creationMode === "universal" ? "经典分镜" : "全能模式"}
                    </Button>
                    <Button size="small" onClick={onInsertBefore}>
                        ＋ 新增
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        aria-label={`${collapsed ? "展开分镜" : "收起分镜"} ${shot.shotNumber}`}
                        aria-expanded={!collapsed}
                        aria-controls={`storyboard-content-${shot.id}`}
                        onClick={onToggleCollapse}
                        icon={collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                    >
                        {collapsed ? "展开" : "收起"}
                    </Button>
                    <Button type="text" danger size="small" className="opacity-0 transition-opacity group-hover/storyboard:opacity-100" title="删除分镜" aria-label="删除分镜" icon={<Trash2 className="size-4" />} onClick={onDelete} />
                </div>
            </header>
            <div
                id={`storyboard-content-${shot.id}`}
                hidden={collapsed}
                style={collapsed ? { display: "none" } : undefined}
                className="grid min-w-0 divide-y divide-border @min-[60rem]/storyboard:grid-cols-[280px_minmax(0,1fr)_minmax(300px,0.9fr)] @min-[60rem]/storyboard:divide-x @min-[60rem]/storyboard:divide-y-0"
            >
                <section className="min-w-0 space-y-4 p-4" aria-label={`分镜 ${shot.shotNumber} 资产关联`}>
                    <DramaLabShotAssetPicker label="场景" assets={project.scenes} selectedIds={shot.sceneId ? [shot.sceneId] : []} single onChange={(ids) => onUpdate({ sceneId: ids[0] })} />
                    <DramaLabShotAssetPicker label="角色" assets={project.characters} selectedIds={shot.characterIds} onChange={(characterIds) => onUpdate({ characterIds })} />
                    <DramaLabShotAssetPicker label="道具" assets={project.props} selectedIds={shot.propIds} onChange={(propIds) => onUpdate({ propIds })} />
                </section>
                <section className="min-w-0 space-y-3 p-4" aria-label={`分镜 ${shot.shotNumber} 画面`}>
                    <h4 className="text-sm font-medium">{isFirstLast ? "首尾帧参考图" : isUniversal ? "全能片段与参考图" : "分镜图"}</h4>
                    {!isUniversal ? (
                        <div data-storyboard-media="image" className="grid h-56 min-h-0 min-w-0 overflow-hidden rounded border border-border bg-muted/30">
                            {isFirstLast ? (
                                <div className="grid min-h-0 grid-cols-2 divide-x divide-border">
                                    {(["first", "last"] as const).map((frameType) => (
                                        <div key={frameType} className="flex min-h-0 min-w-0 flex-col p-2">
                                            <span className="mb-1 text-xs text-muted-foreground">{frameLabel[frameType]}</span>
                                            {shot.frames?.[frameType]?.url ? (
                                                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                                                    <Image
                                                        preview={{ src: shot.frames[frameType]?.url }}
                                                        src={shot.frames[frameType]?.url}
                                                        alt={frameLabel[frameType]}
                                                        className="!block !size-full !object-contain"
                                                        classNames={{ root: "absolute inset-0 block size-full overflow-hidden", image: "!block !size-full !object-contain" }}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="grid flex-1 place-items-center text-xs text-muted-foreground">待生成 / 上传</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : classicImageUrl ? (
                                <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
                                    <Image
                                        preview={{ src: classicImageUrl }}
                                        src={classicImageUrl}
                                        alt={`分镜 ${shot.shotNumber} 图像`}
                                        className="!block !size-full !object-contain"
                                        classNames={{ root: "absolute inset-0 block size-full overflow-hidden", image: "!block !size-full !object-contain" }}
                                    />
                                </div>
                            ) : (
                                <div className="grid place-items-center text-sm text-muted-foreground">尚未生成分镜图</div>
                            )}
                        </div>
                    ) : null}
                    {isUniversal ? (
                        <div data-universal-workspace="true" className="h-80 space-y-3 overflow-y-auto rounded border border-primary/20 bg-primary/5 p-3" aria-label="全能模式片段与参考图">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">片段描述</span>
                                <span className="text-xs text-muted-foreground">视频优先使用此字段</span>
                            </div>
                            <PromptTextToolbar value={shot.universalSegmentText || ""} wrap={promptWrap} onWrapChange={setPromptWrap} />
                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="small" icon={<Sparkles className="size-3.5" />} loading={universalPromptAction === "generate"} disabled={Boolean(universalPromptAction)} onClick={() => void handleUniversalPromptAction("generate")}>
                                    生成全能提示词
                                </Button>
                                <Button size="small" loading={universalPromptAction === "generate-force"} disabled={Boolean(universalPromptAction)} onClick={() => void handleUniversalPromptAction("generate-force")}>
                                    无参考图生成
                                </Button>
                                <Button
                                    size="small"
                                    icon={<Sparkles className="size-3.5" />}
                                    loading={universalPromptAction === "polish"}
                                    disabled={Boolean(universalPromptAction) || !shot.universalSegmentText?.trim()}
                                    onClick={() => void handleUniversalPromptAction("polish")}
                                >
                                    润色全能提示词
                                </Button>
                                <Button size="small" loading={universalPromptAction === "polish-force"} disabled={Boolean(universalPromptAction) || !shot.universalSegmentText?.trim()} onClick={() => void handleUniversalPromptAction("polish-force")}>
                                    无参考图润色
                                </Button>
                            </div>
                            {universalPromptError ? <Alert type="error" showIcon message={universalPromptError} /> : null}
                            <TextArea
                                defaultValue={shot.universalSegmentText}
                                autoSize={{ minRows: 5, maxRows: 12 }}
                                wrap={promptWrap ? "soft" : "off"}
                                placeholder="按时间线描述连续子分镜，并使用 @图片1、@图片2 引用参考图"
                                aria-label="全能模式片段描述"
                                onBlur={(event) => onUpdate({ universalSegmentText: event.target.value.trim() })}
                            />
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">参考图顺序（场景 → 角色 → 道具）</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {universalReferences.map((reference, index) => (
                                        <div key={`${reference.label}-${index}`} className="flex items-center gap-2 rounded border border-border bg-background p-2">
                                            <img src={reference.url} alt={reference.label} className="size-10 rounded object-cover" />
                                            <span className="min-w-0 truncate text-xs">
                                                @图片{index + 1} · {reference.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {!universalReferences.length ? <div className="text-xs text-muted-foreground">请先在左栏绑定带参考图的场景、角色或道具</div> : null}
                            </div>
                        </div>
                    ) : null}

                    {shot.storyboardError ? <Alert type="error" showIcon message={shot.storyboardError} /> : null}
                    <div className="flex flex-wrap items-center gap-2" aria-label="分镜图生成上传">
                        {isFirstLast
                            ? (["first", "last"] as const).map((frameType) => {
                                  const frame = shot.frames?.[frameType];
                                  const busy = busyKeys.has(`frame:${frameType}:${shot.id}`) || isDramaLabTaskActive(frame?.status);
                                  return (
                                      <Button key={frameType} loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void onStartFrame(shot, frameType)}>
                                          {frame?.url ? `重生成${frameLabel[frameType]}` : `生成${frameLabel[frameType]}`}
                                      </Button>
                                  );
                              })
                            : null}
                        {isFirstLast
                            ? (["first", "last"] as const).map((frameType) => {
                                  const frame = shot.frames?.[frameType];
                                  return (
                                      <span key={`frame-tools-${frameType}`} className="contents">
                                          <input
                                              ref={(node) => {
                                                  uploadInputRefs.current[frameType] = node;
                                              }}
                                              type="file"
                                              accept="image/png,image/jpeg,image/webp,image/gif"
                                              className="hidden"
                                              onChange={(event) => {
                                                  const file = event.target.files?.[0];
                                                  event.target.value = "";
                                                  if (file) void onUploadFrame(shot, frameType, file);
                                              }}
                                          />
                                          <Button
                                              size="small"
                                              title={`上传${frameLabel[frameType]}`}
                                              aria-label={`上传${frameLabel[frameType]}`}
                                              loading={busyKeys.has(`frame-upload:${frameType}:${shot.id}`)}
                                              icon={<Upload className="size-3.5" />}
                                              disabled={Boolean(frame?.locked) || isDramaLabTaskActive(frame?.status)}
                                              onClick={() => uploadInputRefs.current[frameType]?.click()}
                                          >
                                              上传{frameLabel[frameType]}
                                          </Button>
                                          {frame?.url ? (
                                              <Button
                                                  size="small"
                                                  title={frame.locked ? `解锁${frameLabel[frameType]}` : `锁定${frameLabel[frameType]}`}
                                                  aria-label={frame.locked ? `解锁${frameLabel[frameType]}` : `锁定${frameLabel[frameType]}`}
                                                  loading={busyKeys.has(`frame-lock:${frameType}:${shot.id}`)}
                                                  icon={<LockKeyhole className={cn("size-3.5", frame.locked && "text-emerald-600")} />}
                                                  onClick={() => void onToggleFrameLock(shot, frameType)}
                                              />
                                          ) : null}
                                      </span>
                                  );
                              })
                            : null}
                        {shot.generationTaskId && shot.generationStatus === "success" ? (
                            <Button size="small" loading={busyKeys.has(`tail-frame:${shot.id}`)} icon={<Film className="size-3.5" />} onClick={() => void onExtractTailFrame(shot)}>
                                从视频提取尾帧
                            </Button>
                        ) : null}
                        {isClassic ? (
                            <Button type="primary" loading={imageBusy} icon={<Sparkles className="size-4" />} onClick={() => void onStartGeneration(shot, "image")}>
                                {classicImageUrl ? "重新生成分镜图" : "生成分镜图"}
                            </Button>
                        ) : null}
                        {isClassic ? (
                            <>
                                <input
                                    ref={(node) => {
                                        uploadInputRefs.current.key = node;
                                    }}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    aria-label="选择分镜图文件"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = "";
                                        if (file) void onUploadFrame(shot, "key", file);
                                    }}
                                />
                                <Button
                                    aria-label="上传分镜图"
                                    loading={busyKeys.has(`frame-upload:key:${shot.id}`)}
                                    disabled={imageBusy || Boolean(shot.frames?.key?.locked) || isDramaLabTaskActive(shot.frames?.key?.status)}
                                    icon={<Upload className="size-4" />}
                                    onClick={() => uploadInputRefs.current.key?.click()}
                                >
                                    上传分镜图
                                </Button>
                                {shot.frames?.key?.locked ? (
                                    <Button size="small" onClick={() => void onToggleFrameLock(shot, "key")}>
                                        解锁分镜图
                                    </Button>
                                ) : null}
                            </>
                        ) : null}
                        {isClassic ? (
                            <GenerationHistory
                                history={shot.storyboardHistory}
                                activeUrl={classicImageUrl}
                                type="image"
                                onRestore={(url) =>
                                    onUpdate({
                                        storyboardImageUrl: url,
                                        imageUrl: url,
                                        storyboardStatus: "success",
                                        storyboardError: undefined,
                                        frames: {
                                            ...shot.frames,
                                            key: { ...(shot.frames?.key || { prompt: "" }), url, status: "success", source: "restored", error: undefined },
                                        },
                                    })
                                }
                            />
                        ) : null}
                    </div>
                    <div aria-label="分镜图操作" className="flex h-10 items-center justify-end gap-2">
                        <Button icon={<Volume2 className="size-4" />} onClick={() => setAudioEditorOpen(true)}>
                            设置配音
                        </Button>
                    </div>
                    <div className={isFirstLast ? "grid grid-cols-2 gap-2" : "hidden"}>
                        {(["first", "last"] as const).map((frameType) => {
                            const frame = shot.frames?.[frameType];
                            return (
                                <div key={frameType} className="space-y-2 rounded border border-border bg-background p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs font-medium text-muted-foreground">{frameLabel[frameType]}</div>
                                        <span className="text-[11px] text-muted-foreground">{frame?.status === "success" ? "已完成" : frame?.status === "running" ? "生成中" : "待生成"}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {isFirstLast && shot.firstFrameCandidate ? (
                        <div className="space-y-2 border border-amber-300 bg-amber-50/60 p-3" role="status" aria-label="待确认的候选首帧">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-medium text-amber-900">上一镜尾帧候选</div>
                                <span className="text-[11px] text-amber-800">仅候选，尚未覆盖当前首帧</span>
                            </div>
                            <img src={shot.firstFrameCandidate.url} alt="候选首帧预览" className="aspect-video w-full rounded border border-amber-300 object-cover" />
                            <div className="flex flex-wrap gap-2">
                                <Button size="small" type="primary" loading={busyKeys.has(`candidate-accept:${shot.id}`)} onClick={() => void onAcceptFirstFrameCandidate(shot)}>
                                    应用为首帧
                                </Button>
                                <Button size="small" onClick={() => onKeepFirstFrameCandidate(shot)}>
                                    保留候选
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </section>
                <section className="min-w-0 space-y-3 p-4" aria-label={`分镜 ${shot.shotNumber} 视频`}>
                    <h4 className="text-sm font-medium">分镜视频</h4>
                    <div data-storyboard-media="video" className="grid h-80 min-w-0 rounded border border-border bg-muted/30">
                        {shot.videoUrl ? (
                            <video src={shot.videoUrl} controls className="h-full min-h-0 w-full object-contain" />
                        ) : (
                            <div className="grid place-items-center p-3 text-center text-sm text-muted-foreground">{isUniversal ? "绑定资产参考图并完善全能提示词后可生成视频" : "生成或上传分镜图后可生成视频"}</div>
                        )}
                    </div>

                    {videoNeedsCheck ? <Alert type="warning" showIcon message="视频结果待检查" description={dramaLabVideoTaskReviewDescription(shot)} /> : null}
                    {shot.generationError && !videoNeedsCheck ? <Alert type="error" showIcon message={shot.generationError} /> : null}
                    <div aria-label="分镜视频操作" className="flex h-10 flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {videoNeedsCheck ? (
                                <Button loading={checkingVideoStatus} disabled={checkingVideoStatus} icon={<LoaderCircle className="size-4" />} onClick={() => void onCheckVideoStatus(shot)}>
                                    检查状态
                                </Button>
                            ) : null}
                            <Button type="primary" loading={videoBusy} disabled={videoBusy || checkingVideoStatus || videoNeedsCheck} icon={<Film className="size-4" />} onClick={() => void onStartGeneration(shot, "video")}>
                                {videoNeedsCheck ? "请先检查状态" : shot.videoUrl ? "重新生成视频" : "生成分镜视频"}
                            </Button>
                            <input
                                ref={videoUploadInputRef}
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime"
                                className="hidden"
                                aria-label="选择分镜视频文件"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) void onUploadVideo(shot, file);
                                }}
                            />
                            <Button loading={busyKeys.has(`video-upload:${shot.id}`)} disabled={videoBusy || checkingVideoStatus || videoNeedsCheck} icon={<Upload className="size-4" />} onClick={() => videoUploadInputRef.current?.click()}>
                                上传分镜视频
                            </Button>
                            <GenerationHistory
                                history={shot.videoHistory}
                                activeUrl={shot.videoUrl}
                                type="video"
                                onRestore={(url) => onUpdate({ videoUrl: url, generationStatus: "success", generationNeedsReview: undefined, generationError: undefined })}
                            />
                        </div>
                        {splitEligible && !shot.audioSplitSourceShotId ? (
                            <Button size="small" icon={<Scissors className="size-3.5" />} loading={splitPreviewBusy} onClick={() => void onPreviewAudioSplit(shot)}>
                                按音频拆镜
                            </Button>
                        ) : null}
                    </div>
                </section>
            </div>
            <StoryboardPromptDialog
                open={promptEditorOpen}
                shot={shot}
                isClassic={isClassic}
                isFirstLast={isFirstLast}
                isUniversal={isUniversal}
                draft={promptDraft}
                onDraftChange={setPromptDraft}
                onUniversalAction={handleUniversalPromptAction}
                universalBusy={universalPromptAction}
                fieldBusy={promptFieldAction}
                onRegenerateField={regeneratePromptField}
                onCancel={() => setPromptEditorOpen(false)}
                onSave={savePromptEditor}
            />
            <Modal title={`分镜 ${shot.shotNumber} · 配音`} open={audioEditorOpen} footer={null} onCancel={() => setAudioEditorOpen(false)}>
                <div className="space-y-3">
                    {(["dialogue", "narration"] as const).map((kind) => {
                        const label = kind === "dialogue" ? "对白" : "旁白";
                        const text = audioTextForKind(shot, kind);
                        const state = audioStateForKind(shot, kind);
                        return (
                            <div key={kind} className="rounded border border-border p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <b>{label}</b>
                                        <p className="mt-1 text-xs text-muted-foreground">{text || `暂无${label}文本`}</p>
                                    </div>
                                    <Button icon={<Sparkles className="size-4" />} disabled={!text} loading={busyKeys.has(`audio:${kind}:${shot.id}`)} onClick={() => void onStartAudio(shot, kind)}>
                                        {state?.url ? `重新生成${label}` : `生成${label}`}
                                    </Button>
                                </div>
                                {state?.url ? <audio src={state.url} controls className="mt-2 w-full" /> : null}
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </article>
    );
}

type StoryboardPromptDraft = { imagePrompt: string; polishedPrompt: string; firstPrompt: string; lastPrompt: string; videoPrompt: string; universalPrompt: string };
function StoryboardPromptDialog({
    open,
    shot,
    isClassic,
    isFirstLast,
    isUniversal,
    draft,
    onDraftChange,
    onUniversalAction,
    universalBusy,
    fieldBusy,
    onRegenerateField,
    onCancel,
    onSave,
}: {
    open: boolean;
    shot: Shot;
    isClassic: boolean;
    isFirstLast: boolean;
    isUniversal: boolean;
    draft: StoryboardPromptDraft;
    onDraftChange: (value: StoryboardPromptDraft) => void;
    onUniversalAction: (action: "generate" | "generate-force" | "polish" | "polish-force") => void;
    universalBusy: "generate" | "generate-force" | "polish" | "polish-force" | null;
    fieldBusy: "classic" | "first" | "last" | null;
    onRegenerateField: (target: "classic" | "first" | "last") => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    const field = (key: keyof StoryboardPromptDraft, label: string, action?: ReactNode) => (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{label}</span>
                {action}
            </div>
            <TextArea value={draft[key]} autoSize={{ minRows: 4, maxRows: 10 }} onChange={(event) => onDraftChange({ ...draft, [key]: event.target.value })} />
        </div>
    );
    return (
        <Modal title={`分镜 ${shot.shotNumber} · 编辑提示词`} open={open} width={760} okText="保存" cancelText="取消" destroyOnHidden onOk={onSave} onCancel={onCancel}>
            <div className="space-y-5">
                <section className="space-y-3">
                    <h3 className="font-semibold">🖼 图片提示词</h3>
                    {field("imagePrompt", "原始提示词（分镜拆解时写入，仅供参考）")}
                    {isClassic
                        ? field(
                              "polishedPrompt",
                              "通用优化提示词（经典单图最终使用）",
                              <Button size="small" loading={fieldBusy === "classic"} onClick={() => onRegenerateField("classic")}>
                                  {draft.polishedPrompt.trim() ? "重新生成" : "立即生成"}
                              </Button>,
                          )
                        : null}
                    {isFirstLast ? (
                        <>
                            {field(
                                "firstPrompt",
                                "首帧最终提示词",
                                <Button size="small" loading={fieldBusy === "first"} onClick={() => onRegenerateField("first")}>
                                    重新生成首帧提示词
                                </Button>,
                            )}
                            {field(
                                "lastPrompt",
                                "尾帧最终提示词",
                                <Button size="small" loading={fieldBusy === "last"} onClick={() => onRegenerateField("last")}>
                                    重新生成尾帧提示词
                                </Button>,
                            )}
                        </>
                    ) : null}
                </section>
                <section className="space-y-3">
                    <h3 className="font-semibold">🎬 视频提示词</h3>
                    {field("videoPrompt", isUniversal ? "视频提示词（全能参考提示词为空时兜底）" : "视频提示词")}
                    {isUniversal
                        ? field(
                              "universalPrompt",
                              "全能参考提示词",
                              <span className="flex flex-wrap gap-1">
                                  <Button size="small" loading={universalBusy === "generate"} onClick={() => onUniversalAction("generate")}>
                                      生成
                                  </Button>
                                  <Button size="small" loading={universalBusy === "generate-force"} onClick={() => onUniversalAction("generate-force")}>
                                      无参考图生成
                                  </Button>
                                  <Button size="small" loading={universalBusy === "polish"} onClick={() => onUniversalAction("polish")}>
                                      润色
                                  </Button>
                                  <Button size="small" loading={universalBusy === "polish-force"} onClick={() => onUniversalAction("polish-force")}>
                                      无参考图润色
                                  </Button>
                              </span>,
                          )
                        : null}
                </section>
            </div>
        </Modal>
    );
}

function PromptTextToolbar({ value, wrap, onWrapChange }: { value: string; wrap: boolean; onWrapChange: (value: boolean) => void }) {
    const copyPrompt = async () => {
        if (!value.trim() || typeof navigator === "undefined") return;
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
        }
    };
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="文本工具栏">
            <span className="font-medium">纯文本</span>
            <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={() => onWrapChange(!wrap)}>
                {wrap ? "关闭自动换行" : "启用自动换行"}
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-50" disabled={!value.trim()} onClick={() => void copyPrompt()}>
                <Copy className="size-3.5" />
                复制
            </button>
        </div>
    );
}

function StoryboardTaskTag({ status, executionPhase, label, needsReview = false }: { status?: DramaLabTaskStatus; executionPhase?: DramaLabVideoBatchExecutionPhase; label: string; needsReview?: boolean }) {
    const value = status || "idle";
    const labelMap: Record<DramaLabTaskStatus, string> = { idle: "待生成", queued: "排队中", pending: "等待中", running: "生成中", success: "已完成", error: "失败", cancelled: "已取消" };
    const classMap: Record<DramaLabTaskStatus, string> = {
        idle: "border-border bg-muted text-muted-foreground",
        queued: "border-amber-300 bg-amber-50 text-amber-800",
        pending: "border-amber-300 bg-amber-50 text-amber-800",
        running: "border-sky-300 bg-sky-50 text-sky-800",
        success: "border-emerald-300 bg-emerald-50 text-emerald-800",
        error: "border-rose-300 bg-rose-50 text-rose-800",
        cancelled: "border-border bg-muted text-muted-foreground",
    };
    const phaseLabelMap: Partial<Record<DramaLabVideoBatchExecutionPhase, string>> = {
        created: "已创建",
        submitting: "提交中",
        submitted: "已提交",
        polling: "处理中",
        result_ready: "结果待保存",
        persisting: "保存中",
        cancel_requested: "取消中",
        cancel_polling: "确认取消中",
        completed: "已结束",
        needs_review: "待检查",
    };
    const phaseIsActive =
        executionPhase === "created" ||
        executionPhase === "submitting" ||
        executionPhase === "submitted" ||
        executionPhase === "polling" ||
        executionPhase === "result_ready" ||
        executionPhase === "persisting" ||
        executionPhase === "cancel_requested" ||
        executionPhase === "cancel_polling";
    const phaseClass = executionPhase === "result_ready" || executionPhase === "persisting" || executionPhase === "needs_review" ? "border-amber-300 bg-amber-50 text-amber-800" : phaseIsActive ? "border-sky-300 bg-sky-50 text-sky-800" : undefined;
    const phaseLabel = executionPhase && value !== "success" && value !== "error" && value !== "cancelled" ? phaseLabelMap[executionPhase] : undefined;
    return (
        <span className={cn("border px-1.5 py-0.5 text-xs", needsReview ? "border-amber-300 bg-amber-50 text-amber-800" : phaseClass || classMap[value])}>
            {label} {needsReview ? "待检查" : phaseLabel || labelMap[value]}
        </span>
    );
}

function GenerationHistory({ history = [], activeUrl, type, onRestore }: { history?: DramaLabGenerationHistory[]; activeUrl?: string; type: "image" | "video"; onRestore: (url: string) => void }) {
    if (history.length < 2) return null;
    return (
        <div className="flex items-center gap-1" aria-label="历史生成结果">
            {history.map((entry, index) => (
                <button
                    key={entry.id}
                    type="button"
                    title={`恢复历史结果 ${index + 1}`}
                    aria-label={`恢复历史结果 ${index + 1}`}
                    className={cn("grid size-7 place-items-center border text-xs", activeUrl === entry.url ? "border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted")}
                    onClick={() => onRestore(entry.url)}
                >
                    {type === "image" ? <img src={entry.url} alt="" className="size-full object-cover" /> : index + 1}
                </button>
            ))}
        </div>
    );
}

// 5. 导出面板
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
                await assertJsonApiResponse(response);
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
            <DramaLabFinalVideoPanel projectId={project.id} episodeId={episode.id} disabled={exportBlockedByApproval} totalShots={episodeShots.length} videoShots={videoShots.length} />
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
