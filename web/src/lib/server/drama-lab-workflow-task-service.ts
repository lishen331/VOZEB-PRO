import { randomUUID } from "node:crypto";

import type { DramaCharacter, DramaProject, DramaProp, DramaScene, DramaShot } from "@/lib/drama-project-contract";
import { getDramaProject, updateDramaProject } from "@/lib/server/drama-project-store";
import { assertDramaLabStageAllowed, getDramaLabCollaborationForUser, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { extractDramaLabAssets, type DramaLabAssetType } from "@/lib/server/drama-lab-asset-extraction-service";
import { extractDramaLabStoryboards } from "@/lib/server/drama-lab-storyboard-extraction-service";
import { createStoredGenerationTask, getStoredGenerationTask, getStoredGenerationTaskByRequest, linkStoredGenerationTask, mutateStoredGenerationTask, queryStoredGenerationTasks } from "@/lib/server/generation-task-store";
import { getImageTask } from "@/lib/server/image-task-store";
import { getVideoTask } from "@/lib/server/video-task-store";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { maintenanceWorkerContextHeaders } from "@/lib/server/maintenance-auth";
import { reviewDramaLabWorkflowOutputs } from "@/lib/server/drama-lab-workflow-review-service";
import { exportDramaLabProjectForUser } from "@/lib/server/drama-lab-project-archive";
import { readDramaLabWorkflowExportArtifact, writeDramaLabWorkflowExportArtifact } from "@/lib/server/drama-lab-workflow-export-artifact";
import type { DramaLabWorkflowChild, DramaLabWorkflowMode, DramaLabWorkflowOptions, DramaLabWorkflowState, DramaLabWorkflowStep, DramaLabWorkflowStepKey, DramaLabWorkflowStatus, DramaLabWorkflowTask, DramaLabWorkflowTaskView } from "@/lib/server/drama-lab-workflow-task-types";

const WORKFLOW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ADVANCE_ITERATIONS = 16;
const workflowLocks = new Map<string, Promise<void>>();

export class DramaLabWorkflowError extends Error {
    constructor(message: string, readonly status = 502) {
        super(message);
        this.name = "DramaLabWorkflowError";
    }
}

export type StartDramaLabWorkflowInput = {
    userId: string;
    projectId: string;
    sourceEpisodeId: string;
    requestId: string;
    options: Partial<DramaLabWorkflowOptions>;
    origin?: string;
    cookie?: string;
};

export type AdvanceDramaLabWorkflowInput = {
    userId: string;
    taskId: string;
    origin?: string;
    cookie?: string;
};

export async function startDramaLabWorkflow(input: StartDramaLabWorkflowInput) {
    const projectId = input.projectId.trim();
    const sourceEpisodeId = input.sourceEpisodeId.trim();
    const requestId = input.requestId.trim().slice(0, 160);
    if (!projectId || !sourceEpisodeId || !requestId) throw new DramaLabWorkflowError("Workflow parameters are incomplete", 400);

    const { project, ownerUserId } = await resolveDramaLabProjectForRequest(input.userId, projectId);
    if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
    if (!project.episodes.some((episode) => episode.id === sourceEpisodeId)) throw new DramaLabWorkflowError("Episode not found", 400);

    const taskOwnerIds = workflowTaskOwnerIds(input.userId, ownerUserId);
    const existingCandidates = await Promise.all(taskOwnerIds.map((taskOwnerId) => getStoredGenerationTaskByRequest<DramaLabWorkflowTask>("render", taskOwnerId, requestId)));
    const existing = existingCandidates.find((candidate) => candidate?.workflow?.projectId === projectId) || existingCandidates.find(Boolean);
    if (existing?.workflow?.projectId === projectId) return existing;
    if (existing) throw new DramaLabWorkflowError("Request id is already used by another workflow", 409);

    const active = await queryWorkflowTasksForProject(input.userId, projectId, ownerUserId);
    const activeTask = active.find((task) => task.workflow?.projectId === projectId && ["pending", "running"].includes(task.status));
    if (activeTask) return activeTask;

    const options = normalizeOptions(input.options, project);
    const episodeIds = options.scope === "all" ? project.episodes.map((episode) => episode.id) : [sourceEpisodeId];
    const steps = createSteps(options.mode, options.autoExport);
    const now = Date.now();
    const workflow: DramaLabWorkflowState = {
        version: 1,
        projectId,
        sourceEpisodeId,
        episodeIds,
        options,
        steps,
        children: [],
        currentStepIndex: 0,
        inputSnapshot: projectSnapshot(project, episodeIds),
        outputRefs: [],
        startedAt: now,
    };
    const task: DramaLabWorkflowTask = {
        id: randomUUID(),
        userId: input.userId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        title: `${project.title} workflow`,
        surface: "drama",
        projectId,
        episodeId: sourceEpisodeId,
        clientRequestId: requestId,
        workflow,
    };
    const created = await createStoredGenerationTask("render", task, WORKFLOW_TTL_MS);
    await linkStoredGenerationTask("render", created.id, {
        surface: "drama",
        projectId,
        episodeId: sourceEpisodeId,
        clientRequestId: requestId,
    });
    // Make the parent visible to the shared worker even when the browser is
    // closed immediately after starting the run.
    await scheduleGenerationTask("render", created.id, { executionPhase: "created", nextPollAt: now });
    return created;
}

export async function getDramaLabWorkflowTask(taskId: string, userId: string, projectId?: string) {
    const task = await getStoredGenerationTask<DramaLabWorkflowTask>("render", taskId.trim());
    if (!task) return null;
    const taskProjectId = task.workflow?.projectId || task.projectId || "";
    if (!taskProjectId || (projectId && taskProjectId !== projectId)) return null;
    if (!(await resolveWorkflowTaskAccess(userId, taskProjectId))) return null;
    return task;
}

export async function findActiveDramaLabWorkflow(userId: string, projectId: string) {
    const { ownerUserId } = await resolveDramaLabProjectForRequest(userId, projectId);
    const tasks = await queryWorkflowTasksForProject(userId, projectId, ownerUserId);
    return tasks.find((task) => task.workflow?.projectId === projectId) || null;
}

export async function advanceDramaLabWorkflow(input: AdvanceDramaLabWorkflowInput) {
    const existing = await getDramaLabWorkflowTask(input.taskId, input.userId);
    if (!existing) return null;
    return withWorkflowLock(existing.id, async () => {
        let task = (await getDramaLabWorkflowTask(input.taskId, input.userId)) || existing;
        if (isTerminal(task.status)) return task;
        for (let iteration = 0; iteration < MAX_ADVANCE_ITERATIONS; iteration += 1) {
            task = (await getDramaLabWorkflowTask(input.taskId, input.userId)) || task;
            if (isTerminal(task.status)) return task;
            const step = task.workflow.steps[task.workflow.currentStepIndex];
            if (!step) return markWorkflowSuccess(task);

            if (step.status === "pending") {
                task = (await patchWorkflow(task, (workflow) => {
                    const next = cloneWorkflow(workflow);
                    next.steps[next.currentStepIndex] = { ...next.steps[next.currentStepIndex], status: "running", attempts: next.steps[next.currentStepIndex].attempts + 1, startedAt: Date.now() };
                    return { status: "running", workflow: next, error: undefined };
                })) || task;
                continue;
            }
            if (step.status === "error" || step.status === "cancelled") return task;

            try {
                const result = await executeWorkflowStep(task, step, input);
                if (result === "pending") return (await getDramaLabWorkflowTask(input.taskId, input.userId)) || task;
                task = (await completeWorkflowStep(task, step.key)) || task;
            } catch (error) {
                const message = error instanceof Error ? error.message : "Workflow step failed";
                task = (await failWorkflowStep(task, step.key, message)) || task;
                return task;
            }
        }
        return (await getDramaLabWorkflowTask(input.taskId, input.userId)) || task;
    });
}

export async function cancelDramaLabWorkflow(task: DramaLabWorkflowTask, userId: string, origin?: string, cookie?: string, projectId?: string) {
    const taskProjectId = projectId || task.workflow?.projectId || task.projectId || "";
    if (!taskProjectId || !(await resolveWorkflowTaskAccess(userId, taskProjectId))) return null;
    if (isTerminal(task.status)) return task;
    if (origin) {
        await Promise.all(
            task.workflow.children
                .filter((child) => (child.type === "image" || child.type === "video") && (child.status === "pending" || child.status === "running"))
                .map(async (child) => {
                    const path = child.type === "image" ? `/api/image-tasks/${encodeURIComponent(child.id)}` : `/api/video-tasks/${encodeURIComponent(child.id)}`;
                    const workerHeaders = cookie ? maintenanceWorkerContextHeaders(cookie) : null;
                    await fetch(new URL(path, origin), {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", cookie: cookie || "", ...(workerHeaders || {}) },
                        body: JSON.stringify(child.type === "image" ? { status: "cancelled" } : { action: "cancel" }),
                    }).catch(() => undefined);
                }),
        );
    }
    return patchWorkflow(task, (workflow) => {
        const next = cloneWorkflow(workflow);
        next.steps = next.steps.map((step) => (step.status === "running" || step.status === "pending" ? { ...step, status: "cancelled" as const } : step));
        next.children = next.children.map((child) => (child.status === "pending" || child.status === "running" ? { ...child, status: "cancelled" as const, updatedAt: Date.now() } : child));
        return { status: "cancelled", workflow: next, error: "Workflow cancelled" };
    });
}

export async function resumeDramaLabWorkflow(task: DramaLabWorkflowTask, userId: string, projectId?: string) {
    const taskProjectId = projectId || task.workflow?.projectId || task.projectId || "";
    if (!taskProjectId || !(await resolveWorkflowTaskAccess(userId, taskProjectId))) return null;
    if (!["error", "cancelled"].includes(task.status)) return task;
    const resumed = await patchWorkflow(task, (workflow) => {
        const next = cloneWorkflow(workflow);
        const failed = next.steps.findIndex((step) => step.status === "error" || step.status === "cancelled");
        const index = failed >= 0 ? failed : Math.min(next.currentStepIndex, next.steps.length - 1);
        if (index >= 0) next.steps[index] = { ...next.steps[index], status: "pending", error: undefined, startedAt: undefined };
        next.steps = next.steps.map((step, stepIndex) => (stepIndex > index && step.status === "running" ? { ...step, status: "pending" as const } : step));
        next.currentStepIndex = Math.max(0, index);
        return { status: "pending", workflow: next, error: undefined };
    });
    if (!resumed) return null;
    // A terminal workflow has normally had its lease closed. Re-enqueue it
    // immediately so a page refresh or browser close cannot strand the
    // resumed run before the next worker tick.
    await scheduleGenerationTask("render", resumed.id, { executionPhase: "created", nextPollAt: Date.now() });
    return resumed;
}

export function dramaLabWorkflowTaskView(task: DramaLabWorkflowTask): DramaLabWorkflowTaskView {
    const steps = task.workflow?.steps || [];
    const done = steps.filter((step) => ["success", "skipped"].includes(step.status)).length;
    const progress = steps.length ? Math.round((done / steps.length) * 100) : task.status === "success" ? 100 : 0;
    return {
        id: task.id,
        status: task.status,
        projectId: task.workflow?.projectId || task.projectId || "",
        mode: task.workflow?.options.mode || "video",
        scope: task.workflow?.options.scope || "current",
        currentStepIndex: task.workflow?.currentStepIndex || 0,
        currentStep: task.workflow?.steps?.[task.workflow.currentStepIndex]?.key,
        progress,
        steps,
        children: task.workflow?.children || [],
        outputRefs: task.workflow?.outputRefs || [],
        error: task.error || task.workflow?.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
    };
}

async function executeWorkflowStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput): Promise<"pending" | "success"> {
    if (step.key === "script") return executeScriptStep(task, step, input);
    if (step.key === "assets") return executeAssetsStep(task, step, input);
    if (step.key === "storyboard") return executeStoryboardStep(task, step, input);
    if (step.key === "video") return executeVideoStep(task, step, input);
    if (step.key === "review") return executeReviewStep(task, step, input);
    return executeExportStep(task, step, input);
}

async function executeScriptStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput): Promise<"pending" | "success"> {
    await assertDramaLabStageAllowed(input.userId, task.workflow.projectId, "script");
    const { project } = await resolveWorkflowProject(task, input.userId);
    if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
    const cursor = numberValue(step.inputSnapshot?.cursor);
    const episodeId = task.workflow.episodeIds[cursor];
    if (!episodeId) return "success";
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode?.script.trim()) throw new DramaLabWorkflowError(`Episode ${episodeId} has no script`, 400);
    const child = await ensureSyntheticChild(task, step, `script:${episodeId}`, { episodeId, scriptLength: episode.script.length });
    if (child.status === "success") {
        await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 } }));
        return cursor + 1 < task.workflow.episodeIds.length ? "pending" : "success";
    }
    await updateChild(task.id, child.id, { status: "running" });
    await updateChild(task.id, child.id, { status: "success", output: { episodeId, scriptLength: episode.script.length } });
    await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 }, outputRefs: [...current.outputRefs, { episodeId, scriptLength: episode.script.length }] }));
    return cursor + 1 < task.workflow.episodeIds.length ? "pending" : "success";
}

async function executeAssetsStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput): Promise<"pending" | "success"> {
    await assertDramaLabStageAllowed(input.userId, task.workflow.projectId, "assets");
    const cursor = numberValue(step.inputSnapshot?.cursor);
    const units = task.workflow.episodeIds.flatMap((episodeId) => ["character", "scene", "prop"].map((assetType) => ({ episodeId, assetType: assetType as DramaLabAssetType })));
    const unit = units[cursor];
    if (!unit) return "success";
    const { project, ownerUserId } = await resolveWorkflowProject(task, input.userId);
    if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
    const child = await ensureSyntheticChild(task, step, `assets:${unit.episodeId}:${unit.assetType}`, unit);
    if (child.status === "success") {
        await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 } }));
        return cursor + 1 < units.length ? "pending" : "success";
    }
    await updateChild(task.id, child.id, { status: "running" });
    const result = await extractDramaLabAssets({ userId: input.userId, origin: input.origin || "", cookie: input.cookie || "", requestId: `${task.id}:${unit.episodeId}:${unit.assetType}`, project, episodeId: unit.episodeId, assetType: unit.assetType });
    const saved = await appendAssets(ownerUserId, project, unit.assetType, result.assets);
    await updateChild(task.id, child.id, { status: "success", output: { episodeId: unit.episodeId, assetType: unit.assetType, added: result.assets.length, projectUpdatedAt: saved.updatedAt } });
    await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 }, outputRefs: [...current.outputRefs, { episodeId: unit.episodeId, assetType: unit.assetType, added: result.assets.length }] }));
    return cursor + 1 < units.length ? "pending" : "success";
}

async function executeStoryboardStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput): Promise<"pending" | "success"> {
    const phase = step.inputSnapshot?.phase === "images" ? "images" : "extract";
    if (phase === "extract") {
        await assertDramaLabStageAllowed(input.userId, task.workflow.projectId, "storyboard");
        const cursor = numberValue(step.inputSnapshot?.cursor);
        const episodeId = task.workflow.episodeIds[cursor];
        if (!episodeId) {
            await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, phase: "images", cursor: 0 } }));
            return "pending";
        }
        const { project, ownerUserId } = await resolveWorkflowProject(task, input.userId);
        if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
        const child = await ensureSyntheticChild(task, step, `storyboard:${episodeId}`, { episodeId, existingShotCount: project.episodes.find((item) => item.id === episodeId)?.shots.length || 0 });
        if (child.status === "success") {
            await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 } }));
            return cursor + 1 < task.workflow.episodeIds.length ? "pending" : "pending";
        }
        await updateChild(task.id, child.id, { status: "running" });
        let latest: DramaProject = project as DramaProject;
        const result = await extractDramaLabStoryboards({
            userId: input.userId,
            origin: input.origin || "",
            cookie: input.cookie || "",
            requestId: `${task.id}:storyboard:${episodeId}`,
            project,
            episodeId,
            resumeShots: project.episodes.find((item) => item.id === episodeId)?.shots || [],
            onPartial: async (shots) => {
                latest = await persistEpisodeShots(ownerUserId, latest, episodeId, shots);
            },
        });
        latest = await persistEpisodeShots(ownerUserId, latest, episodeId, result.shots);
        await updateChild(task.id, child.id, { status: "success", output: { episodeId, shotCount: result.shots.length, truncated: result.truncated, recoveredCount: result.recoveredCount, duplicateCount: result.duplicateCount, continuationAttempts: result.continuationAttempts } });
        await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 }, outputRefs: [...current.outputRefs, { episodeId, shotCount: result.shots.length }] }));
        return cursor + 1 < task.workflow.episodeIds.length ? "pending" : "pending";
    }

    await assertDramaLabStageAllowed(input.userId, task.workflow.projectId, "storyboard_image");
    const { project, ownerUserId } = await resolveWorkflowProject(task, input.userId);
    if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
    const shots = task.workflow.episodeIds.flatMap((episodeId) => (project.episodes.find((episode) => episode.id === episodeId)?.shots || []).map((shot) => ({ episodeId, shot })));
    const cursor = numberValue(step.inputSnapshot?.imageCursor);
    const item = shots[cursor];
    if (!item) return "success";
    const result = await ensureImageTask(task, step, input, project, ownerUserId, item.episodeId, item.shot);
    if (result === "pending") return "pending";
    await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, imageCursor: cursor + 1 }, outputRefs: [...current.outputRefs, { episodeId: item.episodeId, shotId: item.shot.id, imageTaskId: result.taskId }] }));
    return cursor + 1 < shots.length ? "pending" : "success";
}

async function executeVideoStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput): Promise<"pending" | "success"> {
    await assertDramaLabStageAllowed(input.userId, task.workflow.projectId, "storyboard_video");
    const { project, ownerUserId } = await resolveWorkflowProject(task, input.userId);
    if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
    const shots = task.workflow.episodeIds.flatMap((episodeId) => (project.episodes.find((episode) => episode.id === episodeId)?.shots || []).map((shot) => ({ episodeId, shot })));
    const cursor = numberValue(step.inputSnapshot?.cursor);
    const item = shots[cursor];
    if (!item) return "success";
    const result = await ensureVideoTask(task, step, input, project, ownerUserId, item.episodeId, item.shot);
    if (result === "pending") return "pending";
    await patchStep(task.id, step.key, (current) => ({ inputSnapshot: { ...current.inputSnapshot, cursor: cursor + 1 }, outputRefs: [...current.outputRefs, { episodeId: item.episodeId, shotId: item.shot.id, videoTaskId: result.taskId } ] }));
    return cursor + 1 < shots.length ? "pending" : "success";
}

async function executeReviewStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput) {
    const { project } = await resolveWorkflowProject(task, input.userId);
    if (!project) throw new DramaLabWorkflowError("Drama project not found", 404);
    const child = await ensureSyntheticChild(task, step, "review", { projectId: task.workflow.projectId, episodeIds: task.workflow.episodeIds });
    const previousReview = child.output?.review;
    // A passed review is immutable for this workflow attempt. Failed or
    // unavailable reviews are deliberately retried when the workflow resumes.
    if (previousReview && typeof previousReview === "object" && (previousReview as { status?: unknown }).status === "passed" && child.status === "success") {
        await patchStep(task.id, step.key, (current) => ({ outputRefs: [{ review: previousReview }, ...current.outputRefs.filter((item) => !item.review)] }));
        return "success" as const;
    }
    await updateChild(task.id, child.id, { status: "running", error: undefined });
    const result = await reviewDramaLabWorkflowOutputs({ userId: input.userId, project, episodeIds: task.workflow.episodeIds, origin: input.origin || "", cookie: input.cookie || "" });
    const review = result.review;
    const output = { review, taskIds: result.taskIds, reviewedAt: new Date().toISOString(), projectId: task.workflow.projectId, episodeIds: task.workflow.episodeIds };
    if (review.status === "unavailable") {
        await updateChild(task.id, child.id, { status: "error", error: review.summary, output });
        await patchStep(task.id, step.key, (current) => ({ outputRefs: [{ review }, ...current.outputRefs.filter((item) => !item.review)], error: review.summary }));
        throw new DramaLabWorkflowError(review.summary, 503);
    }
    // A review that requests changes is a failed workflow attempt. Keep the
    // structured review output for the UI, but mark the child as errored so
    // parent/child status cannot falsely report success while the workflow is
    // waiting for a resume after edits.
    const childStatus = review.status === "needs_revision" ? "error" : "success";
    await updateChild(task.id, child.id, { status: childStatus, error: childStatus === "error" ? review.summary : undefined, output });
    await patchStep(task.id, step.key, (current) => ({ outputRefs: [{ review }, ...current.outputRefs.filter((item) => !item.review)], error: review.status === "needs_revision" ? review.summary : undefined }));
    if (review.status === "needs_revision") throw new DramaLabWorkflowError(`内容审核未通过：${review.summary}`, 422);
    return "success" as const;
}

async function executeExportStep(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput) {
    await assertDramaLabStageAllowed(input.userId, task.workflow.projectId, "final_export");
    const { ownerUserId } = await resolveWorkflowProject(task, input.userId);
    const child = await ensureSyntheticChild(task, step, "export", { projectId: task.workflow.projectId, episodeIds: task.workflow.episodeIds, autoExport: true });
    const previousArtifactId = stringValue(child.output?.artifactId);
    if (child.status === "success" && previousArtifactId) {
        const existing = await readDramaLabWorkflowExportArtifact(previousArtifactId);
        if (existing?.metadata.projectId === task.workflow.projectId && existing.metadata.taskId === task.id) {
            await patchStep(task.id, step.key, (current) => ({ outputRefs: [{ ...existing.metadata, downloadUrl: workflowExportDownloadPath(task.workflow.projectId, existing.metadata.artifactId) }, ...current.outputRefs.filter((item) => !item.artifactId)] }));
            return "success" as const;
        }
    }
    await updateChild(task.id, child.id, { status: "running", error: undefined });
    const result = await exportDramaLabProjectForUser({ userId: input.userId, projectId: task.workflow.projectId, projectOwnerUserId: ownerUserId, origin: input.origin || "http://localhost", cookie: input.cookie || "", includeMedia: true });
    const artifact = await writeDramaLabWorkflowExportArtifact({ taskId: task.id, projectId: task.workflow.projectId, ownerUserId, fileName: result.fileName, data: result.data, mediaCount: result.mediaCount, omittedMediaCount: result.omittedMediaCount });
    const output = { ...artifact, downloadUrl: workflowExportDownloadPath(task.workflow.projectId, artifact.artifactId) };
    await updateChild(task.id, child.id, { status: "success", output });
    await patchStep(task.id, step.key, (current) => ({ outputRefs: [output, ...current.outputRefs.filter((item) => !item.artifactId)] }));
    return "success" as const;
}

function workflowExportDownloadPath(projectId: string, artifactId: string) {
    return `/api/drama-lab/projects/${encodeURIComponent(projectId)}/workflow/export/${encodeURIComponent(artifactId)}`;
}

async function ensureImageTask(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput, project: DramaProject, ownerUserId: string, episodeId: string, shot: DramaShot): Promise<{ taskId: string } | "pending"> {
    let taskId = shot.storyboardTaskId?.trim() || "";
    const previousChild = task.workflow.children.find((child) => child.id === taskId && child.key === `image:${episodeId}:${shot.id}`);
    if (previousChild?.status === "error" || previousChild?.status === "cancelled") {
        await resetFailedShotBinding(ownerUserId, project, episodeId, shot.id, "image");
        taskId = "";
    }
    if (!taskId) {
        const response = await internalJson(input, `/api/drama-lab/projects/${encodeURIComponent(task.workflow.projectId)}/shots/${encodeURIComponent(shot.id)}/generate-image?episodeId=${encodeURIComponent(episodeId)}`, "POST", { parentTaskId: task.id });
        taskId = stringValue(response?.data?.task?.id || response?.task?.id);
        if (!taskId) throw new DramaLabWorkflowError("Image task was not created", 502);
        await linkStoredGenerationTask("image", taskId, { surface: "drama", projectId: task.workflow.projectId, episodeId, shotId: shot.id, parentTaskId: task.id, runId: task.id });
        await addChild(task.id, { id: taskId, type: "image", key: `image:${episodeId}:${shot.id}`, episodeId, shotId: shot.id, status: "running", inputSnapshot: { ratio: task.workflow.options.ratio, duration: task.workflow.options.duration }, createdAt: Date.now(), updatedAt: Date.now() });
        return "pending";
    }
    const imageTask = await getImageTask(taskId);
    if (!imageTask) throw new DramaLabWorkflowError("Image task record is missing", 502);
    await assertChildContext(imageTask, [task.userId, input.userId], task.workflow.projectId, episodeId, shot.id);
    await ensureExternalChild(task, `image:${episodeId}:${shot.id}`, taskId, "image", episodeId, shot.id);
    if (imageTask.status === "pending" || imageTask.status === "running") {
        await recoverChild(input, taskId);
        await updateChild(task.id, taskId, { status: "running" });
        return "pending";
    }
    if (imageTask.status === "error" || imageTask.status === "cancelled") {
        await updateChild(task.id, taskId, { status: imageTask.status, error: imageTask.error || "Image task failed" });
        throw new DramaLabWorkflowError(imageTask.error || "Image task failed", 502);
    }
    await syncShot(input, task.workflow.projectId, episodeId, shot.id);
    await updateChild(task.id, taskId, { status: "success", output: { result: imageTask.result || {} } });
    return { taskId };
}

async function ensureVideoTask(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, input: AdvanceDramaLabWorkflowInput, project: DramaProject, ownerUserId: string, episodeId: string, shot: DramaShot): Promise<{ taskId: string } | "pending"> {
    let taskId = shot.generationTaskId?.trim() || "";
    const previousChild = task.workflow.children.find((child) => child.id === taskId && child.key === `video:${episodeId}:${shot.id}`);
    if (previousChild?.status === "error" || previousChild?.status === "cancelled") {
        await resetFailedShotBinding(ownerUserId, project, episodeId, shot.id, "video");
        taskId = "";
    }
    if (!taskId) {
        if (!shot.storyboardImageUrl && !shot.frames?.key?.url) throw new DramaLabWorkflowError(`Shot ${shot.id} has no storyboard image`, 422);
        const response = await internalJson(input, `/api/drama-lab/projects/${encodeURIComponent(task.workflow.projectId)}/shots/${encodeURIComponent(shot.id)}/generate-video?episodeId=${encodeURIComponent(episodeId)}`, "POST", { parentTaskId: task.id });
        taskId = stringValue(response?.data?.task?.id || response?.task?.id);
        if (!taskId) throw new DramaLabWorkflowError("Video task was not created", 502);
        await linkStoredGenerationTask("video", taskId, { surface: "drama", projectId: task.workflow.projectId, episodeId, shotId: shot.id, parentTaskId: task.id, runId: task.id });
        await addChild(task.id, { id: taskId, type: "video", key: `video:${episodeId}:${shot.id}`, episodeId, shotId: shot.id, status: "running", inputSnapshot: { ratio: task.workflow.options.ratio, duration: task.workflow.options.duration }, createdAt: Date.now(), updatedAt: Date.now() });
        return "pending";
    }
    const videoTask = await getVideoTask(taskId);
    if (!videoTask) throw new DramaLabWorkflowError("Video task record is missing", 502);
    await assertChildContext(videoTask, [task.userId, input.userId], task.workflow.projectId, episodeId, shot.id);
    await ensureExternalChild(task, `video:${episodeId}:${shot.id}`, taskId, "video", episodeId, shot.id);
    // A legacy/provider row can still be persisted as `pending` even though
    // the current VideoTask type normally starts at `running`. Treat both as
    // active so the workflow never advances before the child is reconciled.
    if ((videoTask.status as string) === "pending" || videoTask.status === "running") {
        await recoverChild(input, taskId);
        await updateChild(task.id, taskId, { status: "running" });
        return "pending";
    }
    if (videoTask.status === "error" || videoTask.status === "cancelled") {
        await updateChild(task.id, taskId, { status: videoTask.status, error: videoTask.error || "Video task failed" });
        throw new DramaLabWorkflowError(videoTask.error || "Video task failed", 502);
    }
    await syncShot(input, task.workflow.projectId, episodeId, shot.id);
    await updateChild(task.id, taskId, { status: "success", output: { result: videoTask.result || {} } });
    return { taskId };
}

async function recoverChild(input: AdvanceDramaLabWorkflowInput, taskId: string) {
    if (!input.origin) return;
    await runGenerationTaskRecoveryBatch({ origin: input.origin, publicOrigin: input.origin, cookie: input.cookie || "", taskIds: [taskId], limit: 1, userRequested: true }).catch(() => undefined);
}

async function syncShot(input: AdvanceDramaLabWorkflowInput, projectId: string, episodeId: string, shotId: string) {
    if (!input.origin) return;
    // A successful provider task is not a successful workflow child until its
    // result has been written back to the project shot.  Do not swallow a
    // persistence/auth/context error here: doing so marks the child `success`
    // and lets the parent advance while the UI still has no playable media.
    await internalJson(input, `/api/drama-lab/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shotId)}/sync-generation?episodeId=${encodeURIComponent(episodeId)}`, "POST");
}

async function internalJson(input: AdvanceDramaLabWorkflowInput, path: string, method: "POST", body?: Record<string, unknown>) {
    if (!input.origin) throw new DramaLabWorkflowError("Workflow origin is unavailable", 500);
    const workerHeaders = input.cookie ? maintenanceWorkerContextHeaders(input.cookie) : null;
    const response = await fetch(new URL(path, input.origin), { method, headers: { "Content-Type": "application/json", cookie: input.cookie || "", ...(workerHeaders || {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { code?: unknown; msg?: unknown; error?: unknown; data?: { task?: { id?: unknown } }; task?: { id?: unknown } };
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) throw new DramaLabWorkflowError(String(payload.msg || payload.error || `Workflow child request failed (${response.status})`), response.status >= 400 && response.status < 600 ? response.status : 502);
    return payload;
}

async function appendAssets(userId: string, project: DramaProject, assetType: DramaLabAssetType, assets: Array<DramaCharacter | DramaScene | DramaProp>) {
    if (!assets.length) return project;
    const key = assetType === "character" ? "characters" : assetType === "scene" ? "scenes" : "props";
    const current = project[key] as Array<DramaCharacter | DramaScene | DramaProp>;
    const names = new Set(current.map((item) => item.name.trim().toLocaleLowerCase()));
    const merged = [...current, ...assets.filter((item) => item?.id && item.name?.trim() && !names.has(item.name.trim().toLocaleLowerCase()))];
    if (merged.length === current.length) return project;
    const next = { ...project, [key]: merged, updatedAt: new Date().toISOString() } as DramaProject;
    try {
        return await updateDramaProject(userId, next, project.updatedAt);
    } catch (error) {
        // The store exposes optimistic concurrency conflicts with status 409.
        // Do not key recovery on localized error text: deployments may use a
        // different locale or an older translated message.
        if (!isConflictError(error)) throw error;
        const latest = await getDramaProject(project.id, userId);
        if (!latest) throw new DramaLabWorkflowError("Drama project not found", 404);
        const latestCurrent = latest[key] as Array<DramaCharacter | DramaScene | DramaProp>;
        const latestNames = new Set(latestCurrent.map((item) => item.name.trim().toLocaleLowerCase()));
        return updateDramaProject(userId, { ...latest, [key]: [...latestCurrent, ...assets.filter((item) => item?.id && item.name?.trim() && !latestNames.has(item.name.trim().toLocaleLowerCase()))], updatedAt: new Date().toISOString() } as DramaProject, latest.updatedAt);
    }
}

async function persistEpisodeShots(userId: string, project: DramaProject, episodeId: string, shots: DramaShot[]) {
    const next = { ...project, episodes: project.episodes.map((episode) => (episode.id === episodeId ? { ...episode, shots } : episode)), updatedAt: new Date().toISOString() };
    try {
        return (await updateDramaProject(userId, next, project.updatedAt)) || next;
    } catch (error) {
        if (!isConflictError(error)) throw error;
        const latest = await getDramaProject(project.id, userId);
        if (!latest) throw new DramaLabWorkflowError("Drama project not found", 404);
        return updateDramaProject(userId, { ...latest, episodes: latest.episodes.map((episode) => (episode.id === episodeId ? { ...episode, shots } : episode)), updatedAt: new Date().toISOString() }, latest.updatedAt);
    }
}

async function resetFailedShotBinding(ownerUserId: string, project: DramaProject, episodeId: string, shotId: string, kind: "image" | "video") {
    const nextEpisodes = project.episodes.map((episode) => {
        if (episode.id !== episodeId) return episode;
        return {
            ...episode,
            shots: episode.shots.map((shot) => {
                if (shot.id !== shotId) return shot;
                if (kind === "image") {
                    return { ...shot, storyboardTaskId: undefined, storyboardStatus: "idle" as const, storyboardError: undefined };
                }
                return { ...shot, generationTaskId: undefined, generationStatus: "idle" as const, generationError: undefined, generationNeedsReview: undefined };
            }),
        };
    });
    return updateDramaProject(ownerUserId, { ...project, episodes: nextEpisodes, updatedAt: new Date().toISOString() }, project.updatedAt);
}

async function ensureSyntheticChild(task: DramaLabWorkflowTask, step: DramaLabWorkflowStep, key: string, inputSnapshot: Record<string, unknown>) {
    const existing = task.workflow.children.find((child) => child.key === key);
    if (existing) return existing;

    // A process can crash after inserting the synthetic child row but before
    // denormalizing it into the parent workflow. Recover that row by its
    // parent/key tuple before creating another child; this keeps retries
    // idempotent across page requests and worker restarts.
    const persisted = await queryStoredGenerationTasks<{
        id: string;
        parentTaskId?: string;
        workflowChild?: DramaLabWorkflowChild;
    }>("render", {
        userId: task.userId,
        projectId: task.workflow.projectId,
        surface: "drama",
        limit: 100,
    });
    const recovered = persisted.find((candidate) => candidate.parentTaskId === task.id && candidate.workflowChild?.key === key)?.workflowChild;
    if (recovered) {
        await addChild(task.id, recovered);
        return recovered;
    }

    const now = Date.now();
    const child: DramaLabWorkflowChild = { id: randomUUID(), type: "render", key, status: "pending", inputSnapshot, createdAt: now, updatedAt: now };
    await createStoredGenerationTask("render", { id: child.id, userId: task.userId, status: "pending", createdAt: now, updatedAt: now, surface: "drama", projectId: task.workflow.projectId, episodeId: typeof inputSnapshot.episodeId === "string" ? inputSnapshot.episodeId : undefined, parentTaskId: task.id, runId: task.id, title: key, workflowChild: child }, WORKFLOW_TTL_MS);
    await addChild(task.id, child);
    return child;
}

async function ensureExternalChild(task: DramaLabWorkflowTask, key: string, id: string, type: "image" | "video", episodeId: string, shotId: string) {
    const existing = task.workflow.children.find((child) => child.key === key);
    if (existing) return existing;
    const now = Date.now();
    const child: DramaLabWorkflowChild = { id, type, key, episodeId, shotId, status: "running", createdAt: now, updatedAt: now };
    await addChild(task.id, child);
    return child;
}

async function assertChildContext(task: { userId?: string; surface?: string; projectId?: string; episodeId?: string; shotId?: string }, allowedUserIds: readonly string[], projectId: string, episodeId: string, shotId: string) {
    const normalizedAllowedUserIds = new Set(allowedUserIds.map((value) => value.trim()).filter(Boolean));
    if (task.userId && !normalizedAllowedUserIds.has(task.userId)) {
        // A child can have been created by another active collaborator during
        // a prior browser attempt. Keep that legitimate task addressable, but
        // reject stale tasks whose creator has left or was removed.
        try {
            await resolveDramaLabProjectForRequest(task.userId, projectId);
        } catch {
            throw new DramaLabWorkflowError("Workflow child task belongs to another user", 403);
        }
    }
    if (task.surface && task.surface !== "drama") throw new DramaLabWorkflowError("Workflow child task has an invalid surface", 409);
    if (task.projectId && task.projectId !== projectId) throw new DramaLabWorkflowError("Workflow child task belongs to another project", 409);
    if (task.episodeId && task.episodeId !== episodeId) throw new DramaLabWorkflowError("Workflow child task belongs to another episode", 409);
    if (task.shotId && task.shotId !== shotId) throw new DramaLabWorkflowError("Workflow child task belongs to another shot", 409);
}

async function addChild(taskId: string, child: DramaLabWorkflowChild) {
    await mutateStoredGenerationTask<DramaLabWorkflowTask>("render", taskId, WORKFLOW_TTL_MS, (current) => {
        if (current.workflow.children.some((item) => item.id === child.id)) return current;
        const keyed = current.workflow.children.find((item) => item.key === child.key);
        // Failed/cancelled external tasks are immutable attempts. A resumed
        // workflow gets a fresh provider task under the same logical key;
        // replace the old child so the parent cannot keep polling a dead ID.
        if (keyed && keyed.status !== "error" && keyed.status !== "cancelled") return current;
        const stepKey = childStepKey(child.key);
        const steps = current.workflow.steps.map((step) => {
            if (step.key !== stepKey) return step;
            const childTaskIds = step.childTaskIds.filter((id) => id !== keyed?.id);
            return childTaskIds.includes(child.id) ? { ...step, childTaskIds } : { ...step, childTaskIds: [...childTaskIds, child.id] };
        });
        const children = keyed ? current.workflow.children.filter((item) => item.key !== child.key) : current.workflow.children;
        return { ...current, workflow: { ...current.workflow, children: [...children, child], steps } };
    });
}

function childStepKey(key: string): DramaLabWorkflowStepKey {
    if (key.startsWith("script:")) return "script";
    if (key.startsWith("assets:")) return "assets";
    if (key.startsWith("storyboard:") || key.startsWith("image:")) return "storyboard";
    if (key.startsWith("video:")) return "video";
    if (key === "review") return "review";
    return "export";
}

async function updateChild(taskId: string, childId: string, patch: Partial<DramaLabWorkflowChild>) {
    await mutateStoredGenerationTask<DramaLabWorkflowTask>("render", taskId, WORKFLOW_TTL_MS, (current) => ({
        ...current,
        workflow: { ...current.workflow, children: current.workflow.children.map((child) => (child.id === childId ? { ...child, ...patch, updatedAt: Date.now() } : child)) },
    }));
    // Synthetic children are also first-class generation_tasks records. Keep
    // their row status in sync with the parent's denormalized workflow view.
    await mutateStoredGenerationTask<{ id: string; userId: string; status: string; createdAt: number; updatedAt: number; workflowChild?: DramaLabWorkflowChild }>("render", childId, WORKFLOW_TTL_MS, (current) => ({
        ...current,
        status: patch.status || current.status,
        updatedAt: Date.now(),
        workflowChild: current.workflowChild ? { ...current.workflowChild, ...patch, updatedAt: Date.now() } : current.workflowChild,
    }));
}

async function patchStep(taskId: string, key: DramaLabWorkflowStepKey, patcher: (step: DramaLabWorkflowStep) => Partial<DramaLabWorkflowStep>) {
    await mutateStoredGenerationTask<DramaLabWorkflowTask>("render", taskId, WORKFLOW_TTL_MS, (current) => ({
        ...current,
        workflow: (() => {
            const steps = current.workflow.steps.map((step) => (step.key === key ? { ...step, ...patcher(step) } : step));
            return { ...current.workflow, steps, outputRefs: steps.flatMap((step) => step.outputRefs).slice(-500) };
        })(),
    }));
}

async function patchWorkflow(task: DramaLabWorkflowTask, patcher: (workflow: DramaLabWorkflowState) => { status: DramaLabWorkflowStatus; workflow: DramaLabWorkflowState; error?: string }) {
    return mutateStoredGenerationTask<DramaLabWorkflowTask>("render", task.id, WORKFLOW_TTL_MS, (current) => {
        const patch = patcher(current.workflow);
        return { ...current, status: patch.status, workflow: patch.workflow, error: patch.error };
    });
}

async function completeWorkflowStep(task: DramaLabWorkflowTask, key: DramaLabWorkflowStepKey) {
    return mutateStoredGenerationTask<DramaLabWorkflowTask>("render", task.id, WORKFLOW_TTL_MS, (current) => {
        const index = current.workflow.steps.findIndex((step) => step.key === key);
        if (index < 0) return current;
        const steps = current.workflow.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, status: "success" as const, completedAt: Date.now(), error: undefined } : step));
        const nextIndex = index + 1;
        const done = nextIndex >= steps.length;
        return { ...current, status: done ? "success" : "running", workflow: { ...current.workflow, steps, currentStepIndex: nextIndex, finishedAt: done ? Date.now() : undefined }, error: undefined };
    });
}

async function failWorkflowStep(task: DramaLabWorkflowTask, key: DramaLabWorkflowStepKey, error: string) {
    return mutateStoredGenerationTask<DramaLabWorkflowTask>("render", task.id, WORKFLOW_TTL_MS, (current) => {
        const steps = current.workflow.steps.map((step) => (step.key === key ? { ...step, status: "error" as const, error, completedAt: Date.now() } : step));
        return { ...current, status: "error", error, workflow: { ...current.workflow, steps, error } };
    });
}

async function markWorkflowSuccess(task: DramaLabWorkflowTask) {
    return mutateStoredGenerationTask<DramaLabWorkflowTask>("render", task.id, WORKFLOW_TTL_MS, (current) => ({ ...current, status: "success", workflow: { ...current.workflow, finishedAt: Date.now() } }));
}

function createSteps(mode: DramaLabWorkflowMode, autoExport: boolean): DramaLabWorkflowStep[] {
    const steps: Array<[DramaLabWorkflowStepKey, string, DramaLabWorkflowStep["target"]]> = [["script", "Script validation", "script"], ["assets", "Asset extraction", "assets"]];
    if (mode !== "assets") steps.push(["storyboard", "Storyboard extraction and images", "storyboard"]);
    if (mode === "video") {
        steps.push(["video", "Shot videos", "storyboard"], ["review", "Content review", "review"]);
        if (autoExport) steps.push(["export", "Final export", "export"]);
    }
    return steps.map(([key, label, target]) => ({ key, label, target, status: "pending", outputRefs: [], childTaskIds: [], attempts: 0 }));
}

function normalizeOptions(value: Partial<DramaLabWorkflowOptions>, project: DramaProject): DramaLabWorkflowOptions {
    const mode = value.mode === "assets" || value.mode === "storyboard" || value.mode === "video" ? value.mode : "video";
    const scope = value.scope === "all" ? "all" : "current";
    return { mode, scope, ratio: text(value.ratio, project.ratio || "9:16"), duration: text(value.duration, "5"), language: text(value.language, "中文"), visualStyle: text(value.visualStyle, project.style || ""), autoExport: mode === "video" && value.autoExport === true };
}

function projectSnapshot(project: DramaProject, episodeIds: string[]) {
    return { projectId: project.id, title: project.title, ratio: project.ratio, style: project.style, episodeIds, episodes: project.episodes.filter((episode) => episodeIds.includes(episode.id)).map((episode) => ({ id: episode.id, title: episode.title, script: episode.script.slice(0, 12_000) })), assetCounts: { characters: project.characters.length, scenes: project.scenes.length, props: project.props.length } };
}

function cloneWorkflow(workflow: DramaLabWorkflowState): DramaLabWorkflowState {
    return JSON.parse(JSON.stringify(workflow)) as DramaLabWorkflowState;
}

function isTerminal(status: DramaLabWorkflowStatus) {
    return status === "success" || status === "error" || status === "cancelled";
}

function numberValue(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function text(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : fallback;
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isConflictError(error: unknown): error is Error & { status: number } {
    return error instanceof Error && (error as { status?: unknown }).status === 409;
}

/** Workflow tasks are owned by the caller, but project aggregates may be
 * stored under the collaboration group's owner. Resolve that backing owner
 * for every step so approved members can run and persist workflows safely. */
async function resolveWorkflowProject(task: DramaLabWorkflowTask, userId = task.userId) {
    try {
        return await resolveDramaLabProjectForRequest(userId, task.workflow.projectId);
    } catch (error) {
        if (error instanceof Error && "status" in error && (error as { status?: number }).status === 403) throw error;
        throw new DramaLabWorkflowError("Drama project not found", 404);
    }
}

/**
 * Resolve the task creators needed for project-scoped discovery. The task
 * store is intentionally user-keyed; caller and physical storage owner are
 * the stable identities that must always be included.
 */
function workflowTaskOwnerIds(userId: string, ownerUserId: string) {
    return Array.from(new Set([userId.trim(), ownerUserId.trim()].filter(Boolean)));
}

async function queryWorkflowTasksForProject(userId: string, projectId: string, ownerUserId: string) {
    // Generation rows remain keyed by their creator. Include every active
    // project member so a workflow started by one collaborator is discoverable
    // and resumable by the rest of the team, while membership remains the
    // authorization gate in getDramaLabWorkflowTask.
    const collaboration = await getDramaLabCollaborationForUser(userId, projectId);
    const taskOwnerIds = workflowTaskOwnerIds(userId, ownerUserId).concat(collaboration.members.map((member) => member.userId));
    const taskLists = await Promise.all(
        taskOwnerIds.map((taskOwnerId) =>
            queryStoredGenerationTasks<DramaLabWorkflowTask>("render", {
                userId: taskOwnerId,
                projectId,
                surface: "drama",
                statuses: ["pending", "running"],
                limit: 20,
            }),
        ),
    );
    const unique = new Map<string, DramaLabWorkflowTask>();
    for (const task of taskLists.flat()) {
        if (task.workflow?.projectId !== projectId) continue;
        if (!unique.has(task.id)) unique.set(task.id, task);
    }
    return Array.from(unique.values()).sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
}

/**
 * Validate both sides of the collaboration edge: the viewer must still be an
 * active project member, and the task creator must be either the viewer,
 * stable project owner, or another active member of the same project.
 */
async function resolveWorkflowTaskAccess(userId: string, projectId: string) {
    let resolved: Awaited<ReturnType<typeof resolveDramaLabProjectForRequest>>;
    try {
        resolved = await resolveDramaLabProjectForRequest(userId, projectId);
    } catch {
        return null;
    }
    if (!resolved?.project) return null;
    // Task ownership is intentionally independent from viewer identity. The
    // generation row keeps its original creator for billing/storage, while
    // project membership grants access to the project-scoped workflow.
    return resolved;
}

async function withWorkflowLock<T>(taskId: string, handler: () => Promise<T>) {
    const previous = workflowLocks.get(taskId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    const chain = previous.then(() => current);
    workflowLocks.set(taskId, chain);
    await previous;
    try {
        return await handler();
    } finally {
        release();
        if (workflowLocks.get(taskId) === chain) workflowLocks.delete(taskId);
    }
}
