import { randomUUID } from "node:crypto";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
import { createStoredGenerationTask, getStoredGenerationTask, mutateStoredGenerationTask, touchStoredGenerationTask, transitionStoredGenerationTask, type GenerationTaskContext } from "@/lib/server/generation-task-store";
import type { LogicalModelCapabilityProfile, SystemChannelAdvancedConfig } from "@/lib/auth/store";
import type { GenerationAttempt } from "@/lib/server/generation-attempt";
import { GENERATION_TASK_RETENTION_MS } from "@/lib/server/generation-task-retention";
import type { StoredTaskBilling } from "@/lib/server/generation-task-types";

export type AudioTaskConfig = {
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
    voice?: string;
    customVoiceId?: string;
    /** 生成模式：不填按 tts（普通合成）。设计、克隆在合成前先用上游创建一个音色。 */
    mode?: "tts" | "design" | "clone" | "dialog";
    /** 多人对话：解析后的台词与每个角色的音色 / 指令。 */
    dialog?: { lines: Array<{ role: string; text: string }>; roles: Record<string, { voice: string; instruction?: string; emotion?: string }> };
    /** 设计模式：声音描述。 */
    voiceDescription?: string;
    /** 设计 / 克隆在上游创建音色后在 custom_voices 落下的本地记录 id，任务结果用它让用户「存为我的音色」。 */
    createdVoiceId?: string;
    /** 克隆模式：参考音频的可访问地址（站内签名地址或公网地址）。 */
    referenceAudioUrl?: string;
    /** 克隆模式：参考音频时长，提交前按渠道限制校验，不符合时不动上游、不扣费。 */
    referenceAudioDurationMs?: number;
    /** 克隆模式：同一段参考音频的指纹，用来复用已克隆的音色。 */
    referenceAudioFingerprint?: string;
    /** 克隆模式：用户已勾选「已获得本人授权」。 */
    cloneConsent?: boolean;
    format?: string;
    speed?: string;
    instructions?: string;
    params?: Record<string, string | number | boolean>;
};
export type AudioTask = GenerationTaskContext & {
    id: string;
    userId: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    createdAt: number;
    updatedAt: number;
    config: AudioTaskConfig;
    prompt: string;
    workflowInput?: Record<string, unknown>;
    source?: string;
    upstream?: { id: string; createPath: string };
    result?: { url: string; mimeType: string };
    billing?: StoredTaskBilling;
    error?: string;
    candidateConfigs?: AudioTaskConfig[];
    attempts?: GenerationAttempt[];
    attemptNo?: number;
};

export function createAudioTask(input: Omit<AudioTask, "id" | "status" | "createdAt" | "updatedAt">) {
    const now = Date.now();
    return createStoredGenerationTask(
        "audio",
        { ...input, config: { ...input.config, executionProfile: input.executionProfile || input.config.executionProfile }, id: randomUUID(), status: "pending", createdAt: now, updatedAt: now } satisfies AudioTask,
        GENERATION_TASK_RETENTION_MS,
    );
}

export async function getAudioTask(id: string) {
    return getStoredGenerationTask<AudioTask>("audio", id);
}

export async function updateAudioTask(id: string, patch: Partial<Pick<AudioTask, "status" | "config" | "upstream" | "result" | "billing" | "error" | "candidateConfigs" | "attempts" | "attemptNo" | "workflowInput">>) {
    return mutateStoredGenerationTask<AudioTask>("audio", id, GENERATION_TASK_RETENTION_MS, (task) => ({ ...task, ...patch }));
}

export function transitionAudioTask(
    task: AudioTask,
    allowedStatuses: Array<AudioTask["status"]>,
    patch: Partial<Pick<AudioTask, "config" | "upstream" | "result" | "billing" | "error">> & { status: AudioTask["status"] },
    executionPatch?: import("@/lib/server/generation-task-scheduler").GenerationTaskSchedulePatch,
) {
    return transitionStoredGenerationTask<AudioTask>("audio", task.id, task.userId, allowedStatuses, patch, GENERATION_TASK_RETENTION_MS, executionPatch);
}

export function touchAudioTask(id: string) {
    return touchStoredGenerationTask("audio", id, Date.now(), GENERATION_TASK_RETENTION_MS);
}
