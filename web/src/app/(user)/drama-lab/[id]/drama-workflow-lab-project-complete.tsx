"use client";

import { Alert, Button, Drawer, Spin, Tabs, Input, Select, Form, List, Modal, message, Switch, Radio } from "antd";
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
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Asset } from "@/lib/library-asset-contract";
import type { DramaShotVideoFrameSnapshot } from "@/lib/drama-project-contract";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { recoverVideoGenerationTask } from "@/services/api/video-core";
import { cn } from "@/lib/utils";
import { DramaLabVisualAssetsPanel } from "./drama-lab-visual-assets-panel";
import { DramaLabNovelImport } from "./drama-lab-novel-import";
import { dramaLabVideoTaskReviewDescription, requiresDramaLabVideoTaskCheck } from "./drama-lab-video-task-recovery";

const { TextArea } = Input;
const { Option } = Select;

export function dramaLabEpisodeCanvasHref(projectId: string, episodeId: string, shotId?: string) {
    const params = new URLSearchParams();
    params.set("episodeId", episodeId);
    if (shotId) params.set("shotId", shotId);
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

type CollaborationStageKey = "script" | "asset_prompts" | "visual_images" | "storyboard_video" | "final_cut";
type CollaborationApprovalStatus = "draft" | "submitted" | "approved" | "returned" | "requires_confirmation";
type CollaborationFeedback = { id: string; stage: CollaborationStageKey; content: string; createdAt: string };

const COLLABORATION_STAGES: Array<{ key: CollaborationStageKey; label: string; step: StepKey; description: string }> = [
    { key: "script", label: "剧本审核", step: "script", description: "故事梗概、分集剧本与人物情节表达" },
    { key: "asset_prompts", label: "资产提示词审核", step: "assets", description: "角色、场景、道具及分镜提示词" },
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

export interface Episode {
    id: string;
    title: string;
    number: number;
    script: string;
    sourceRange?: string;
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
    title?: string;
    description?: string;
    sourceText?: string;
    shotBoundary?: string;
    dialogue?: string;
    narration?: string;
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
    storyboardStatus?: DramaLabTaskStatus;
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
    generationNeedsReview?: boolean;
    generationError?: string;
    videoHistory?: DramaLabGenerationHistory[];
    status?: string;
    frames?: Partial<
        Record<"first" | "key" | "last", { prompt: string; description?: string; status?: DramaLabTaskStatus; taskId?: string; attempt?: number; url?: string; storageKey?: string; width?: number; height?: number; error?: string; history?: DramaLabGenerationHistory[]; source?: "generated" | "uploaded" | "video_tail" | "restored"; sourceVideoTaskId?: string; sourceShotId?: string; sourceVideoHistoryId?: string; locked?: boolean }>
    >;
    firstFrameCandidate?: { id: string; frameType: "first"; url: string; storageKey?: string; width?: number; height?: number; source: "video_tail"; sourceVideoTaskId: string; sourceShotId: string; sourceVideoHistoryId: string; createdAt: string; projectUpdatedAt: string };
    videoFrameSnapshot?: DramaShotVideoFrameSnapshot;
}

type DramaLabTaskStatus = "idle" | "queued" | "pending" | "running" | "success" | "error" | "cancelled";
type DramaLabGenerationHistory = { id: string; taskId: string; url: string; prompt: string; createdAt: string; width?: number; height?: number };

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
        storyboardStatus: taskStatus(shot.storyboardStatus) || (storyboardImageUrl ? "success" : "idle"),
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
        generationNeedsReview: shot.generationNeedsReview === true ? true : undefined,
        generationError: typeof shot.generationError === "string" ? shot.generationError : undefined,
        videoHistory: normalizeGenerationHistory(shot.videoHistory),
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
        return [{
            role,
            frameType: reference.frameType === "first" || reference.frameType === "key" || reference.frameType === "last" ? (reference.frameType as "first" | "key" | "last") : undefined,
            url,
            storageKey: typeof reference.storageKey === "string" ? reference.storageKey : undefined,
            taskId: typeof reference.taskId === "string" ? reference.taskId : undefined,
            source: reference.source === "generated" || reference.source === "uploaded" || reference.source === "video_tail" || reference.source === "restored" ? (reference.source as NonNullable<DramaShotVideoFrameSnapshot["references"][number]["source"]>) : undefined,
            sourceVideoTaskId: typeof reference.sourceVideoTaskId === "string" ? reference.sourceVideoTaskId : undefined,
            sourceShotId: typeof reference.sourceShotId === "string" ? reference.sourceShotId : undefined,
            sourceVideoHistoryId: typeof reference.sourceVideoHistoryId === "string" ? reference.sourceVideoHistoryId : undefined,
        }];
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
        "generationNeedsReview",
        "generationError",
        "videoUrl",
        "videoHistory",
        "videoFrameSnapshot",
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

function isDramaLabTaskActive(status: DramaLabTaskStatus | undefined) {
    return status === "queued" || status === "pending" || status === "running";
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
    const initialStoryboardHashHandledRef = useRef(false);
    const projectRef = useRef<Project | null>(null);
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    // 加载项目数据
    const loadProject = useCallback(async () => {
        setLoading(true);
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
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
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

            setSaving(true);
            try {
                const response = await fetch(`/api/drama-lab/projects/${projectId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: nextProject.title,
                        summary: nextProject.description,
                        style: nextProject.style,
                        ratio: nextProject.aspectRatio,
                        episodes: nextProject.episodes,
                        characters: nextProject.characters,
                        scenes: nextProject.scenes,
                        props: nextProject.props,
                        shots: nextProject.shots,
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
                {activeEpisode ? (
                    <Button
                        href={dramaLabEpisodeCanvasHref(projectId, activeEpisode.id)}
                        icon={<PanelsTopLeft className="size-4" />}
                        aria-label="打开本集画布"
                        title="打开本集画布"
                    >
                        <span className="hidden xl:inline">打开本集画布</span>
                    </Button>
                ) : null}
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
                                        <Button
                                            type="text"
                                            size="small"
                                            className="shrink-0"
                                            href={dramaLabEpisodeCanvasHref(projectId, ep.id)}
                                            aria-label={`打开${ep.title}画布`}
                                            title={`打开${ep.title}画布`}
                                            icon={<PanelsTopLeft className="size-3.5" />}
                                        />
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
                    {activeStep === "script" && <ScriptEditor project={project} episode={activeEpisode} onSave={saveProject} onReload={loadProject} onActiveEpisodeChange={setActiveEpisodeId} messageApi={messageApi} />}
                    {activeStep === "review" && <ReviewPanel project={project} episode={activeEpisode} onStepChange={setActiveStep} />}
                    {activeStep === "assets" && <DramaLabVisualAssetsPanel project={project} episode={activeEpisode} onSave={saveProject} onReload={loadProject} onLocateShot={locateStoryboardShot} messageApi={messageApi} />}
                    {activeStep === "storyboard" && <StoryboardPanel project={project} episode={activeEpisode} onSave={saveProject} onReload={loadProject} onShotSynced={updateProjectShotFromSync} messageApi={messageApi} />}
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
    onReload,
    onActiveEpisodeChange,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: Partial<Project>, options?: SaveOptions) => Promise<boolean>;
    onReload: () => Promise<void>;
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

    type StoryTaskState = { status?: string; error?: string; episodeCount?: number; persistedEpisodeCount?: number; taskId?: string };
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
    }, [messageApi, saveNow]);

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
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.taskId) throw new Error(data.msg || "生成失败");
            const taskId = String(data.data.taskId);
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

                                            <DramaLabNovelImport
                                                projectId={project.id}
                                                currentEpisodeCount={project.episodes.length}
                                                messageApi={messageApi}
                                                onImported={async (episodeId) => {
                                                    await onReload();
                                                    if (episodeId) onActiveEpisodeChange(episodeId);
                                                }}
                                            />
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
                  { label: "生成镜头视频", detail: "在分镜工作台内按镜头顺序生成", target: "storyboard" as StepKey },
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
type ReviewDemoTarget = Extract<StepKey, "assets" | "storyboard">;

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
            ? [{ id: "video-empty", severity: "中" as const, area: "镜头视频", title: "尚未生成镜头视频", detail: "镜头动态、节奏与成片可用性将在视频结果生成后完成核验。", action: "前往分镜工作台", target: "storyboard" as const }]
            : [{ id: "video-ready", severity: "低" as const, area: "镜头视频", title: "复核成片节奏", detail: `${videoCount} 个镜头已有视频结果，建议确认动作衔接与时长节奏。`, action: "前往分镜工作台", target: "storyboard" as const }]),
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
    onShotSynced,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: ProjectUpdate, options?: SaveOptions) => Promise<boolean>;
    onReload: () => Promise<void>;
    onShotSynced: (episodeId: string, shotId: string, shot: unknown) => void;
    messageApi: ReturnType<typeof message.useMessage>[0];
}) {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingShot, setEditingShot] = useState<Shot | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [startingKeys, setStartingKeys] = useState<Set<string>>(() => new Set());
    const startingKeysRef = useRef(new Set<string>());
    const [batchRunning, setBatchRunning] = useState<"image" | "video" | "">("");
    const [form] = Form.useForm();
    const episodeId = episode?.id;

    const episodeShots = episode ? project.shots.filter((s) => s.episodeId === episode.id).sort((a, b) => a.shotNumber - b.shotNumber) : [];
    const activeTaskShots = episodeShots.filter((shot) => isDramaLabTaskActive(shot.storyboardStatus) || isDramaLabTaskActive(shot.generationStatus) || Object.values(shot.frames || {}).some((frame) => isDramaLabTaskActive(frame?.status)));
    const activeTaskShotsRef = useRef(activeTaskShots);
    activeTaskShotsRef.current = activeTaskShots;
    const activeTaskSignature = activeTaskShots.map(dramaLabGenerationSyncKey).join("|");
    const automaticSyncPausedRef = useRef(new Set<string>());
    const syncInFlightRef = useRef(new Map<string, Promise<void>>());
    const currentEpisodeIdRef = useRef(episodeId);
    currentEpisodeIdRef.current = episodeId;
    const [automaticSyncRevision, setAutomaticSyncRevision] = useState(0);

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
        async (shotId: string, silent = true) => {
            if (!episodeId) return;
            const syncKey = `${episodeId}:${shotId}`;
            const existing = syncInFlightRef.current.get(syncKey);
            if (existing) return existing;
            const pending = (async () => {
                const controller = new AbortController();
                const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
                try {
                    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shotId)}/sync-generation?episodeId=${encodeURIComponent(episodeId)}`, {
                        method: "POST",
                        signal: controller.signal,
                    });
                    await assertJsonApiResponse(response);
                    const data = await response.json();
                    if (!response.ok || data.code !== 0) throw new Error(data.msg || "任务状态同步失败");
                    if (!data.data?.shot) throw new Error("任务状态同步响应缺少分镜数据");
                    if (currentEpisodeIdRef.current === episodeId) onShotSynced(episodeId, shotId, data.data.shot);
                    if (!silent) messageApi.success("任务状态已同步");
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") throw new Error("任务状态同步超时，请稍后使用同步按钮继续检查");
                    throw error;
                } finally {
                    window.clearTimeout(timeoutId);
                    syncInFlightRef.current.delete(syncKey);
                }
            })();
            syncInFlightRef.current.set(syncKey, pending);
            return pending;
        },
        [episodeId, messageApi, onShotSynced, project.id],
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

    const applyCreatedTask = (shot: Shot, kind: "image" | "video", taskId: string) => {
        onShotSynced(episodeId!, shot.id, {
            id: shot.id,
            ...(kind === "image" ? { storyboardStatus: "running", storyboardTaskId: taskId, storyboardError: undefined } : { generationStatus: "running", generationTaskId: taskId, generationNeedsReview: undefined, generationError: undefined }),
        });
    };

    const applyCreatedFrameTask = (shot: Shot, frameType: "first" | "key" | "last", taskId: string, prompt?: string, description?: string) => {
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
                } catch {
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
        if (!episode) return;
        try {
            setExtracting(true);
            messageApi.loading({ content: "正在从剧本提取分镜...", key: "extract-storyboards", duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/extract-storyboards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeId: episode.id, requestId: crypto.randomUUID() }),
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !Array.isArray(data.data?.shots)) throw new Error(data.msg || "分镜提取失败");
            await onReload();
            messageApi.success({ content: `已提取 ${data.data.shots.length} 个分镜`, key: "extract-storyboards", duration: 3 });
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
        form.validateFields()
            .then(async (values) => {
                const details = {
                    ...values,
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
                        id: `shot_${Date.now()}`,
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
                    const saved = await onSave({ shots: [...project.shots, newShot] });
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

    const startGeneration = async (shot: Shot, kind: "image" | "video") => {
        if (!episode) return;
        if (kind === "video" && requiresDramaLabVideoTaskCheck(shot)) {
            messageApi.warning("当前视频任务待检查，请先点击“检查状态”，不会重复提交生成任务。");
            return;
        }
        if (kind === "video" && !shot.frames?.key?.url && !shot.storyboardImageUrl) {
            Modal.warning({
                title: "无法生成分镜视频",
                content: "请先生成当前镜头的关键帧或分镜图，再提交视频生成任务。",
                okText: "知道了",
            });
            return;
        }
        if (kind === "image") {
            const missing = missingShotAssetLabels(project, shot);
            if (missing.length) {
                Modal.warning({
                    title: "无法生成分镜图",
                    content: `当前镜头绑定的资产缺少参考图：${missing.join("、")}。请先到“资产准备”中生成或添加参考图。`,
                    okText: "知道了",
                });
                return;
            }
        }
        const actionKey = `${kind}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: kind === "image" ? "正在创建分镜图任务..." : "正在创建分镜视频任务...", key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/generate-${kind}?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "任务创建失败");
            const taskId = typeof data.data?.task?.id === "string" ? data.data.task.id : "";
            if (!taskId) throw new Error("任务创建响应缺少任务 ID");
            // Keep the new task in this view even if the immediately following
            // sync request fails. The server has already persisted it.
            applyCreatedTask(shot, kind, taskId);
            // The generation route already persists the task ID. Sync just this
            // shot so a slow project reload cannot leave the card in a stale state.
            await syncShot(shot.id, false).catch((error) => {
                messageApi.warning({ content: error instanceof Error ? `${error.message}，任务已创建，可稍后同步。` : "任务已创建，可稍后同步。", key: `drama-lab-initial-sync:${shot.id}`, duration: 6 });
            });
            messageApi.success({ content: kind === "image" ? "分镜图任务已提交" : "分镜视频任务已提交", key: actionKey });
        } catch (err) {
            messageApi.error({ content: err instanceof Error ? err.message : "任务创建失败", key: actionKey, duration: 6 });
        } finally {
            setActionBusy(actionKey, false);
        }
    };

    const checkVideoStatus = async (shot: Shot) => {
        if (!shot.generationTaskId) return;
        const actionKey = `video-status:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在检查原视频任务状态...", key: actionKey, duration: 0 });
            const controller = new AbortController();
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
            await syncShot(shot.id, true);
            messageApi.success({ content: "已检查原视频任务状态，正在同步结果。", key: actionKey, duration: 3 });
        } catch (error) {
            // The recovery endpoint may have just settled the original task. Sync it once
            // so the card receives its definitive result or terminal error.
            await syncShot(shot.id, true).catch(() => undefined);
            messageApi.error({ content: error instanceof Error ? error.message : "检查原视频任务状态失败", key: actionKey, duration: 6 });
        } finally {
            setActionBusy(actionKey, false);
        }
    };

    const runBatch = async (kind: "image" | "video") => {
        const candidates = episodeShots.filter((shot) =>
            kind === "image"
                ? !shot.storyboardImageUrl && !isDramaLabTaskActive(shot.storyboardStatus)
                : Boolean(shot.frames?.key?.url || shot.storyboardImageUrl) && !shot.videoUrl && !isDramaLabTaskActive(shot.generationStatus) && !requiresDramaLabVideoTaskCheck(shot),
        );
        if (!candidates.length) return messageApi.info(kind === "image" ? "没有待生成的分镜图" : "没有待生成的分镜视频");
        setBatchRunning(kind);
        try {
            for (const shot of candidates) await startGeneration(shot, kind);
        } finally {
            setBatchRunning("");
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
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: `正在规划并创建${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧任务...`, key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/generate-frame?episodeId=${encodeURIComponent(episode.id)}&frameType=${frameType}`, { method: "POST" });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "帧任务创建失败");
            const taskId = typeof data.data?.task?.id === "string" ? data.data.task.id : "";
            if (!taskId) throw new Error("帧任务创建响应缺少任务 ID");
            applyCreatedFrameTask(shot, frameType, taskId, typeof data.data?.prompt === "string" ? data.data.prompt : undefined, typeof data.data?.description === "string" ? data.data.description : undefined);
            await syncShot(shot.id, false).catch((error) => {
                messageApi.warning({ content: error instanceof Error ? `${error.message}，任务已创建，可稍后同步。` : "任务已创建，可稍后同步。", key: `drama-lab-initial-sync:${shot.id}`, duration: 6 });
            });
            messageApi.success({ content: `${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧任务已提交`, key: actionKey });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "帧任务创建失败", key: actionKey });
        } finally {
            setActionBusy(actionKey, false);
        }
    };

    const extractTailFrame = async (shot: Shot) => {
        if (!episode || !shot.generationTaskId) {
            messageApi.warning("请先完成当前分镜视频，再提取真实尾帧");
            return;
        }
        const actionKey = `tail-frame:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在从已完成视频提取尾帧...", key: actionKey, duration: 0 });
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/extract-tail-frame?episodeId=${encodeURIComponent(episode.id)}`, { method: "POST" });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.frame) throw new Error(data.msg || "视频尾帧提取失败");
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
            messageApi.error({ content: error instanceof Error ? error.message : "视频尾帧提取失败", key: actionKey, duration: 6 });
        } finally {
            setActionBusy(actionKey, false);
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
        try {
            setActionBusy(actionKey, true);
            messageApi.loading({ content: "正在应用候选首帧...", key: actionKey, duration: 0 });
            const query = new URLSearchParams({ episodeId: episode.id, candidateId: candidate.id });
            if (replaceExisting) query.set("replaceExisting", "true");
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/accept-first-frame-candidate?${query.toString()}`, { method: "POST" });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.shot) throw new Error(data.msg || "候选首帧应用失败");
            onShotSynced(episode.id, shot.id, { ...data.data.shot, firstFrameCandidate: data.data.candidate ?? null });
            messageApi.success({ content: "候选首帧已应用并锁定", key: actionKey, duration: 4 });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "候选首帧应用失败", key: actionKey, duration: 6 });
        } finally {
            setActionBusy(actionKey, false);
        }
    };

    const toggleFrameLock = async (shot: Shot, frameType: "first" | "key" | "last") => {
        const frame = shot.frames?.[frameType];
        if (!episode || !frame?.url) return;
        const actionKey = `frame-lock:${frameType}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        try {
            setActionBusy(actionKey, true);
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/frames/${frameType}/lock?episodeId=${encodeURIComponent(episode.id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locked: !frame.locked }),
            });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.frame) throw new Error(data.msg || "帧锁定状态保存失败");
            onShotSynced(episode.id, shot.id, { id: shot.id, frames: { [frameType]: data.data.frame } });
            messageApi.success({ content: data.msg || (frame.locked ? "帧已解锁" : "帧已锁定"), key: actionKey, duration: 3 });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "帧锁定状态保存失败", key: actionKey, duration: 5 });
        } finally {
            setActionBusy(actionKey, false);
        }
    };

    const uploadFrame = async (shot: Shot, frameType: "first" | "key" | "last", file: File) => {
        if (!episode) return;
        const actionKey = `frame-upload:${frameType}:${shot.id}`;
        if (startingKeysRef.current.has(actionKey)) return;
        try {
            setActionBusy(actionKey, true);
            const formData = new FormData();
            formData.set("file", file);
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/frames/upload?episodeId=${encodeURIComponent(episode.id)}&frameType=${frameType}`, { method: "POST", body: formData });
            await assertJsonApiResponse(response);
            const data = await response.json();
            if (!response.ok || data.code !== 0 || !data.data?.frame) throw new Error(data.msg || "帧图片上传失败");
            onShotSynced(episode.id, shot.id, { id: shot.id, frames: { [frameType]: data.data.frame } });
            messageApi.success({ content: `${frameType === "first" ? "首" : frameType === "key" ? "关键" : "尾"}帧图片已上传`, key: actionKey, duration: 3 });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "帧图片上传失败", key: actionKey, duration: 6 });
        } finally {
            setActionBusy(actionKey, false);
        }
    };

    if (!episode) {
        return <div className="text-center text-muted-foreground">请先选择一个剧集</div>;
    }

    return (
        <div className="mx-auto max-w-[1440px]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">分镜工作台</h2>
                    <p className="text-sm text-muted-foreground">当前集 {episodeShots.length} 个分镜，资产勾选会作为本镜生图和视频生成的参考依据。</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button loading={batchRunning === "image"} disabled={Boolean(batchRunning)} icon={<Sparkles className="size-4" />} onClick={() => void runBatch("image")}>
                        批量生成分镜图
                    </Button>
                    <Button loading={batchRunning === "video"} disabled={Boolean(batchRunning)} icon={<Film className="size-4" />} onClick={() => void runBatch("video")}>
                        批量生成分镜视频
                    </Button>
                    <Button type="primary" icon={<Sparkles className="size-4" />} loading={extracting} onClick={handleExtract}>
                        从剧本提取分镜
                    </Button>
                    <Button icon={<Plus className="size-4" />} onClick={handleAdd}>
                        添加分镜
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                {episodeShots.map((shot) => (
                    <StoryboardWorkbenchCard
                        key={shot.id}
                        shot={shot}
                        project={project}
                        busyKeys={startingKeys}
                        onStartGeneration={startGeneration}
                        onCheckVideoStatus={checkVideoStatus}
                        onStartFrame={startFrame}
                        onExtractTailFrame={extractTailFrame}
                        onAcceptFirstFrameCandidate={acceptFirstFrameCandidate}
                        onKeepFirstFrameCandidate={() => messageApi.info("候选首帧已保留，未覆盖当前首帧")}
                        onToggleFrameLock={toggleFrameLock}
                        onUploadFrame={uploadFrame}
                        onSync={() => void syncShotManually(shot).catch((error) => messageApi.error(error instanceof Error ? error.message : "任务状态同步失败"))}
                        onUpdate={(patch) => void updateShot(shot.id, patch).catch((error) => messageApi.error(error instanceof Error ? error.message : "保存分镜失败"))}
                        onEdit={() => handleEdit(shot)}
                        onDelete={() => handleDelete(shot.id)}
                    />
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

                    <Form.Item label="分镜标题" name="title" rules={[{ required: true }]}>
                        <Input placeholder="例如：雨夜来电" />
                    </Form.Item>

                    <Form.Item label="分镜描述" name="description" rules={[{ required: true }]}>
                        <TextArea rows={4} placeholder="描述这一镜要表现的内容、台词、动作等" />
                    </Form.Item>

                    <Form.Item label="对白" name="dialogue">
                        <TextArea rows={2} placeholder="可选" />
                    </Form.Item>

                    <Form.Item label="旁白" name="narration">
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
                </Form>
            </Modal>
        </div>
    );
}

function StoryboardWorkbenchCard({
    shot,
    project,
    busyKeys,
    onStartGeneration,
    onCheckVideoStatus,
    onSync,
    onUpdate,
    onEdit,
    onDelete,
    onStartFrame,
    onExtractTailFrame,
    onAcceptFirstFrameCandidate,
    onKeepFirstFrameCandidate,
    onToggleFrameLock,
    onUploadFrame,
}: {
    shot: Shot;
    project: Project;
    busyKeys: ReadonlySet<string>;
    onStartGeneration: (shot: Shot, kind: "image" | "video") => Promise<void>;
    onCheckVideoStatus: (shot: Shot) => Promise<void>;
    onStartFrame: (shot: Shot, frameType: "first" | "key" | "last") => Promise<void>;
    onExtractTailFrame: (shot: Shot) => Promise<void>;
    onAcceptFirstFrameCandidate: (shot: Shot, replaceExisting?: boolean) => Promise<void>;
    onKeepFirstFrameCandidate: (shot: Shot) => void;
    onToggleFrameLock: (shot: Shot, frameType: "first" | "key" | "last") => Promise<void>;
    onUploadFrame: (shot: Shot, frameType: "first" | "key" | "last", file: File) => Promise<void>;
    onSync: () => void;
    onUpdate: (patch: Partial<Shot>) => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const imageBusy = busyKeys.has(`image:${shot.id}`) || isDramaLabTaskActive(shot.storyboardStatus);
    const videoBusy = busyKeys.has(`video:${shot.id}`) || isDramaLabTaskActive(shot.generationStatus);
    const checkingVideoStatus = busyKeys.has(`video-status:${shot.id}`);
    const videoNeedsCheck = requiresDramaLabVideoTaskCheck(shot);
    const uploadInputRefs = useRef<Partial<Record<"first" | "key" | "last", HTMLInputElement | null>>>({});
    const frameLabel: Record<"first" | "key" | "last", string> = { first: "首帧", key: "关键帧", last: "尾帧" };
    return (
        <article id={`storyboard-shot-${shot.id}`} className="overflow-hidden rounded-lg border border-border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                            分镜 {shot.shotNumber} · {shot.title}
                        </h3>
                        <StoryboardTaskTag status={shot.storyboardStatus} label="分镜图" />
                        <StoryboardTaskTag status={shot.generationStatus} label="视频" needsReview={videoNeedsCheck} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {shot.duration}s{shot.cameraAngle ? ` · ${shot.cameraAngle}` : ""}
                        {shot.cameraMotion ? ` · ${shot.cameraMotion}` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        type="text"
                        size="small"
                        title="在画布中打开此分镜"
                        aria-label="在画布中打开此分镜"
                        href={dramaLabEpisodeCanvasHref(project.id, shot.episodeId, shot.id)}
                        icon={<PanelsTopLeft className="size-4" />}
                    />
                    <Button type="text" size="small" title="同步任务状态" aria-label="同步任务状态" icon={<LoaderCircle className="size-4" />} onClick={onSync} />
                    <Button type="text" size="small" title="编辑分镜" aria-label="编辑分镜" icon={<Edit2 className="size-4" />} onClick={onEdit} />
                    <Button type="text" danger size="small" title="删除分镜" aria-label="删除分镜" icon={<Trash2 className="size-4" />} onClick={onDelete} />
                </div>
            </header>
            <div className="grid divide-y divide-border xl:grid-cols-[280px_minmax(0,1fr)_minmax(300px,0.9fr)] xl:divide-x xl:divide-y-0">
                <section className="space-y-4 p-4" aria-label={`分镜 ${shot.shotNumber} 资产关联`}>
                    <AssetBindingGroup label="场景" assets={project.scenes} selectedIds={shot.sceneId ? [shot.sceneId] : []} single onChange={(ids) => onUpdate({ sceneId: ids[0] })} />
                    <AssetBindingGroup label="角色" assets={project.characters} selectedIds={shot.characterIds} onChange={(characterIds) => onUpdate({ characterIds })} />
                    <AssetBindingGroup label="道具" assets={project.props} selectedIds={shot.propIds} onChange={(propIds) => onUpdate({ propIds })} />
                </section>
                <section className="min-w-0 space-y-3 p-4" aria-label={`分镜 ${shot.shotNumber} 画面`}>
                    <TextArea
                        defaultValue={shot.description}
                        autoSize={{ minRows: 3, maxRows: 8 }}
                        aria-label="分镜描述"
                        onBlur={(event) => {
                            const description = event.target.value.trim();
                            if (description && description !== shot.description) onUpdate({ description, script: description, sourceText: shot.sourceText || description });
                        }}
                    />
                    <TextArea defaultValue={shot.imagePrompt} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="画面补充（可选）" aria-label="画面补充" onBlur={(event) => onUpdate({ imagePrompt: event.target.value.trim() })} />
                    {shot.storyboardError ? <Alert type="error" showIcon message={shot.storyboardError} /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                        {(["first", "key", "last"] as const).map((frameType) => {
                            const frame = shot.frames?.[frameType];
                            const busy = busyKeys.has(`frame:${frameType}:${shot.id}`) || isDramaLabTaskActive(frame?.status);
                            return (
                                <Button key={frameType} loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void onStartFrame(shot, frameType)}>
                                    {frame?.url ? `重生成${frameLabel[frameType]}` : `生成${frameLabel[frameType]}`}
                                </Button>
                            );
                        })}
                        {(["first", "key", "last"] as const).map((frameType) => {
                            const frame = shot.frames?.[frameType];
                            return (
                                <span key={`frame-tools-${frameType}`} className="contents">
                                    <input ref={(node) => { uploadInputRefs.current[frameType] = node; }} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onUploadFrame(shot, frameType, file); }} />
                                    <Button size="small" title={`上传${frameLabel[frameType]}`} aria-label={`上传${frameLabel[frameType]}`} loading={busyKeys.has(`frame-upload:${frameType}:${shot.id}`)} icon={<Upload className="size-3.5" />} onClick={() => uploadInputRefs.current[frameType]?.click()} />
                                    {frame?.url ? <Button size="small" title={frame.locked ? `解锁${frameLabel[frameType]}` : `锁定${frameLabel[frameType]}`} aria-label={frame.locked ? `解锁${frameLabel[frameType]}` : `锁定${frameLabel[frameType]}`} loading={busyKeys.has(`frame-lock:${frameType}:${shot.id}`)} icon={<LockKeyhole className={cn("size-3.5", frame.locked && "text-emerald-600")} />} onClick={() => void onToggleFrameLock(shot, frameType)} /> : null}
                                </span>
                            );
                        })}
                        {shot.generationTaskId && shot.generationStatus === "success" ? <Button size="small" loading={busyKeys.has(`tail-frame:${shot.id}`)} icon={<Film className="size-3.5" />} onClick={() => void onExtractTailFrame(shot)}>从视频提取尾帧</Button> : null}
                        <Button type="primary" loading={imageBusy} icon={<Sparkles className="size-4" />} onClick={() => void onStartGeneration(shot, "image")}>
                            {shot.storyboardImageUrl ? "重新生成分镜图" : "生成分镜图"}
                        </Button>
                        <GenerationHistory
                            history={shot.storyboardHistory}
                            activeUrl={shot.storyboardImageUrl}
                            type="image"
                            onRestore={(url) => onUpdate({ storyboardImageUrl: url, imageUrl: url, storyboardStatus: "success", storyboardError: undefined })}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {(["first", "key", "last"] as const).map((frameType) => {
                            const frame = shot.frames?.[frameType];
                            return (
                                <div key={frameType} className="space-y-1">
                                    <div className="text-xs text-muted-foreground">{frameLabel[frameType]}</div>
                                    {frame?.url ? (
                                        <img src={frame.url} alt={`${frameLabel[frameType]}参考`} className="aspect-video w-full rounded border border-border object-cover" />
                                    ) : (
                                        <div className="grid aspect-video place-items-center border border-dashed border-border text-xs text-muted-foreground">待生成</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {shot.firstFrameCandidate ? (
                        <div className="space-y-2 border border-amber-300 bg-amber-50/60 p-3" role="status" aria-label="待确认的候选首帧">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-medium text-amber-900">上一镜尾帧候选</div>
                                <span className="text-[11px] text-amber-800">仅候选，尚未覆盖当前首帧</span>
                            </div>
                            <img src={shot.firstFrameCandidate.url} alt="候选首帧预览" className="aspect-video w-full rounded border border-amber-300 object-cover" />
                            <div className="flex flex-wrap gap-2">
                                <Button size="small" type="primary" loading={busyKeys.has(`candidate-accept:${shot.id}`)} onClick={() => void onAcceptFirstFrameCandidate(shot)}>应用为首帧</Button>
                                <Button size="small" onClick={() => onKeepFirstFrameCandidate(shot)}>保留候选</Button>
                            </div>
                        </div>
                    ) : null}
                    {shot.storyboardImageUrl ? (
                        <img src={shot.storyboardImageUrl} alt={`分镜 ${shot.shotNumber} 图像`} className="max-h-[460px] w-full rounded border border-border object-contain" />
                    ) : (
                        <div className="grid min-h-40 place-items-center border border-dashed border-border text-sm text-muted-foreground">尚未生成分镜图</div>
                    )}
                </section>
                <section className="min-w-0 space-y-3 p-4" aria-label={`分镜 ${shot.shotNumber} 视频`}>
                    <TextArea defaultValue={shot.videoPrompt} autoSize={{ minRows: 3, maxRows: 7 }} placeholder="镜头动作与动态补充（可选）" aria-label="视频提示词" onBlur={(event) => onUpdate({ videoPrompt: event.target.value.trim() })} />
                    {videoNeedsCheck ? <Alert type="warning" showIcon message="视频结果待检查" description={dramaLabVideoTaskReviewDescription(shot)} /> : null}
                    {shot.generationError && !videoNeedsCheck ? <Alert type="error" showIcon message={shot.generationError} /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                        {videoNeedsCheck ? (
                            <Button loading={checkingVideoStatus} disabled={checkingVideoStatus} icon={<LoaderCircle className="size-4" />} onClick={() => void onCheckVideoStatus(shot)}>
                                检查状态
                            </Button>
                        ) : null}
                        <Button type="primary" loading={videoBusy} disabled={videoBusy || checkingVideoStatus || videoNeedsCheck} icon={<Film className="size-4" />} onClick={() => void onStartGeneration(shot, "video")}>
                            {videoNeedsCheck ? "请先检查状态" : shot.videoUrl ? "重新生成视频" : "生成分镜视频"}
                        </Button>
                        <GenerationHistory history={shot.videoHistory} activeUrl={shot.videoUrl} type="video" onRestore={(url) => onUpdate({ videoUrl: url, generationStatus: "success", generationNeedsReview: undefined, generationError: undefined })} />
                    </div>
                    {shot.videoUrl ? (
                        <video src={shot.videoUrl} controls className="max-h-[460px] w-full rounded border border-border" />
                    ) : (
                        <div className="grid min-h-40 place-items-center border border-dashed border-border text-sm text-muted-foreground">生成关键帧或分镜图后可生成视频</div>
                    )}
                </section>
            </div>
        </article>
    );
}

function AssetBindingGroup({ label, assets, selectedIds, single = false, onChange }: { label: string; assets: Array<Character | Scene | Prop>; selectedIds: string[]; single?: boolean; onChange: (ids: string[]) => void }) {
    return (
        <div>
            <div className="mb-2 text-sm font-medium">{label}</div>
            <div className="space-y-1.5">
                {assets.length ? (
                    assets.map((asset) => {
                        const selected = selectedIds.includes(asset.id);
                        const imageUrl = asset.referenceImageUrl || asset.imageUrl || asset.references?.find((reference) => reference.id === asset.primaryReferenceId)?.url || asset.references?.[0]?.url;
                        const name = "location" in asset ? asset.location : asset.name;
                        return (
                            <label key={asset.id} className={cn("flex cursor-pointer items-center gap-2 border p-1.5 text-sm transition-colors", selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                                <input
                                    type={single ? "radio" : "checkbox"}
                                    name={single ? `scene-${label}` : undefined}
                                    checked={selected}
                                    onChange={() => onChange(single ? (selected ? [] : [asset.id]) : selected ? selectedIds.filter((id) => id !== asset.id) : [...selectedIds, asset.id])}
                                />
                                {imageUrl ? (
                                    <img src={imageUrl} alt="" className="size-9 shrink-0 object-cover" />
                                ) : (
                                    <div className="grid size-9 shrink-0 place-items-center bg-muted text-muted-foreground">
                                        <Package className="size-4" />
                                    </div>
                                )}
                                <span className="min-w-0 truncate">{name}</span>
                            </label>
                        );
                    })
                ) : (
                    <p className="text-xs text-muted-foreground">暂无{label}资产</p>
                )}
            </div>
        </div>
    );
}

function StoryboardTaskTag({ status, label, needsReview = false }: { status?: DramaLabTaskStatus; label: string; needsReview?: boolean }) {
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
    return (
        <span className={cn("border px-1.5 py-0.5 text-xs", needsReview ? "border-amber-300 bg-amber-50 text-amber-800" : classMap[value])}>
            {label} {needsReview ? "待检查" : labelMap[value]}
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
