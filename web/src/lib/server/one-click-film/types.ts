import type { GenerationTaskStatus } from "@/lib/server/generation-task-types";

export const ONE_CLICK_FILM_SOURCE = "one-click-film" as const;
export const ONE_CLICK_FILM_VERSION = 1 as const;

export type OneClickFilmStepKey = "script" | "assets" | "storyboard" | "images" | "videos" | "audio" | "compose";
export type OneClickFilmStepStatus = "pending" | "running" | "success" | "error" | "skipped" | "cancelled";
export type OneClickFilmStatus = Extract<GenerationTaskStatus, "pending" | "running" | "success" | "error" | "cancelled">;

export type OneClickFilmStep = {
    key: OneClickFilmStepKey;
    label: string;
    status: OneClickFilmStepStatus;
    attempts: number;
    childTaskIds: string[];
    outputRefs: Array<Record<string, unknown>>;
    inputSnapshot?: Record<string, unknown>;
    error?: string;
    startedAt?: number;
    completedAt?: number;
};

export type OneClickFilmWorkflow = {
    source: typeof ONE_CLICK_FILM_SOURCE;
    version: typeof ONE_CLICK_FILM_VERSION;
    projectId: string;
    sourceEpisodeId?: string;
    episodeIds: string[];
    options: Record<string, unknown>;
    inputSnapshot: Record<string, unknown>;
    steps: OneClickFilmStep[];
    currentStepIndex: number;
    childTaskIds: string[];
    outputRefs: Array<Record<string, unknown>>;
    startedAt: number;
    finishedAt?: number;
    error?: string;
};

export type OneClickFilmTask = {
    id: string;
    userId: string;
    type: "render";
    taskKind: "one-click-film-workflow";
    source: typeof ONE_CLICK_FILM_SOURCE;
    status: OneClickFilmStatus;
    title: string;
    clientRequestId: string;
    projectId: string;
    createdAt: number;
    updatedAt: number;
    workflow: OneClickFilmWorkflow;
    error?: string;
};

export type OneClickFilmTaskView = Pick<OneClickFilmTask, "id" | "status" | "title" | "projectId" | "createdAt" | "updatedAt"> & {
    currentStep?: OneClickFilmStepKey;
    progress: number;
    steps: OneClickFilmStep[];
    childTaskIds: string[];
    outputRefs: Array<Record<string, unknown>>;
    error?: string;
};

export type OneClickFilmStartInput = {
    userId: string;
    projectId: string;
    clientRequestId: string;
    sourceEpisodeId?: string;
    episodeIds: string[];
    options?: Record<string, unknown>;
    inputSnapshot?: Record<string, unknown>;
};

export type OneClickFilmExecutor = (input: { task: OneClickFilmTask; step: OneClickFilmStep }) => Promise<{ status: "success" | "pending"; childTaskIds?: string[]; outputRefs?: Array<Record<string, unknown>> }>;
