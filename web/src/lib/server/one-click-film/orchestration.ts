import { createStoredGenerationTask, getStoredGenerationTask, getStoredGenerationTaskByRequest, updateStoredGenerationTask } from "@/lib/server/generation-task-store";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { advanceOneClickFilmWorkflow, cancelOneClickFilmWorkflow, createOneClickFilmWorkflow, oneClickFilmTaskView } from "./engine";
import { ONE_CLICK_FILM_SOURCE, type OneClickFilmExecutor, type OneClickFilmStartInput, type OneClickFilmTask } from "./types";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const locks = new Map<string, Promise<void>>();
export class OneClickFilmOrchestrationError extends Error {}

export async function startOneClickFilm(input: OneClickFilmStartInput) {
    const userId = input.userId.trim(),
        projectId = input.projectId.trim(),
        requestId = input.clientRequestId.trim().slice(0, 160);
    if (!userId || !projectId || !requestId) throw new OneClickFilmOrchestrationError("一键成片参数不完整");
    const existing = await getStoredGenerationTaskByRequest<OneClickFilmTask>("render", userId, requestId);
    if (existing) {
        if (existing.source !== ONE_CLICK_FILM_SOURCE || existing.projectId !== projectId) throw new OneClickFilmOrchestrationError("请求编号已用于其他任务");
        return existing;
    }
    const task = createOneClickFilmWorkflow({ ...input, userId, projectId, clientRequestId: requestId });
    await createStoredGenerationTask("render", task, TTL_MS);
    // L 的父任务在落库后立刻入调度队列，否则关闭页面后没有任何 worker 会推进它。
    await scheduleGenerationTask("render", task.id, { executionPhase: "created", nextPollAt: Date.now() });
    return task;
}
export async function getOneClickFilmTask(taskId: string, userId: string, projectId?: string) {
    const t = await getStoredGenerationTask<OneClickFilmTask>("render", taskId.trim());
    return !t || t.userId !== userId || t.source !== ONE_CLICK_FILM_SOURCE || (projectId && t.projectId !== projectId) ? null : t;
}
export async function advanceOneClickFilm(taskId: string, userId: string, executor: OneClickFilmExecutor) {
    const found = await getOneClickFilmTask(taskId, userId);
    if (!found) return null;
    return withLock(found.id, async () => {
        const current = (await getOneClickFilmTask(found.id, userId)) || found;
        let next: OneClickFilmTask;
        try {
            next = await advanceOneClickFilmWorkflow(structuredClone(current), executor);
        } catch (error) {
            const message = error instanceof Error ? error.message : "一键成片步骤失败";
            next = structuredClone(current);
            next.status = "error";
            next.error = message;
            next.workflow.error = message;
            const index = next.workflow.currentStepIndex;
            if (next.workflow.steps[index]) next.workflow.steps[index] = { ...next.workflow.steps[index], status: "error", error: message };
            next.updatedAt = Date.now();
        }
        await updateStoredGenerationTask("render", next, TTL_MS);
        return next;
    });
}
export async function cancelOneClickFilm(taskId: string, userId: string) {
    const t = await getOneClickFilmTask(taskId, userId);
    if (!t) return null;
    const next = cancelOneClickFilmWorkflow(structuredClone(t));
    await updateStoredGenerationTask("render", next, TTL_MS);
    return next;
}
export async function retryOneClickFilm(taskId: string, userId: string) {
    const t = await getOneClickFilmTask(taskId, userId);
    if (!t || !(t.status === "error" || t.status === "cancelled")) return t;
    const next = structuredClone(t);
    const failed = next.workflow.steps.findIndex((s) => s.status === "error" || s.status === "cancelled");
    const index = failed < 0 ? next.workflow.currentStepIndex : failed;
    next.status = "pending";
    next.error = undefined;
    next.workflow.error = undefined;
    next.workflow.currentStepIndex = Math.max(0, index);
    next.workflow.steps = next.workflow.steps.map((s, i) => (i >= index && (s.status === "error" || s.status === "cancelled") ? { ...s, status: "pending", error: undefined, startedAt: undefined } : s));
    next.updatedAt = Date.now();
    await updateStoredGenerationTask("render", next, TTL_MS);
    await scheduleGenerationTask("render", next.id, { executionPhase: "created", nextPollAt: Date.now() });
    return next;
}
export const resumeOneClickFilm = retryOneClickFilm;

export { oneClickFilmTaskView };
async function withLock<T>(id: string, fn: () => Promise<T>) {
    const previous = locks.get(id) || Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    locks.set(id, current);
    await previous;
    try {
        return await fn();
    } finally {
        release();
        if (locks.get(id) === current) locks.delete(id);
    }
}
