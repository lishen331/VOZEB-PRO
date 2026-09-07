import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import type { GenerationTaskContext } from "@/lib/server/generation-task-store";

export type DramaLabWorkflowMode = "assets" | "storyboard_extract" | "storyboard" | "video";
export type DramaLabWorkflowScope = "current" | "all";
export type DramaLabWorkflowStatus = "pending" | "running" | "success" | "error" | "cancelled";
export type DramaLabWorkflowStepStatus = "pending" | "running" | "success" | "error" | "skipped" | "cancelled";

export type DramaLabWorkflowStepKey = "script" | "assets" | "storyboard" | "video" | "review" | "export";

export type DramaLabWorkflowOptions = {
    mode: DramaLabWorkflowMode;
    scope: DramaLabWorkflowScope;
    ratio: string;
    duration: string;
    language: string;
    visualStyle: string;
    autoExport: boolean;
};

export type DramaLabWorkflowChild = {
    id: string;
    type: "render" | "text" | "image" | "video";
    key: string;
    episodeId?: string;
    shotId?: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    inputSnapshot?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    createdAt: number;
    updatedAt: number;
};

export type DramaLabWorkflowStep = {
    key: DramaLabWorkflowStepKey;
    status: DramaLabWorkflowStepStatus;
    label: string;
    target: "script" | "assets" | "storyboard" | "review" | "export";
    inputSnapshot?: Record<string, unknown>;
    outputRefs: Array<Record<string, unknown>>;
    childTaskIds: string[];
    error?: string;
    attempts: number;
    startedAt?: number;
    completedAt?: number;
};

export type DramaLabWorkflowState = {
    version: 1;
    projectId: string;
    sourceEpisodeId: string;
    episodeIds: string[];
    options: DramaLabWorkflowOptions;
    steps: DramaLabWorkflowStep[];
    children: DramaLabWorkflowChild[];
    currentStepIndex: number;
    inputSnapshot: Record<string, unknown>;
    outputRefs: Array<Record<string, unknown>>;
    startedAt: number;
    finishedAt?: number;
    error?: string;
};

export type DramaLabWorkflowTask = GenerationTaskContext & {
    id: string;
    userId: string;
    status: DramaLabWorkflowStatus;
    createdAt: number;
    updatedAt: number;
    title: string;
    workflow: DramaLabWorkflowState;
    error?: string;
};

export type DramaLabWorkflowTaskView = {
    id: string;
    status: DramaLabWorkflowStatus;
    projectId: string;
    mode: DramaLabWorkflowMode;
    scope: DramaLabWorkflowScope;
    currentStepIndex: number;
    currentStep?: DramaLabWorkflowStepKey;
    progress: number;
    steps: DramaLabWorkflowStep[];
    children: DramaLabWorkflowChild[];
    outputRefs: Array<Record<string, unknown>>;
    /** Latest durable partial result exposed to the client while a step runs. */
    checkpoint?: {
        episodeId: string;
        shotCount: number;
        recoveredCount: number;
        truncated: boolean;
        updatedAt: number;
        shots?: DramaShot[];
    };
    error?: string;
    createdAt: number;
    updatedAt: number;
};

export type DramaLabWorkflowProjectSnapshot = Pick<DramaProject, "id" | "title" | "summary" | "style" | "ratio" | "episodes" | "characters" | "scenes" | "props">;
