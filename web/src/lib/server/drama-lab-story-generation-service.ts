import { randomUUID } from "node:crypto";

import type { AiTextMessage } from "@/types/ai";
import { getAuthSettings } from "@/lib/auth/store";
import { toSystemGenerationChannel } from "@/lib/server/generation-channel";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { getStoredGenerationTaskByRequest, linkStoredGenerationTask, mutateStoredGenerationTask, queryStoredGenerationTasks, withGenerationConcurrencyLimit } from "@/lib/server/generation-task-store";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { createTextTask, getTextTask, transitionTextTask, updateTextTask, type TextTask } from "@/lib/server/text-task-store";
import type { DramaStoryBatch } from "@/lib/server/drama-lab-story-task-types";
import { GENERATION_TASK_RETENTION_MS } from "@/lib/server/generation-task-retention";
import { validateGenerationContextIpReferences } from "@/lib/server/ip-library-reference-service";
import { resolveSchoolComputeBillingContext } from "@/lib/server/school-compute-billing-context";
import { cancellationExecutionPatch, type GenerationCancellationTarget } from "@/lib/server/generation-task-cancellation-service";
import { extractJsonObjectText } from "@/lib/server/structured-model-output";
import { getDramaLabCollaborationForUser, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";

const MAX_EPISODES = 100;
const MAX_OUTLINE_LENGTH = 100_000;
const materializationLocks = new Map<string, Promise<void>>();

export class DramaLabStoryGenerationError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "DramaLabStoryGenerationError";
    }
}

export type StartDramaLabStoryGenerationInput = {
    userId: string;
    projectId: string;
    sourceEpisodeId: string;
    requestId: string;
    storyOutline: string;
    storyStyle: string;
    scriptType: string;
    episodeCount: string | number;
    model?: string;
};

export type DramaStoryTaskView = {
    id: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    phase: DramaStoryBatch["status"];
    progress: number;
    episodeCount: number;
    persistedEpisodeCount: number;
    result?: { episodeCount: number };
    error?: string;
};

export async function startDramaLabStoryGeneration(input: StartDramaLabStoryGenerationInput) {
    const projectId = input.projectId.trim();
    const sourceEpisodeId = input.sourceEpisodeId.trim();
    const requestId = input.requestId.trim().slice(0, 160);
    const storyOutline = input.storyOutline.trim().slice(0, MAX_OUTLINE_LENGTH);
    if (!storyOutline) throw new DramaLabStoryGenerationError("请先输入故事梗概", 400);
    if (!projectId || !sourceEpisodeId || !requestId) throw new DramaLabStoryGenerationError("故事生成任务参数不完整", 400);

    const episodeCount = normalizeEpisodeCount(input.episodeCount);
    const { project, ownerUserId } = await resolveDramaLabProjectForRequest(input.userId, projectId);
    const sourceIndex = project.episodes.findIndex((episode) => episode.id === sourceEpisodeId);
    if (sourceIndex < 0) throw new DramaLabStoryGenerationError("当前剧集不存在", 400);

    const taskOwnerIds = uniqueTaskOwnerIds(input.userId, ownerUserId);
    const existingCandidates = await Promise.all(taskOwnerIds.map((taskOwnerId) => getStoredGenerationTaskByRequest<TextTask>("text", taskOwnerId, requestId)));
    const existing = existingCandidates.find((candidate) => candidate?.storyBatch?.projectId === projectId) || existingCandidates.find(Boolean);
    if (existing?.storyBatch?.projectId === projectId) return existing;
    if (existing) throw new DramaLabStoryGenerationError("请求标识已被其他文本任务使用", 409);

    const active = await queryStoryTasksForProject(input.userId, projectId, ownerUserId);
    const runningStory = active.find((task) => task.storyBatch?.projectId === projectId && ["pending", "persisting"].includes(task.storyBatch.status));
    if (runningStory) return runningStory;

    const settings = await getAuthSettings();
    const requestedModel = input.model?.trim() || settings.defaultModels.textModel;
    const resolvedCandidates = resolveLogicalModelCandidates(settings, "text", requestedModel, "", "production");
    if (!requestedModel || !resolvedCandidates.length) throw new DramaLabStoryGenerationError("后台尚未配置可用的默认文本模型", 503);
    const configs = resolvedCandidates.map((candidate) => ({ ...toSystemGenerationChannel(candidate), executionProfile: "production" as const }));

    const context = {
        surface: "drama" as const,
        projectId,
        episodeId: sourceEpisodeId,
        clientRequestId: requestId,
        executionProfile: "production" as const,
        ipReferences: project.ipReferences,
    };
    await validateGenerationContextIpReferences(input.userId, context);
    const billingContext = await resolveSchoolComputeBillingContext(input.userId, context);
    const targetEpisodeIds = [sourceEpisodeId, ...Array.from({ length: episodeCount - 1 }, () => `episode-${randomUUID()}`)];
    const storyBatch: DramaStoryBatch = {
        version: 1,
        projectId,
        projectOwnerUserId: ownerUserId,
        sourceEpisodeId,
        sourceEpisodeIndex: sourceIndex,
        targetEpisodeIds,
        episodeCount,
        storyOutline,
        storyStyle: input.storyStyle.trim().slice(0, 200),
        scriptType: input.scriptType.trim().slice(0, 200),
        status: "pending",
        persistedEpisodeIndexes: [],
        startedAt: Date.now(),
    };

    const prompt = await resolveDramaLabPrompt("story_generation");
    const contract = [
        "只返回一个 JSON 对象，不要 Markdown、解释或代码围栏。",
        `对象必须包含 episodes 数组，数组长度必须为 ${episodeCount}。`,
        "每个元素必须是 {episode:number,title:string,content:string}，episode 从 1 开始连续递增。",
        "content 必须是该集可直接编辑的中文剧本文字，不要把多集内容合并到同一元素。",
    ].join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: withDramaLabPromptContract(prompt.template, contract) },
        {
            role: "user",
            content: JSON.stringify({
                task: "根据故事梗概生成短剧完整多集剧本",
                project: { id: project.id, title: project.title, summary: project.summary, style: project.style, ratio: project.ratio },
                storyOutline,
                storyStyle: storyBatch.storyStyle,
                scriptType: storyBatch.scriptType,
                episodeCount,
                existingEpisodes: project.episodes.slice(0, sourceIndex).map((episode) => ({ title: episode.title, script: episode.script.slice(0, 8_000) })),
            }),
        },
    ];

    const task = await withGenerationConcurrencyLimit(input.userId, "text", 5 * 60 * 1000, settings.generationConcurrency.text, async () =>
        createTextTask({
            ...context,
            ...(billingContext ? { billingContext } : {}),
            userId: input.userId,
            config: configs[0],
            candidateConfigs: configs.slice(1),
            messages,
            storyBatch,
        }),
    );
    if (!task) throw new DramaLabStoryGenerationError("当前用户文本任务已达到并发上限", 429);
    await linkStoredGenerationTask("text", task.id, { ...context, ...(billingContext ? { billingContext } : {}) });
    await scheduleGenerationTask("text", task.id, {
        executionPhase: "created",
        channelId: task.config.channelId,
        provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
        queryPath: task.config.advancedConfig?.queryPath,
        nextPollAt: Date.now(),
        lastUpstreamStatus: "created",
    });
    return task;
}

export async function getDramaLabStoryTaskView(taskId: string, userId: string, projectId: string) {
    const task = await getTextTask(taskId);
    if (!task || task.storyBatch?.projectId !== projectId || !(await resolveStoryTaskAccess(userId, projectId))) return null;
    try {
        const materialized = await materializeDramaLabStoryTask(task);
        return storyTaskView(materialized || task);
    } catch (error) {
        // A project write can fail independently of the completed model task.
        // Return durable progress so the next poll can retry persistence.
        console.warn("Drama story task materialization deferred", { taskId, error: error instanceof Error ? error.message : String(error) });
        const latest = (await getTextTask(taskId)) || task;
        return storyTaskView(latest);
    }
}

export async function findActiveDramaLabStoryTask(userId: string, projectId: string) {
    const { ownerUserId } = await resolveDramaLabProjectForRequest(userId, projectId);
    const tasks = await queryStoryTasksForProject(userId, projectId, ownerUserId);
    const task = tasks.find((candidate) => candidate.storyBatch?.projectId === projectId && ["pending", "persisting"].includes(candidate.storyBatch.status));
    if (!task) return null;
    try {
        return await materializeDramaLabStoryTask(task);
    } catch (error) {
        // A completed text task can outlive a temporarily unavailable project
        // store. Keep the task discoverable so the next poll can retry.
        console.warn("Drama story task discovery deferred", { taskId: task.id, error: error instanceof Error ? error.message : String(error) });
        return task;
    }
}

export async function materializeDramaLabStoryTask(task: TextTask) {
    const batch = task.storyBatch;
    if (!batch) return task;
    if (task.status === "cancelled") {
        if (batch.status !== "cancelled") return (await updateTextTask(task.id, { storyBatch: { ...batch, status: "cancelled", error: task.error || "任务已取消" } })) || task;
        return task;
    }
    if (task.status === "error") {
        if (batch.status !== "error") return (await updateTextTask(task.id, { storyBatch: { ...batch, status: "error", error: task.error || "故事生成失败" } })) || task;
        return task;
    }
    if (task.status !== "success" || batch.status === "completed" || batch.status === "error" || batch.status === "cancelled") return task;

    return withMaterializationLock(task.id, async () => {
        let current = (await getTextTask(task.id)) || task;
        const currentBatch = current.storyBatch;
        if (!currentBatch || current.status !== "success" || ["completed", "error", "cancelled"].includes(currentBatch.status)) return current;
        const episodes = parseStoryEpisodes(current.result?.content || "", currentBatch.episodeCount);
        if (!episodes.length) {
            return (await updateStoryBatchWhileActive(current.id, (batch) => ({ ...batch, status: "error", error: "文本模型没有返回有效的分集剧本" }))) || current;
        }
        const sequenceError = storyEpisodeSequenceError(episodes, currentBatch.episodeCount);
        if (sequenceError) {
            return (await updateStoryBatchWhileActive(current.id, (batch) => ({ ...batch, status: "error", error: sequenceError }))) || current;
        }
        current = (await updateStoryBatchWhileActive(current.id, (batch) => ({ ...batch, status: "persisting" }))) || current;
        if (current.status !== "success" || !current.storyBatch || current.storyBatch.status !== "persisting") return current;
        let latestBatch = current.storyBatch;
        for (let index = 0; index < latestBatch.episodeCount; index += 1) {
            const observed = await getTextTask(current.id);
            if (!observed || observed.status !== "success" || !observed.storyBatch || observed.storyBatch.status !== "persisting") return observed || current;
            current = observed;
            latestBatch = observed.storyBatch;
            if (latestBatch.persistedEpisodeIndexes.includes(index)) continue;
            const episode = episodes[index];
            if (!episode?.content) {
                latestBatch = { ...latestBatch, status: "error", error: `第 ${index + 1} 集没有有效剧本内容` };
                return (await updateStoryBatchWhileActive(current.id, () => latestBatch)) || current;
            }
            await persistStoryEpisode(current.userId, latestBatch, index, episode);
            latestBatch = {
                ...latestBatch,
                persistedEpisodeIndexes: Array.from(new Set([...latestBatch.persistedEpisodeIndexes, index])).sort((a, b) => a - b),
                activeEpisodeIndex: undefined,
            };
            const updated = await updateStoryBatchWhileActive(current.id, () => latestBatch);
            if (!updated) return current;
            current = updated;
            if (current.status !== "success" || !current.storyBatch || current.storyBatch.status !== "persisting") return current;
            latestBatch = current.storyBatch;
        }
        const completedBatch: DramaStoryBatch = { ...latestBatch, status: "completed", completedAt: Date.now(), activeEpisodeIndex: undefined };
        return (await updateStoryBatchWhileActive(current.id, () => completedBatch)) || current;
    });
}

export async function cancelDramaLabStoryTask(task: TextTask, origin: string, cookie: string, userId = task.userId, projectId = task.storyBatch?.projectId || "") {
    const storyBatchActive = task.storyBatch && ["pending", "persisting"].includes(task.storyBatch.status);
    // The upstream text task is marked success before the server materializes
    // each episode. That durable success must remain cancellable while the
    // story batch is pending/persisting.
    if (!task.storyBatch || !storyBatchActive || !["pending", "running", "success"].includes(task.status)) return null;
    if (!projectId || task.storyBatch.projectId !== projectId || !(await resolveStoryTaskAccess(userId, projectId))) return null;
    const target: GenerationCancellationTarget = {
        type: "text",
        taskId: task.id,
        userId: task.userId,
        executionPhase: "created",
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        executionProfile: task.executionProfile,
        billingContext: task.billingContext,
        config: task.config,
    };
    const cancelled = await transitionTextTask(
        task,
        ["pending", "running", "success"],
        { status: "cancelled", error: "任务已取消", messages: [], storyBatch: { ...task.storyBatch, status: "cancelled", error: "任务已取消" } },
        cancellationExecutionPatch(target),
    );
    if (!cancelled) return null;
    // The caller starts the normal platform recovery pass.  Keeping this
    // function free of Next.js request lifecycle APIs also makes it usable by
    // maintenance workers and tests.
    void import("@/lib/server/generation-task-recovery-service").then(({ runGenerationTaskRecoveryBatch }) => runGenerationTaskRecoveryBatch({ origin, cookie, limit: 1, taskIds: [task.id] })).catch(() => undefined);
    return cancelled;
}

/**
 * Persist materialization progress only while the text task is still in the
 * success/persisting window. The row lock in mutateStoredGenerationTask makes
 * this a compare-and-set update, so a concurrent cancellation always wins and
 * cannot be overwritten by a stale materializer.
 */
async function updateStoryBatchWhileActive(taskId: string, update: (batch: DramaStoryBatch) => DramaStoryBatch) {
    const updated = await mutateStoredGenerationTask<TextTask>("text", taskId, GENERATION_TASK_RETENTION_MS, (current) => {
        const batch = current.storyBatch;
        if (current.status !== "success" || !batch || !["pending", "persisting"].includes(batch.status)) return null;
        return { ...current, storyBatch: update(batch) };
    });
    return updated || (await getTextTask(taskId));
}

export function storyTaskView(task: TextTask): DramaStoryTaskView {
    const batch = task.storyBatch;
    if (!batch) throw new DramaLabStoryGenerationError("不是短剧故事任务", 400);
    const persistedEpisodeCount = batch.persistedEpisodeIndexes.length;
    const status =
        batch.status === "completed"
            ? "success"
            : batch.status === "error"
              ? "error"
              : batch.status === "cancelled"
                ? "cancelled"
                : task.status === "error"
                  ? "error"
                  : task.status === "cancelled"
                    ? "cancelled"
                    : task.status === "success"
                      ? "running"
                      : task.status;
    return {
        id: task.id,
        status,
        phase: batch.status,
        progress: Math.min(100, Math.floor((persistedEpisodeCount / Math.max(1, batch.episodeCount)) * 100)),
        episodeCount: batch.episodeCount,
        persistedEpisodeCount,
        ...(batch.status === "completed" ? { result: { episodeCount: persistedEpisodeCount } } : {}),
        ...(batch.error || task.error ? { error: batch.error || task.error } : {}),
    };
}

/**
 * Return the task owners that can legitimately be used for project-scoped
 * task discovery.  Generation task storage remains keyed by the creator, but
 * a collaborator must also be able to discover work created by the stable
 * project storage owner.
 */
function uniqueTaskOwnerIds(userId: string, ownerUserId: string) {
    return Array.from(new Set([userId.trim(), ownerUserId.trim()].filter(Boolean)));
}

async function queryStoryTasksForProject(userId: string, projectId: string, ownerUserId: string) {
    const collaboration = await getDramaLabCollaborationForUser(userId, projectId);
    const ownerIds = uniqueTaskOwnerIds(userId, ownerUserId).concat(collaboration.members.map((member) => member.userId));
    const taskLists = await Promise.all(
        ownerIds.map((taskOwnerId) =>
            queryStoredGenerationTasks<TextTask>("text", {
                userId: taskOwnerId,
                projectId,
                surface: "drama",
                // A completed text task can remain `success` while its
                // storyBatch is still being materialized into episodes.
                statuses: ["pending", "running", "success"],
                limit: 100,
            }),
        ),
    );
    const unique = new Map<string, TextTask>();
    for (const task of taskLists.flat()) {
        if (task.storyBatch?.projectId !== projectId) continue;
        if (!unique.has(task.id)) unique.set(task.id, task);
    }
    return Array.from(unique.values()).sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
}

/** Resolve task access through the Drama Lab collaboration boundary. */
async function resolveStoryTaskAccess(userId: string, projectId: string) {
    let resolved: Awaited<ReturnType<typeof resolveDramaLabProjectForRequest>>;
    try {
        resolved = await resolveDramaLabProjectForRequest(userId, projectId);
    } catch {
        return null;
    }
    if (!resolved?.project) return null;
    // The project resolver has already established that the viewer is an
    // active collaborator. Task ownership is deliberately independent from
    // that viewer identity: generation rows remain billed and stored under
    // their original creator, while every project member can follow the run.
    return resolved;
}

export function normalizeEpisodeCount(value: string | number) {
    const count = Math.floor(Number(value));
    if (!Number.isFinite(count) || count < 1) return 1;
    return Math.min(MAX_EPISODES, count);
}

export function parseStoryEpisodes(content: string, requestedCount: number) {
    const text = content.trim();
    if (!text) return [];
    let parsed: unknown;
    try {
        // Parse the complete response first. `extractJsonObjectText` is a
        // recovery helper and intentionally finds the first object inside an
        // array, which would otherwise truncate valid multi-episode output.
        parsed = JSON.parse(stripJsonFence(text));
    } catch {
        const objectText = extractJsonObjectText(text);
        try {
            parsed = objectText ? JSON.parse(objectText) : undefined;
        } catch {
            parsed = undefined;
        }
        if (parsed === undefined) return [{ episode: 1, title: "第 1 集", content: text.slice(0, MAX_OUTLINE_LENGTH) }];
    }
    const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? findEpisodeArray(parsed as Record<string, unknown>) : [];
    const normalized = list
        .map((item, index) => {
            const value = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const episode = Math.max(1, Math.floor(Number(value.episode ?? value.episodeNumber ?? index + 1) || index + 1));
            const contentValue = typeof value.content === "string" ? value.content : typeof value.script === "string" ? value.script : typeof value.text === "string" ? value.text : typeof value.body === "string" ? value.body : "";
            return { episode, title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 300) : `第 ${episode} 集`, content: contentValue.trim().slice(0, MAX_OUTLINE_LENGTH) };
        })
        .filter((item) => item.content)
        .sort((a, b) => a.episode - b.episode);
    // Keep every parsed episode here. The materializer validates the exact
    // requested count and sequence so an overlong or incomplete model result
    // cannot be silently truncated into a misleadingly successful batch.
    return normalized;
}

export function storyEpisodeSequenceError(episodes: Array<{ episode: number; content: string }>, requestedCount: number) {
    const expectedCount = Math.max(1, requestedCount);
    if (episodes.length !== expectedCount) return `文本模型返回了 ${episodes.length} 集，但请求生成 ${expectedCount} 集`;
    for (let index = 0; index < expectedCount; index += 1) {
        const episode = episodes[index];
        if (episode.episode !== index + 1) return `文本模型返回的分集编号不连续，应为第 ${index + 1} 集，实际为第 ${episode.episode} 集`;
        if (!episode.content.trim()) return `第 ${index + 1} 集没有有效剧本内容`;
    }
    return undefined;
}

async function persistStoryEpisode(userId: string, batch: DramaStoryBatch, index: number, generated: { episode: number; title: string; content: string }) {
    const targetId = batch.targetEpisodeIds[index];
    if (!targetId) throw new DramaLabStoryGenerationError(`第 ${index + 1} 集缺少持久化 ID`, 500);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const resolved = await resolveDramaLabProjectForRequest(userId, batch.projectId);
        const project = resolved.project;
        const existingIndex = project.episodes.findIndex((episode) => episode.id === targetId);
        const existing = existingIndex >= 0 ? project.episodes[existingIndex] : undefined;
        if (existing?.script?.trim() === generated.content.trim() && existing.title === generated.title) return;
        const episode = {
            ...(existing || {
                id: targetId,
                episodeNumber: index + 1,
                title: generated.title,
                script: "",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft" as const,
                shots: [],
            }),
            id: targetId,
            episodeNumber: existing?.episodeNumber || index + 1,
            title: generated.title,
            script: generated.content,
        };
        const episodes = [...project.episodes];
        if (existingIndex >= 0) episodes[existingIndex] = episode;
        else episodes.splice(Math.min(project.episodes.length, batch.sourceEpisodeIndex + index), 0, episode);
        try {
            await updateDramaProjectForUser(resolved.ownerUserId, batch.projectId, { ...project, episodes, activeEpisodeId: index === 0 ? targetId : project.activeEpisodeId, updatedAt: new Date().toISOString() });
            return;
        } catch (error) {
            if (attempt >= 2) throw error;
            const latest = await resolveDramaLabProjectForRequest(userId, batch.projectId).then((value) => value.project);
            const saved = latest.episodes.find((candidate) => candidate.id === targetId);
            if (saved?.script?.trim() === generated.content.trim()) return;
        }
    }
}

function findEpisodeArray(value: Record<string, unknown>) {
    for (const key of ["episodes", "data", "items", "results"]) if (Array.isArray(value[key])) return value[key] as unknown[];
    if (value.content || value.script || value.text) return [value];
    return [];
}

function stripJsonFence(value: string) {
    return value
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

async function withMaterializationLock<T>(id: string, fn: () => Promise<T>) {
    const previous = materializationLocks.get(id) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    materializationLocks.set(id, queued);
    await previous;
    try {
        return await fn();
    } finally {
        release();
        if (materializationLocks.get(id) === queued) materializationLocks.delete(id);
    }
}
