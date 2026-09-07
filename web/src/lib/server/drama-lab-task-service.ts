import { getDramaLabCollaborationForUser, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { cancelDramaLabStoryTask } from "@/lib/server/drama-lab-story-generation-service";
import { cancelDramaLabWorkflow, dramaLabWorkflowTaskView, resumeDramaLabWorkflow } from "@/lib/server/drama-lab-workflow-task-service";
import { cancellationExecutionPatch } from "@/lib/server/generation-task-cancellation-service";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { listStoredDramaProjectTaskRecords, listStoredGenerationTaskRecords, getStoredGenerationTask, getStoredGenerationTaskRecord, type StoredGenerationTaskRecord } from "@/lib/server/generation-task-store";
import { transitionTextTask, getTextTask, type TextTask } from "@/lib/server/text-task-store";
import { transitionImageTask, getImageTask, type ImageTask } from "@/lib/server/image-task-store";
import { transitionVideoTask, getVideoTask, type VideoTask } from "@/lib/server/video-task-store";
import { transitionAudioTask, getAudioTask, type AudioTask } from "@/lib/server/audio-task-store";
import type { DramaLabWorkflowTask } from "@/lib/server/drama-lab-workflow-task-types";

const TASK_TYPES = ["text", "image", "video", "audio", "render"] as const;
type DramaTaskType = (typeof TASK_TYPES)[number];
type DramaTaskStatus = StoredGenerationTaskRecord["status"];

export type DramaLabTaskView = {
    id: string;
    taskType: DramaTaskType;
    status: DramaTaskStatus;
    executionPhase?: StoredGenerationTaskRecord["executionPhase"];
    projectId: string;
    episodeId?: string;
    shotId?: string;
    progress: number | null;
    currentStep?: string;
    error?: string;
    canCancel: boolean;
    canRetry: boolean;
    canRecheck?: boolean;
    createdAt: number;
    updatedAt: number;
    title: string;
};

export type DramaLabTaskList = {
    tasks: DramaLabTaskView[];
    activeCount: number;
    total: number;
};

export class DramaLabTaskError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "DramaLabTaskError";
    }
}

type TaskListStatus = "active" | "visible" | "terminal" | "all" | DramaTaskStatus;

/**
 * Read all task types from the shared generation_tasks store, then apply the
 * project boundary again in memory. The second check is intentional: older
 * rows may carry context in payload/context rather than denormalized columns.
 */
export async function listDramaLabTasksForProject(input: { userId: string; projectId: string; status?: string }): Promise<DramaLabTaskList> {
    const projectId = clean(input.projectId);
    if (!projectId) throw new DramaLabTaskError("Drama project is required", 400);
    const resolved = await resolveDramaLabProjectForRequest(input.userId, projectId);
    if (!resolved?.project) throw new DramaLabTaskError("Drama project not found", 404);
    const ownerIds = await taskOwnerIds(input.userId, resolved.ownerUserId, projectId);
    const status = normalizeListStatus(input.status);
    const records = await readProjectTaskRecords(ownerIds, projectId);
    const tasks = records
        // Workflow bookkeeping children are persisted in the shared task
        // store so workers can recover them, but they are not user tasks.
        // Returning them here makes a failed parent appear to keep running.
        .filter((record) => !isSyntheticWorkflowChild(record))
        .filter((record) => matchesStatus(effectiveDramaTaskStatus(record), status, record.executionPhase))
        .filter((record) => isProjectTask(record, projectId, ownerIds))
        .map(normalizeDramaLabTask)
        .sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
    return { tasks, activeCount: tasks.filter((task) => isActiveTaskView(task)).length, total: tasks.length };
}

/**
 * Cancel one project task through the server. This function is deliberately
 * type-aware so media recovery, billing/refunds, upstream cancellation and
 * workflow child cancellation keep using their existing implementations.
 */
export async function cancelDramaLabTask(input: { userId: string; projectId: string; taskId: string; origin: string; cookie?: string }) {
    const projectId = clean(input.projectId);
    const taskId = clean(input.taskId);
    if (!projectId || !taskId) throw new DramaLabTaskError("Task coordinates are incomplete", 400);
    const resolved = await resolveDramaLabProjectForRequest(input.userId, projectId);
    if (!resolved?.project) throw new DramaLabTaskError("Drama project not found", 404);
    const ownerIds = await taskOwnerIds(input.userId, resolved.ownerUserId, projectId);
    const located = await findTaskRecord(taskId, ownerIds, projectId);
    if (!located) throw new DramaLabTaskError("Task not found", 404);

    if (located.status === "cancelled" && isCancellationPhase(located.executionPhase)) return normalizeDramaLabTask(located);
    if (!isActiveStatus(effectiveDramaTaskStatus(located), located.executionPhase)) throw new DramaLabTaskError("The current task cannot be cancelled", 409);

    const origin = input.origin || "";
    const cookie = input.cookie || "";
    let cancelled: StoredGenerationTaskRecord | null = null;
    if (located.type === "render") {
        const task = await getStoredGenerationTask<DramaLabWorkflowTask>("render", taskId);
        if (!task) throw new DramaLabTaskError("Task not found", 404);
        const next = await cancelDramaLabWorkflow(task, input.userId, origin, cookie, projectId);
        if (!next) throw new DramaLabTaskError("The current workflow cannot be cancelled", 409);
        const view = dramaLabWorkflowTaskView(next);
        return normalizeDramaLabTask({ ...located, status: "cancelled", payload: { ...located.payload, ...next, workflow: next.workflow }, executionPhase: "cancel_requested", updatedAt: next.updatedAt, resultPayload: { workflow: view } });
    }

    if (located.type === "text") {
        const task = await getTextTask(taskId);
        if (!task) throw new DramaLabTaskError("Task not found", 404);
        if (task.storyBatch?.projectId === projectId) {
            const next = await cancelDramaLabStoryTask(task, origin, cookie, input.userId, projectId);
            if (!next) throw new DramaLabTaskError("The current story task cannot be cancelled", 409);
            cancelled = await getStoredGenerationTaskRecord("text", taskId);
        } else {
            cancelled = await cancelTextTask(task, located);
        }
    } else if (located.type === "image") {
        const task = await getImageTask(taskId);
        if (!task) throw new DramaLabTaskError("Task not found", 404);
        cancelled = await cancelImageTask(task, located);
    } else if (located.type === "video") {
        const task = await getVideoTask(taskId);
        if (!task) throw new DramaLabTaskError("Task not found", 404);
        cancelled = await cancelVideoTask(task, located);
    } else {
        const task = await getAudioTask(taskId);
        if (!task) throw new DramaLabTaskError("Task not found", 404);
        cancelled = await cancelAudioTask(task, located);
    }
    if (!cancelled) {
        // A second cancellation request can lose the compare-and-swap race
        // with the first request. Re-read once and return the durable result
        // when the winner already recorded cancellation.
        const observed = await getStoredGenerationTaskRecord(located.type, taskId);
        if (observed && ownerIds.includes(observed.userId) && isProjectTask(observed, projectId, ownerIds) && observed.status === "cancelled" && isCancellationPhase(observed.executionPhase)) {
            return normalizeDramaLabTask(observed);
        }
        throw new DramaLabTaskError("The current task cannot be cancelled", 409);
    }
    void runGenerationTaskRecoveryBatch({ origin, cookie, limit: 1, taskIds: [taskId] }).catch(() => undefined);
    return normalizeDramaLabTask(cancelled);
}

export async function recheckDramaLabTask(input: { userId: string; projectId: string; taskId: string; origin: string; cookie?: string }) {
    const projectId = clean(input.projectId);
    const taskId = clean(input.taskId);
    if (!projectId || !taskId) throw new DramaLabTaskError("Task coordinates are incomplete", 400);
    const resolved = await resolveDramaLabProjectForRequest(input.userId, projectId);
    if (!resolved?.project) throw new DramaLabTaskError("Drama project not found", 404);
    const ownerIds = await taskOwnerIds(input.userId, resolved.ownerUserId, projectId);
    const located = await findTaskRecord(taskId, ownerIds, projectId);
    if (!located) throw new DramaLabTaskError("Task not found", 404);
    if (!located.upstreamTaskId) throw new DramaLabTaskError("This task has no upstream task ID and cannot be rechecked", 409);
    if (!isRecheckableStatus(located.status, located.executionPhase)) throw new DramaLabTaskError("Only an active task can be rechecked", 409);
    const scheduled = await scheduleGenerationTask(located.type, located.id, { executionPhase: "polling", nextPollAt: Date.now(), upstreamTaskId: located.upstreamTaskId });
    if (!scheduled) throw new DramaLabTaskError("Task status changed; refresh and try again", 409);
    void runGenerationTaskRecoveryBatch({ origin: input.origin, cookie: input.cookie, limit: 1, taskIds: [taskId], userRequested: true }).catch(() => undefined);
    const refreshed = await getStoredGenerationTaskRecord(located.type, taskId);
    return refreshed ? normalizeDramaLabTask(refreshed) : normalizeDramaLabTask({ ...located, executionPhase: "polling", nextPollAt: Date.now() });
}

export async function retryDramaLabTask(input: { userId: string; projectId: string; taskId: string; origin: string; cookie?: string }) {
    const projectId = clean(input.projectId);
    const taskId = clean(input.taskId);
    if (!projectId || !taskId) throw new DramaLabTaskError("Task coordinates are incomplete", 400);
    const resolved = await resolveDramaLabProjectForRequest(input.userId, projectId);
    if (!resolved?.project) throw new DramaLabTaskError("Drama project not found", 404);
    const ownerIds = await taskOwnerIds(input.userId, resolved.ownerUserId, projectId);
    const located = await findTaskRecord(taskId, ownerIds, projectId);
    if (!located) throw new DramaLabTaskError("Task not found", 404);
    if (located.type !== "render") throw new DramaLabTaskError("单个媒体任务请在对应工作台重试", 409);
    if (!isRetryableWorkflowStatus(located.status)) throw new DramaLabTaskError("Only a failed workflow can be retried", 409);
    const task = await getStoredGenerationTask<DramaLabWorkflowTask>("render", taskId);
    if (!task) throw new DramaLabTaskError("Task not found", 404);
    const resumed = await resumeDramaLabWorkflow(task, input.userId, projectId);
    if (!resumed) throw new DramaLabTaskError("Workflow status changed; refresh and try again", 409);
    const refreshed = await getStoredGenerationTaskRecord("render", taskId);
    return refreshed ? normalizeDramaLabTask(refreshed) : normalizeDramaLabTask({ ...located, status: "pending", executionPhase: "created", updatedAt: Date.now() });
}

export function normalizeDramaLabTask(record: StoredGenerationTaskRecord): DramaLabTaskView {
    const payload = object(record.payload);
    const nested = object(payload.context);
    const workflow = object(payload.workflow);
    const storyBatch = object(payload.storyBatch);
    const projectId = firstText(record.projectId, payload.projectId, nested.projectId, workflow.projectId, storyBatch.projectId) || "";
    const episodeId = firstText(record.episodeId, payload.episodeId, nested.episodeId, workflow.episodeId, storyBatch.sourceEpisodeId);
    const shotId = firstText(record.shotId, payload.shotId, nested.shotId);
    const progress = taskProgress(record, payload, workflow, storyBatch);
    const status = effectiveDramaTaskStatus(record);
    const error = firstText(payload.error, workflow.error, storyBatch.error, record.lastUpstreamStatus === "error" ? record.lastUpstreamStatus : undefined);
    const taskType = isDramaTaskType(record.type) ? record.type : "render";
    const title = firstText(payload.title, workflow.title) || defaultTaskTitle(taskType);
    return {
        id: record.id,
        taskType,
        status,
        executionPhase: record.executionPhase,
        projectId,
        episodeId,
        shotId,
        progress,
        currentStep: firstText(payload.currentStep, workflow.steps && currentWorkflowStep(workflow), storyBatch.status, record.executionPhase),
        error,
        canCancel: isActiveStatus(status, record.executionPhase),
        canRetry: record.type === "render" && isRetryableWorkflowStatus(status),
        canRecheck: Boolean(record.upstreamTaskId) && isRecheckableStatus(status, record.executionPhase),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        title,
    };
}

async function readProjectTaskRecords(ownerIds: string[], projectId: string) {
    const [indexedResults, legacyResults] = await Promise.all([
        Promise.all(ownerIds.flatMap((userId) => TASK_TYPES.map((type) => listStoredGenerationTaskRecords({ userId, type, surface: "drama", projectId, page: 1, pageSize: 100, includeAll: true })))),
        Promise.all(ownerIds.map((userId) => listStoredDramaProjectTaskRecords({ userId, projectId, types: [...TASK_TYPES], limit: 500 }))),
    ]);
    const byId = new Map<string, StoredGenerationTaskRecord>();
    for (const result of indexedResults) for (const record of result.items) if (!byId.has(record.id)) byId.set(record.id, record);
    for (const records of legacyResults) for (const record of records) if (!byId.has(record.id)) byId.set(record.id, record);
    return Array.from(byId.values());
}

async function findTaskRecord(taskId: string, ownerIds: string[], projectId: string) {
    for (const type of TASK_TYPES) {
        const record = await getStoredGenerationTaskRecord(type, taskId);
        if (!record || isSyntheticWorkflowChild(record) || !ownerIds.includes(record.userId) || !isProjectTask(record, projectId, ownerIds)) continue;
        return record;
    }
    return null;
}

async function taskOwnerIds(userId: string, ownerUserId: string, projectId: string) {
    const ids = new Set([clean(userId), clean(ownerUserId)].filter(Boolean));
    try {
        const overview = await getDramaLabCollaborationForUser(userId, projectId);
        for (const member of overview.members) if (member.status === "active") ids.add(member.userId);
    } catch {
        // The project resolver already performed authorization. Legacy projects
        // without a collaboration row still expose their owner's tasks.
    }
    return Array.from(ids);
}

function isProjectTask(record: StoredGenerationTaskRecord, projectId: string, ownerIds: string[]) {
    if (!ownerIds.includes(record.userId)) return false;
    const payload = object(record.payload);
    const nested = object(payload.context);
    const sources = [record.surface, payload.surface, nested.surface].filter((value): value is string => Boolean(value));
    const projectSources = [record.projectId, payload.projectId, nested.projectId, object(payload.workflow).projectId, object(payload.storyBatch).projectId].filter((value): value is string => Boolean(value));
    return sources.length > 0 && sources.every((value) => value === "drama") && projectSources.length > 0 && projectSources.every((value) => value === projectId);
}

async function cancelTextTask(task: TextTask, record: StoredGenerationTaskRecord) {
    const target = {
        type: "text" as const,
        taskId: task.id,
        userId: task.userId,
        executionPhase: record.executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        executionProfile: task.executionProfile,
        billingContext: task.billingContext,
        config: task.config,
    };
    const next = await transitionTextTask(task, ["pending", "running"], { status: "cancelled", error: "Task cancelled" }, cancellationExecutionPatch(target));
    return next ? getStoredGenerationTaskRecord("text", task.id) : null;
}

async function cancelImageTask(task: ImageTask, record: StoredGenerationTaskRecord) {
    const target = {
        type: "image" as const,
        taskId: task.id,
        userId: task.userId,
        executionPhase: record.executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        executionProfile: task.executionProfile,
        billingContext: task.billingContext,
        config: task.config,
    };
    const next = await transitionImageTask(task, ["pending", "running"], { status: "cancelled", error: "Task cancelled", retryable: false }, cancellationExecutionPatch(target));
    return next ? getStoredGenerationTaskRecord("image", task.id) : null;
}

async function cancelVideoTask(task: VideoTask, record: StoredGenerationTaskRecord) {
    const target = {
        type: "video" as const,
        taskId: task.id,
        userId: task.userId,
        executionPhase: record.executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        executionProfile: task.executionProfile,
        billingContext: task.billingContext,
        config: task.config,
    };
    const next = await transitionVideoTask(task, { status: "cancelled", error: "Task cancelled", retryable: false }, cancellationExecutionPatch(target));
    return next ? getStoredGenerationTaskRecord("video", task.id) : null;
}

async function cancelAudioTask(task: AudioTask, record: StoredGenerationTaskRecord) {
    const target = {
        type: "audio" as const,
        taskId: task.id,
        userId: task.userId,
        executionPhase: record.executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        executionProfile: task.executionProfile,
        billingContext: task.billingContext,
        config: task.config,
    };
    const next = await transitionAudioTask(task, ["pending", "running"], { status: "cancelled", error: "Task cancelled", billing: task.billing }, cancellationExecutionPatch(target));
    return next ? getStoredGenerationTaskRecord("audio", task.id) : null;
}

function normalizeListStatus(value: string | undefined): TaskListStatus {
    const normalized = value?.trim().toLowerCase();
    if (!normalized || normalized === "active") return "active";
    if (normalized === "visible") return "visible";
    if (normalized === "terminal" || normalized === "completed") return "terminal";
    if (normalized === "all") return "all";
    if (["pending", "running", "success", "error", "paused", "cancelled"].includes(normalized)) return normalized as DramaTaskStatus;
    return "active";
}

function matchesStatus(status: DramaTaskStatus, filter: TaskListStatus, executionPhase?: StoredGenerationTaskRecord["executionPhase"]) {
    if (filter === "active") return isActiveStatus(status, executionPhase);
    if (filter === "visible") return isActiveStatus(status, executionPhase) || isReviewExecutionPhase(executionPhase) || (status === "error" && isRetryableWorkflowStatus(status));
    if (filter === "terminal") return !isActiveStatus(status, executionPhase);
    if (filter === "all") return true;
    if (filter === "pending" || filter === "running") return status === filter && isActiveStatus(status, executionPhase);
    return status === filter;
}

function isActiveStatus(status: string, executionPhase?: StoredGenerationTaskRecord["executionPhase"]): status is "pending" | "running" {
    return (status === "pending" || status === "running") && !isReviewExecutionPhase(executionPhase);
}

function isRecheckableStatus(status: string, executionPhase?: StoredGenerationTaskRecord["executionPhase"]) {
    return (status === "pending" || status === "running") && !isCancellationPhase(executionPhase) && executionPhase !== "completed";
}

function isRetryableWorkflowStatus(status: string) {
    return status === "error" || status === "cancelled";
}

function isActiveTaskView(task: DramaLabTaskView) {
    return isActiveStatus(task.status, task.executionPhase);
}

function isReviewExecutionPhase(value: StoredGenerationTaskRecord["executionPhase"] | undefined) {
    return value === "needs_review" || value === "review_pending" || value === "reviewing" || value === "review_unavailable";
}

function isSyntheticWorkflowChild(record: StoredGenerationTaskRecord) {
    if (record.type !== "render") return false;
    const payload = object(record.payload);
    const parentTaskId = firstText(record.parentTaskId, payload.parentTaskId);
    const child = object(payload.workflowChild);
    return Boolean(parentTaskId && (typeof child.id === "string" || typeof child.key === "string"));
}

function effectiveDramaTaskStatus(record: StoredGenerationTaskRecord): DramaTaskStatus {
    if (record.type !== "text") return record.status;
    const storyStatus = object(object(record.payload).storyBatch).status;
    if (storyStatus === "completed") return "success";
    if (storyStatus === "error") return "error";
    if (storyStatus === "cancelled") return "cancelled";
    // Text generation reaches platform success before its generated episodes
    // are materialized. Treat that persistence window as an active task.
    if ((storyStatus === "pending" || storyStatus === "persisting") && record.status === "success") return "running";
    return record.status;
}

function isCancellationPhase(value: StoredGenerationTaskRecord["executionPhase"]) {
    return value === "cancel_requested" || value === "cancel_polling";
}

function taskProgress(record: StoredGenerationTaskRecord, payload: Record<string, unknown>, workflow: Record<string, unknown>, storyBatch: Record<string, unknown>) {
    const direct = finiteProgress(payload.progress);
    if (direct !== undefined) return direct;
    const persisted = Number(storyBatch.persistedEpisodeCount ?? (Array.isArray(storyBatch.persistedEpisodeIndexes) ? storyBatch.persistedEpisodeIndexes.length : NaN));
    const episodes = Number(storyBatch.episodeCount);
    if (Number.isFinite(persisted) && Number.isFinite(episodes) && episodes > 0) return Math.round(Math.min(1, Math.max(0, persisted / episodes)) * 100);
    const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    if (steps.length) return Math.round((steps.filter((step) => ["success", "skipped"].includes(object(step).status as string)).length / steps.length) * 100);
    return record.status === "success" ? 100 : null;
}

function currentWorkflowStep(workflow: Record<string, unknown>) {
    const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    const index = Number(workflow.currentStepIndex);
    const step = Number.isInteger(index) && index >= 0 ? object(steps[index]) : {};
    return firstText(step.key, step.label);
}

function defaultTaskTitle(type: DramaTaskType) {
    return type === "text" ? "Text generation" : type === "image" ? "Image generation" : type === "video" ? "Video generation" : type === "audio" ? "Audio generation" : "Drama workflow";
}

function isDramaTaskType(value: StoredGenerationTaskRecord["type"]): value is DramaTaskType {
    return (TASK_TYPES as readonly string[]).includes(value);
}

function finiteProgress(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number) : undefined;
}

function firstText(...values: unknown[]) {
    return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function clean(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
