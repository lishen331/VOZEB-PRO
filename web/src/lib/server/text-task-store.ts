import { randomUUID } from "node:crypto";

import type { LogicalModelCapabilityProfile, SystemChannelAdvancedConfig } from "@/lib/auth/store";
import type { AiTextMessage } from "@/types/ai";
import { createStoredGenerationTask, getStoredGenerationTask, mutateStoredGenerationTask, touchStoredGenerationTask, transitionStoredGenerationTask, type GenerationTaskContext } from "@/lib/server/generation-task-store";
import type { GenerationAttempt } from "@/lib/server/generation-attempt";
import { GENERATION_TASK_RETENTION_MS } from "@/lib/server/generation-task-retention";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
import type { StoredTaskBilling } from "@/lib/server/generation-task-types";
import type { DramaStoryBatch } from "@/lib/server/drama-lab-story-task-types";

type TextTaskStatus = "pending" | "running" | "success" | "error" | "cancelled";

export type TextTaskConfig = {
    executionProfile?: PracticeExecutionProfile;
    apiSource?: "system" | "custom";
    baseUrl: string;
    apiKey: string;
    apiFormat: "openai" | "gemini";
    model: string;
    channelId?: string;
    logicalModel?: string;
    capabilityProfile?: LogicalModelCapabilityProfile;
    advancedConfig?: SystemChannelAdvancedConfig;
    systemPrompt?: string;
};

export type TextTask = GenerationTaskContext & {
    id: string;
    userId: string;
    status: TextTaskStatus;
    createdAt: number;
    updatedAt: number;
    config: TextTaskConfig;
    messages: AiTextMessage[];
    result?: { content: string };
    upstream?: { id: string; createPath: string };
    billing?: StoredTaskBilling;
    error?: string;
    pointsRemaining?: number;
    candidateConfigs?: TextTaskConfig[];
    attempts?: GenerationAttempt[];
    attemptNo?: number;
    storyBatch?: DramaStoryBatch;
};

export async function createTextTask(input: Omit<TextTask, "id" | "status" | "createdAt" | "updatedAt">) {
    const now = Date.now();
    const task: TextTask = {
        ...input,
        config: { ...input.config, executionProfile: input.executionProfile || input.config.executionProfile },
        id: randomUUID(),
        status: "pending",
        createdAt: now,
        updatedAt: now,
    };
    return createStoredGenerationTask("text", task, GENERATION_TASK_RETENTION_MS);
}

export async function getTextTask(id: string) {
    return getStoredGenerationTask<TextTask>("text", id);
}

export function transitionTextTask(
    task: TextTask,
    allowedStatuses: TextTaskStatus[],
    patch: Partial<Pick<TextTask, "config" | "messages" | "result" | "error" | "pointsRemaining" | "upstream" | "billing" | "storyBatch">> & { status: TextTaskStatus },
    executionPatch?: import("@/lib/server/generation-task-scheduler").GenerationTaskSchedulePatch,
) {
    return transitionStoredGenerationTask<TextTask>("text", task.id, task.userId, allowedStatuses, patch, GENERATION_TASK_RETENTION_MS, executionPatch);
}

export function touchTextTask(id: string) {
    return touchStoredGenerationTask("text", id, Date.now(), GENERATION_TASK_RETENTION_MS);
}

export function updateTextTask(id: string, patch: Partial<Pick<TextTask, "config" | "candidateConfigs" | "attempts" | "attemptNo" | "upstream" | "billing" | "storyBatch">>) {
    return mutateStoredGenerationTask<TextTask>("text", id, GENERATION_TASK_RETENTION_MS, (task) => ({ ...task, ...patch }));
}
