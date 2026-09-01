import { randomUUID } from "node:crypto";

import { createStoredGenerationTask, getStoredGenerationTask, updateStoredGenerationTask } from "@/lib/server/generation-task-store";
import type { GenerationTaskStatus, GenerationTaskType } from "@/lib/server/generation-task-types";

export type AdminWorkflowTestRecord = {
    id: string;
    userId: string;
    workflowKey: string;
    workflowVersion: number;
    upstreamWorkflowId: string;
    businessCode: string;
    type: GenerationTaskType;
    status: GenerationTaskStatus;
    taskId?: string;
    resultUrl?: string;
    resultText?: string;
    error?: string;
    createdAt: number;
    updatedAt: number;
    durationMs?: number;
    taskOrigin: "admin-workflow-test";
};

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createAdminWorkflowTest(input: Omit<AdminWorkflowTestRecord, "id" | "createdAt" | "updatedAt" | "taskOrigin"> & { id?: string }) {
    const now = Date.now();
    const record: AdminWorkflowTestRecord = { ...input, id: input.id || randomUUID(), createdAt: now, updatedAt: now, taskOrigin: "admin-workflow-test" };
    await createStoredGenerationTask(record.type, record, TTL_MS);
    return record;
}

export async function getAdminWorkflowTest(type: GenerationTaskType, id: string, userId: string) {
    const record = await getStoredGenerationTask<AdminWorkflowTestRecord>(type, id);
    if (!record || record.userId !== userId || record.taskOrigin !== "admin-workflow-test") return null;
    return record;
}

export async function updateAdminWorkflowTest(record: AdminWorkflowTestRecord) {
    const next = { ...record, updatedAt: Date.now(), durationMs: record.durationMs ?? Math.max(0, Date.now() - record.createdAt) };
    await updateStoredGenerationTask(next.type, next, TTL_MS);
    return next;
}
