import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { getStoredGenerationTaskRecord, listStoredDramaTaskRecords, type StoredGenerationTaskRecord } from "@/lib/server/generation-task-store";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { isVideoProviderMediaUrl } from "@/lib/server/video-provider-response";
import type { GenerationTaskExecutionPhase } from "@/lib/server/generation-task-scheduler";
import type { GenerationTaskStatus } from "@/lib/server/generation-task-types";

const ACTIVE_EXECUTION_PHASES = new Set<GenerationTaskExecutionPhase>(["created", "submitting", "submitted", "polling", "result_ready", "persisting"]);

export type DramaLabVideoTaskSummary = {
    shotId: string;
    taskId: string;
    status: GenerationTaskStatus;
    executionPhase?: GenerationTaskExecutionPhase;
    lastUpstreamStatus?: string;
    nextPollAt?: number;
    submittedAt?: number;
    attemptNo?: number;
    needsReview: boolean;
    error?: string;
    resultAvailable: boolean;
    binding: "persisted" | "discovered";
};

export type DramaLabVideoRecoveryResult = {
    episodeId: string;
    tasks: DramaLabVideoTaskSummary[];
    activeTaskIds: string[];
    syncedShotIds: string[];
    syncErrors: Array<{ shotId: string; message: string }>;
    recoveryError?: string;
};

export type RecoverDramaLabVideoTasksInput = {
    userId: string;
    /** Storage owner for project writes; task ownership remains userId. */
    projectOwnerUserId?: string;
    project: DramaProject;
    episodeId: string;
    origin: string;
    publicOrigin?: string;
    cookie?: string;
    /** Primarily useful for deterministic callers/tests; defaults to Date.now(). */
    now?: number;
};

export class DramaLabVideoRecoveryError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "DramaLabVideoRecoveryError";
    }
}

/**
 * Reconcile all video tasks that belong to one Drama Lab episode.
 *
 * Discovery is deliberately stricter than the legacy single-shot sync route:
 * only a task carrying the complete drama/project/episode/shot tuple may be
 * attached automatically.  A task without context can still be recovered
 * when the project already persisted its task ID, which preserves old work
 * without allowing a broad scan to guess where it belongs.
 */
export async function recoverDramaLabVideoTasks(input: RecoverDramaLabVideoTasksInput): Promise<DramaLabVideoRecoveryResult> {
    const userId = normalizeId(input.userId);
    const projectId = normalizeId(input.project?.id);
    const episodeId = normalizeId(input.episodeId);
    if (!userId) throw new DramaLabVideoRecoveryError("当前用户不能为空", 401);
    if (!projectId) throw new DramaLabVideoRecoveryError("短剧项目不能为空", 400);
    if (!episodeId) throw new DramaLabVideoRecoveryError("当前剧集不能为空", 400);

    const episode = input.project.episodes?.find((candidate) => candidate.id === episodeId);
    if (!episode) throw new DramaLabVideoRecoveryError("当前剧集不存在", 404);
    const shots = Array.isArray(episode.shots) ? episode.shots : [];
    const shotIds = shots.map((shot) => normalizeId(shot.id)).filter((id): id is string => Boolean(id));
    const shotIdSet = new Set(shotIds);
    const syncErrors: Array<{ shotId: string; message: string }> = [];

    const persisted = await readPersistedBindings({ userId, projectId, episodeId, shots, shotIdSet });
    const discovered = await listStoredDramaTaskRecords({ userId, projectId, episodeId, shotIds, limit: Math.max(500, Math.min(1_000, Math.max(1, shotIds.length) * 20)) });
    const selected = selectTasks({ userId, projectId, episodeId, shots, shotIdSet, persisted, discovered });

    const initialRecords = Array.from(selected.values());
    const dueTaskIds = unique(initialRecords.filter(({ record }) => isDueActive(record, input.now)).map(({ record }) => record.id));
    let recoveryError: string | undefined;
    if (dueTaskIds.length) {
        try {
            await runGenerationTaskRecoveryBatch({
                origin: input.origin,
                publicOrigin: input.publicOrigin || input.origin,
                cookie: input.cookie || "",
                limit: dueTaskIds.length,
                taskIds: dueTaskIds,
            });
        } catch (error) {
            // Recovery of one worker batch must not turn a refresh into a 500;
            // the per-shot sync below can still reconcile terminal records.
            recoveryError = safeError(error);
        }
    }

    const bindingKinds = new Map<string, "persisted" | "discovered">();
    for (const [shotId, candidate] of selected) bindingKinds.set(shotId, candidate.binding);

    // Persist an automatically discovered ID before calling sync-generation;
    // that route intentionally reads the shot's durable binding and refuses to
    // infer a task from a name or a prompt.
    let currentProject = input.project;
    for (const [shotId, candidate] of selected) {
        if (candidate.binding !== "discovered") continue;
        try {
            currentProject = await persistDramaLabShotUpdate({
                userId,
                projectOwnerUserId: input.projectOwnerUserId,
                project: currentProject,
                episodeId,
                shotId,
                patch: {
                    generationTaskId: candidate.record.id,
                    generationAttempt: taskAttempt(candidate.record) || undefined,
                },
                retryOnConflict: false,
            });
        } catch (error) {
            syncErrors.push({ shotId, message: safeError(error) });
            bindingKinds.delete(shotId);
        }
    }

    // A durable shot binding can outlive its task record (expiry, a provider
    // cleanup, or a data-file repair).  Let the existing single-shot sync route
    // detach that owned stale ID and expose a terminal error.  Foreign IDs are
    // intentionally excluded above and are never probed or rewritten.
    const discoveredShotIds = new Set(Array.from(selected.entries()).filter(([shotId, candidate]) => candidate.binding === "discovered" && bindingKinds.has(shotId)).map(([shotId]) => shotId));
    const orphanedShotIds = Array.from(persisted.entries())
        .filter(([shotId, binding]) => Boolean(normalizeId(binding.shot.generationTaskId)) && (binding.state === "missing" || binding.state === "mismatch") && !discoveredShotIds.has(shotId))
        .map(([shotId]) => shotId);

    const syncCandidates = Array.from(selected.entries()).filter(([shotId]) => bindingKinds.has(shotId));
    const syncedShotIds: string[] = [];
    for (const [shotId] of syncCandidates) {
        try {
            await syncShotGeneration({ origin: input.origin, projectId, episodeId, shotId, cookie: input.cookie });
            syncedShotIds.push(shotId);
        } catch (error) {
            syncErrors.push({ shotId, message: safeError(error) });
        }
    }
    for (const shotId of orphanedShotIds) {
        try {
            await syncShotGeneration({ origin: input.origin, projectId, episodeId, shotId, cookie: input.cookie });
            syncedShotIds.push(shotId);
        } catch (error) {
            syncErrors.push({ shotId, message: safeError(error) });
        }
    }

    // Worker reconciliation updates execution columns/payloads. Read each
    // selected ID once more so the response reflects the state the caller can
    // continue polling, while retaining the initial record if it expired in
    // the small interval between worker and response.
    const refreshed = new Map<string, StoredGenerationTaskRecord>();
    await Promise.all(
        syncCandidates.map(async ([shotId, candidate]) => {
            const latest = await getStoredGenerationTaskRecord("video", candidate.record.id).catch(() => null);
            refreshed.set(shotId, latest || candidate.record);
        }),
    );

    const tasks = syncCandidates
        .map(([shotId]) => {
            const candidate = selected.get(shotId);
            const record = refreshed.get(shotId);
            if (!candidate || !record) return null;
            return summarizeTask(shotId, record, candidate.binding);
        })
        .filter((task): task is DramaLabVideoTaskSummary => Boolean(task));
    const activeTaskIds = unique(
        tasks
            .filter((task) => isActiveSummary(task))
            .map((task) => task.taskId),
    );

    return {
        episodeId,
        tasks,
        activeTaskIds,
        syncedShotIds: unique(syncedShotIds),
        syncErrors,
        ...(recoveryError ? { recoveryError } : {}),
    };
}

// More explicit aliases make the service easy to discover without creating a
// second implementation or a second task table.
export const recoverDramaLabVideoGenerationTasks = recoverDramaLabVideoTasks;
export const recoverDramaLabVideoTasksForEpisode = recoverDramaLabVideoTasks;

type PersistedBinding = {
    shot: DramaShot;
    record: StoredGenerationTaskRecord | null;
    state: "none" | "valid" | "legacy" | "missing" | "foreign" | "mismatch";
};

type SelectedTask = {
    shot: DramaShot;
    record: StoredGenerationTaskRecord;
    binding: "persisted" | "discovered";
};

async function readPersistedBindings(input: { userId: string; projectId: string; episodeId: string; shots: DramaShot[]; shotIdSet: Set<string> }) {
    const bindings = new Map<string, PersistedBinding>();
    await Promise.all(
        input.shots.map(async (shot) => {
            const shotId = normalizeId(shot.id);
            if (!shotId || !input.shotIdSet.has(shotId)) return;
            const taskId = normalizeId(shot.generationTaskId);
            if (!taskId) {
                bindings.set(shotId, { shot, record: null, state: "none" });
                return;
            }
            const record = await getStoredGenerationTaskRecord("video", taskId);
            const state = classifyTaskRecord(record, { userId: input.userId, projectId: input.projectId, episodeId: input.episodeId, shotId, allowLegacy: true });
            bindings.set(shotId, { shot, record, state });
        }),
    );
    return bindings;
}

function selectTasks(input: { userId: string; projectId: string; episodeId: string; shots: DramaShot[]; shotIdSet: Set<string>; persisted: Map<string, PersistedBinding>; discovered: StoredGenerationTaskRecord[] }) {
    const selected = new Map<string, SelectedTask>();
    const blockedForeign = new Set<string>();
    for (const [shotId, persisted] of input.persisted) {
        if (persisted.state === "valid" || persisted.state === "legacy") {
            if (persisted.record) selected.set(shotId, { shot: persisted.shot, record: persisted.record, binding: "persisted" });
        } else if (persisted.state === "foreign") {
            // Never replace a foreign binding merely because a scan found a
            // similarly shaped task. That would mutate a shot owned by this
            // user while exposing another user's task through synchronization.
            blockedForeign.add(shotId);
        }
    }

    const shotsById = new Map(input.shots.map((shot) => [normalizeId(shot.id), shot] as const));
    for (const record of input.discovered) {
        const shotId = normalizeId(record.shotId);
        if (!shotId || !input.shotIdSet.has(shotId) || blockedForeign.has(shotId)) continue;
        if (classifyTaskRecord(record, { userId: input.userId, projectId: input.projectId, episodeId: input.episodeId, shotId, allowLegacy: false }) !== "valid") continue;
        const shot = shotsById.get(shotId);
        if (!shot) continue;
        const current = selected.get(shotId);
        if (!current || (current.binding === "discovered" && compareTaskRecords(record, current.record) > 0)) selected.set(shotId, { shot, record, binding: "discovered" });
    }
    return selected;
}

function classifyTaskRecord(record: StoredGenerationTaskRecord | null, scope: { userId: string; projectId: string; episodeId: string; shotId: string; allowLegacy: boolean }): PersistedBinding["state"] {
    if (!record) return "missing";
    if (record.type !== "video" || record.userId !== scope.userId) return "foreign";
    const context = taskContext(record);
    if (context.conflict) return "mismatch";
    const values = [context.surface, context.projectId, context.episodeId, context.shotId];
    if (!values.some(Boolean)) return scope.allowLegacy ? "legacy" : "mismatch";
    if (values.some((value) => !value)) return "mismatch";
    return context.surface === "drama" && context.projectId === scope.projectId && context.episodeId === scope.episodeId && context.shotId === scope.shotId ? "valid" : "mismatch";
}

function taskContext(record: StoredGenerationTaskRecord) {
    const payload = object(record.payload);
    const nested = object(payload.context);
    const resolve = (...values: unknown[]) => {
        const normalized = values.map(normalizeId).filter(Boolean);
        return { value: normalized[0] || "", conflict: new Set(normalized).size > 1 };
    };
    const surface = resolve(record.surface, payload.surface, nested.surface);
    const projectId = resolve(record.projectId, payload.projectId, nested.projectId);
    const episodeId = resolve(record.episodeId, payload.episodeId, nested.episodeId);
    const shotId = resolve(record.shotId, payload.shotId, nested.shotId);
    return {
        surface: surface.value,
        projectId: projectId.value,
        episodeId: episodeId.value,
        shotId: shotId.value,
        conflict: surface.conflict || projectId.conflict || episodeId.conflict || shotId.conflict,
    };
}

function compareTaskRecords(left: StoredGenerationTaskRecord, right: StoredGenerationTaskRecord) {
    return taskAttempt(left) - taskAttempt(right) || left.updatedAt - right.updatedAt || left.id.localeCompare(right.id);
}

function taskAttempt(record: StoredGenerationTaskRecord) {
    const payload = object(record.payload);
    const value = Number(record.attemptNo ?? payload.attemptNo);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function isDueActive(record: StoredGenerationTaskRecord, nowInput?: number) {
    const now = Number.isFinite(Number(nowInput)) ? Number(nowInput) : Date.now();
    const phase = record.executionPhase || "created";
    const active = (record.status === "pending" || record.status === "running") && ACTIVE_EXECUTION_PHASES.has(phase);
    const nextPollAt = Number(record.nextPollAt);
    const leaseUntil = Number(record.leaseUntil || 0);
    return active && Number.isFinite(nextPollAt) && nextPollAt > 0 && nextPollAt <= now && (!leaseUntil || leaseUntil <= now) && record.expiresAt > now;
}

function summarizeTask(shotId: string, record: StoredGenerationTaskRecord, binding: "persisted" | "discovered"): DramaLabVideoTaskSummary {
    const payload = object(record.payload);
    const resultPayload = object(record.resultPayload);
    const error = safeText(record.reviewReason || payload.error || resultPayload.error);
    const summary: DramaLabVideoTaskSummary = {
        shotId,
        taskId: record.id,
        status: record.status,
        executionPhase: record.executionPhase,
        lastUpstreamStatus: safeText(record.lastUpstreamStatus),
        nextPollAt: finiteTimestamp(record.nextPollAt),
        submittedAt: finiteTimestamp(record.submittedAt),
        attemptNo: taskAttempt(record) || undefined,
        needsReview: record.executionPhase === "needs_review" || Boolean(record.reviewReason),
        resultAvailable: hasResult(payload, resultPayload),
        binding,
    };
    if (error) summary.error = error;
    return summary;
}

function isActiveSummary(task: DramaLabVideoTaskSummary) {
    return (task.status === "pending" || task.status === "running") && ACTIVE_EXECUTION_PHASES.has(task.executionPhase || "created");
}

async function syncShotGeneration(input: { origin: string; projectId: string; episodeId: string; shotId: string; cookie?: string }) {
    const base = input.origin.replace(/\/+$/, "");
    const url = `${base}/api/drama-lab/projects/${encodeURIComponent(input.projectId)}/shots/${encodeURIComponent(input.shotId)}/sync-generation?episodeId=${encodeURIComponent(input.episodeId)}`;
    const headers: Record<string, string> = {};
    if (input.cookie) headers.cookie = input.cookie;
    const response = await fetchInternalApi(url, { method: "POST", headers, cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { code?: unknown; msg?: unknown; error?: unknown } | null;
    const code = Number(body?.code);
    if (!response.ok || (body && body.code !== undefined && code !== 0)) throw new Error(safeText(body?.msg || body?.error) || `同步分镜任务失败（HTTP ${response.status}）`);
}

function hasResult(payload: Record<string, unknown>, resultPayload: Record<string, unknown>) {
    const result = object(payload.result);
    const upstream = object(payload.upstream);
    return [result.url, result.remoteUrl, result.serverUrl, result.dataUrl, resultPayload.url, resultPayload.remoteUrl, resultPayload.serverUrl, resultPayload.dataUrl, upstream.resultUrl].some((value) => isVideoProviderMediaUrl(value));
}

function normalizeId(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function finiteTimestamp(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeText(value: unknown) {
    if (typeof value !== "string") return "";
    return value
        .trim()
        .replace(/((?:api[-_ ]?key|authorization|cookie|secret|access[-_ ]?token|refresh[-_ ]?token)\s*[:=]\s*)([^\s,;]+)/gi, "$1[redacted]")
        .slice(0, 500);
}

function safeError(error: unknown) {
    return safeText(error instanceof Error ? error.message : String(error)) || "同步分镜任务失败";
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}
