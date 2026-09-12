import { nanoid } from "nanoid";

import type { PracticeModuleKind, PracticeProjectKind, PracticeSessionMode } from "@/lib/practice-domain";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModel } from "@/lib/server/logical-model-router";
import { getDatabaseProvider, createPostgresRepositories } from "@/lib/server/database";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import type { JsonValue, PracticeSessionRecord } from "@/lib/server/database/repository-types";
import { requirePracticeAccess, type PracticeActor } from "./practice-access-service";
import { requirePracticeTenant, type PracticeTenantScope } from "./practice-tenant-scope";
import { PracticeReferenceAuthorizationError, validatePracticeReferences } from "./practice-reference-authorization";
import { getTextTask } from "@/lib/server/text-task-store";
import { getImageTask } from "@/lib/server/image-task-store";
import { getVideoTask } from "@/lib/server/video-task-store";
import { getAudioTask, type AudioTask } from "@/lib/server/audio-task-store";
import { ensurePracticeAudioGenerationLog } from "@/lib/server/audio-task-runtime";
import { getCanvasProjectForUser } from "@/lib/server/canvas-project-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { getStoredGenerationTaskByRequest } from "@/lib/server/generation-task-store";
import type { IpReference } from "@/lib/ip-library-domain";
import { normalizeIpReferences, recordIpReferenceUsage, validateIpReferences } from "./ip-library-reference-service";
import type { RunningHubWorkflowCode, RunningHubWorkflowConfig } from "@/lib/auth/store-types";
import type { RunningHubWorkflowInputField } from "@/lib/auth/store-types";
import { resolveEnabledWorkflow, runningHubWorkflowConfigFingerprint } from "./runninghub-workflow-domain";

export type PracticeSessionCreateInput = {
    module: PracticeModuleKind;
    mode?: PracticeSessionMode;
    title: string;
    input: Record<string, unknown>;
    references?: unknown[];
    logicalModelId?: string;
    clientRequestId: string;
    projectId?: string;
    projectKind?: PracticeProjectKind;
    workflowCode?: RunningHubWorkflowCode;
};

export type PracticeTaskDispatchInput = {
    sessionId: string;
    userId: string;
    schoolId: string;
    module: PracticeModuleKind;
    input: Record<string, unknown>;
    references: unknown[];
    executionProfile: "open-source-practice";
    capability: "text" | "image" | "video" | "audio";
    logicalModelId: string;
    clientRequestId: string;
    projectKind: PracticeProjectKind;
    workflow?: RunningHubWorkflowConfig;
};

export type PracticeTaskDispatchResult = { taskId: string; taskType: "text" | "image" | "video" | "audio" };
export type PracticeModelResolution = { logicalModelId: string; capability: PracticeTaskDispatchInput["capability"]; workflow?: RunningHubWorkflowConfig };

type PracticeSessionScope = PracticeTenantScope | string;

export interface PracticeSessionStore {
    getByRequest(scope: PracticeSessionScope, clientRequestId: string): Promise<PracticeSessionRecord | null>;
    create(input: Omit<PracticeSessionRecord, "createdAt" | "updatedAt">): Promise<PracticeSessionRecord>;
    get(scope: PracticeSessionScope, id: string): Promise<PracticeSessionRecord | null>;
    claimDispatch(scope: PracticeSessionScope, id: string): Promise<PracticeSessionRecord | null>;
    resetForRetry(scope: PracticeSessionScope, id: string): Promise<PracticeSessionRecord | null>;
    update(
        scope: PracticeSessionScope,
        id: string,
        patch: Partial<Pick<PracticeSessionRecord, "status" | "taskRefs" | "prompt" | "input" | "title" | "mode" | "selectedLogicalModelId" | "errorCode" | "errorMessage">>,
    ): Promise<PracticeSessionRecord | null>;
    delete(scope: PracticeSessionScope, id: string): Promise<void>;
}

export type PracticePublicErrorCode =
    | "PRACTICE_MODEL_UNAVAILABLE"
    | "PRACTICE_WORKFLOW_UNAVAILABLE"
    | "PRACTICE_INPUT_INVALID"
    | "PRACTICE_REFERENCE_INVALID"
    | "PRACTICE_DISPATCH_FAILED"
    | "PRACTICE_DISPATCH_NOT_STARTED"
    | "PRACTICE_TASK_FAILED"
    | "PRACTICE_TASK_CANCELLED"
    | "PRACTICE_SUBMISSION_UNKNOWN";

export async function createPracticeSessionForUser(
    actor: PracticeActor,
    input: PracticeSessionCreateInput,
    deps: {
        store?: PracticeSessionStore;
        dispatch?: (input: PracticeTaskDispatchInput) => Promise<PracticeTaskDispatchResult>;
        resolveModel?: (module: PracticeModuleKind, requestedLogicalModelId?: string, workflowCode?: string) => Promise<PracticeModelResolution>;
        resolveProject?: (scope: PracticeSessionScope, kind: PracticeProjectKind, projectId: string) => Promise<{ executionProfile?: string }>;
    } = {},
) {
    const moduleKind = normalizeModule(input.module);
    const scope = await requirePracticeTenant(actor, moduleKind);
    const store = deps.store || defaultPracticeSessionStore();
    const clientRequestId = clean(input.clientRequestId, 160);
    if (!clientRequestId) throw new PracticeServiceError("缺少练习请求标识", 400);
    const existing = await store.getByRequest(scope, clientRequestId);
    if (existing) {
        if (!deps.dispatch || (Array.isArray(existing.taskRefs) && existing.taskRefs.length)) return publicSession(await synchronizePracticeSessionLifecycle(store, existing));
        if (existing.status === "queued") return dispatchQueuedSession(scope, existing, clientRequestId, store, deps.dispatch, deps.resolveModel || defaultResolveModel);
        if (existing.errorCode !== "PRACTICE_SUBMISSION_UNKNOWN" && (existing.status === "failed" || existing.status === "cancelled" || (existing.status === "running" && !hasTaskReference(existing)))) {
            const reset = await store.resetForRetry(scope, existing.id);
            if (!reset) return publicSession(await synchronizePracticeSessionLifecycle(store, existing));
            return dispatchQueuedSession(scope, reset, clientRequestId, store, deps.dispatch, deps.resolveModel || defaultResolveModel);
        }
        return publicSession(await synchronizePracticeSessionLifecycle(store, existing));
    }
    const title = clean(input.title, 120) || "练习会话";
    const sourcePayload = object(input.input);
    const requestedMode = input.mode || (moduleKind === "script" && (text(sourcePayload.content) || text(sourcePayload.script) || text(sourcePayload.title)) ? "manual" : "workflow");
    const mode: PracticeSessionMode = moduleKind === "script" && requestedMode === "manual" ? "manual" : "workflow";
    if (mode === "manual") {
        if (!text(sourcePayload.title) || !text(sourcePayload.content)) throw new PracticeServiceError("剧本标题和正文不能为空", 400, "PRACTICE_INPUT_INVALID");
    } else if (!isCharacterMultiView(moduleKind, cleanOptional(input.workflowCode || sourcePayload.workflowCode, 160)) && !(moduleKind === "dubbing" ? text(sourcePayload.text) : text(sourcePayload.prompt))) {
        // Demo 的角色多视图以主形象参考图为必填、描述词为可选；其余模块仍要求提示词.
        throw new PracticeServiceError("练习内容不能为空", 400, "PRACTICE_INPUT_INVALID");
    }
    const projectId = cleanOptional(input.projectId, 160);
    const projectKind: PracticeProjectKind = input.projectKind === "drama" ? "drama" : "canvas";
    if (projectId) {
        try {
            const project = await (deps.resolveProject || resolvePracticeProject)(scope, projectKind, projectId);
            if (project.executionProfile !== "open-source-practice") throw new Error("not-practice");
        } catch (error) {
            if (error && typeof error === "object" && "status" in error && (error as { status?: unknown }).status === 403) throw error;
            throw new PracticeServiceError("练习项目关联无效", 400, "PRACTICE_INPUT_INVALID");
        }
    }
    let references: ReturnType<typeof normalizeReferences>;
    try {
        references = (await validatePracticeReferences(scopeValues(scope), moduleKind, sourcePayload, input.references)) as ReturnType<typeof normalizeReferences>;
    } catch (error) {
        if (error instanceof PracticeReferenceAuthorizationError) throw new PracticeServiceError(error.message, error.status, "PRACTICE_REFERENCE_INVALID");
        throw error;
    }
    const ipReferences = references.filter((reference): reference is IpReference => reference.type === "ip");
    await validateIpReferences(scopeValues(scope).ownerUserId, ipReferences);
    const requestedWorkflowCode = cleanOptional(input.workflowCode || sourcePayload.workflowCode, 160);
    const baseNormalized = mode === "workflow" ? normalizePracticeModuleInput(moduleKind, sourcePayload, references) : undefined;
    const resolveModel = deps.resolveModel || defaultResolveModel;
    const model = mode === "workflow" ? (requestedWorkflowCode ? await resolveModel(moduleKind, input.logicalModelId, requestedWorkflowCode) : await resolveModel(moduleKind, input.logicalModelId)) : undefined;
    const normalizedWorkflow = mode === "workflow" ? normalizePracticeModuleInput(moduleKind, sourcePayload, references, model?.workflow) : undefined;
    const payload =
        mode === "manual"
            ? {
                  title: text(sourcePayload.title),
                  content: text(sourcePayload.content),
                  ...(text(sourcePayload.notes) ? { notes: text(sourcePayload.notes) } : {}),
                  ...(references.length ? { references } : {}),
              }
            : { ...(normalizedWorkflow?.input || baseNormalized?.input || {}), ...(references.length ? { references } : {}) };
    const created = await store.create({
        id: `practice-session-${nanoid()}`,
        userId: scopeValues(scope).ownerUserId,
        schoolId: scopeValues(scope).schoolId,
        projectId,
        projectKind,
        module: moduleKind,
        mode,
        title,
        clientRequestId,
        executionProfile: "open-source-practice",
        prompt: (mode === "workflow" ? text(sourcePayload.prompt) : "") as JsonValue,
        input: payload as JsonValue,
        taskRefs: [],
        ...(model ? { selectedLogicalModelId: model.logicalModelId } : {}),
        ...(model?.workflow
            ? {
                  workflowCode: model.workflow.workflowCode || requestedWorkflowCode,
                  workflowVersion: model.workflow.version,
                  workflowConfigFingerprint: runningHubWorkflowConfigFingerprint(model.workflow),
                  workflowAdapterVersion: model.workflow.adapterVersion || 1,
              }
            : {}),
        status: mode === "manual" ? "draft" : "queued",
    });
    if (mode === "manual") {
        if (ipReferences.length) await recordIpReferenceUsage(scopeValues(scope).ownerUserId, { targetType: "practice", targetId: created.id, references: ipReferences });
        return publicSession(created);
    }
    const dispatch = deps.dispatch;
    if (!dispatch) {
        if (ipReferences.length) await recordIpReferenceUsage(scopeValues(scope).ownerUserId, { targetType: "practice", targetId: created.id, references: ipReferences });
        return publicSession(created);
    }
    return dispatchQueuedSession(scope, created, clientRequestId, store, dispatch, resolveModel, model);
}

async function dispatchQueuedSession(
    scope: PracticeSessionScope,
    session: PracticeSessionRecord,
    clientRequestId: string,
    store: PracticeSessionStore,
    dispatch: (input: PracticeTaskDispatchInput) => Promise<PracticeTaskDispatchResult>,
    resolveModel: (module: PracticeModuleKind, requestedLogicalModelId?: string, workflowCode?: string) => Promise<PracticeModelResolution>,
    preflightModel?: PracticeModelResolution,
) {
    const claimed = await store.claimDispatch(scope, session.id);
    if (!claimed) return publicSession((await store.get(scope, session.id)) || session);
    const storedInput = object(claimed.input);
    let references: ReturnType<typeof normalizeReferences>;
    try {
        references = (await validatePracticeReferences(scopeValues(scope), claimed.module, storedInput, storedInput.references)) as ReturnType<typeof normalizeReferences>;
    } catch (error) {
        await store.update(scope, claimed.id, { status: "failed", errorCode: "PRACTICE_REFERENCE_INVALID", errorMessage: publicErrorMessage(error, "PRACTICE_REFERENCE_INVALID") });
        throw error;
    }
    const ipReferences = references.filter((reference): reference is IpReference => reference.type === "ip");
    let model: PracticeModelResolution;
    try {
        await validateIpReferences(scopeValues(scope).ownerUserId, ipReferences);
        if (ipReferences.length) await recordIpReferenceUsage(scopeValues(scope).ownerUserId, { targetType: "practice", targetId: claimed.id, references: ipReferences });
        model = preflightModel || (claimed.workflowCode ? await resolveModel(claimed.module, claimed.selectedLogicalModelId, claimed.workflowCode) : await resolveModel(claimed.module, claimed.selectedLogicalModelId));
    } catch (error) {
        await store.update(scope, claimed.id, { status: "failed", errorCode: publicErrorCode(error, "PRACTICE_MODEL_UNAVAILABLE"), errorMessage: publicErrorMessage(error, "PRACTICE_MODEL_UNAVAILABLE") });
        throw error;
    }
    let task: PracticeTaskDispatchResult;
    try {
        task = await dispatch({
            sessionId: claimed.id,
            userId: scopeValues(scope).ownerUserId,
            schoolId: scopeValues(scope).schoolId,
            module: claimed.module,
            input: Object.fromEntries(Object.entries(storedInput).filter(([key]) => key !== "references")),
            references,
            executionProfile: "open-source-practice",
            capability: model.capability,
            logicalModelId: model.logicalModelId,
            clientRequestId,
            projectKind: claimed.projectKind,
            ...(model.workflow ? { workflow: model.workflow } : {}),
        });
    } catch (error) {
        await store.update(scope, claimed.id, { status: "failed", errorCode: "PRACTICE_DISPATCH_FAILED", errorMessage: publicErrorMessage(error, "PRACTICE_DISPATCH_FAILED") });
        throw error;
    }
    const taskRefs = [{ taskId: task.taskId, taskType: task.taskType }] as unknown as JsonValue;
    try {
        const running = await store.update(scope, claimed.id, { status: "running", taskRefs, errorCode: undefined, errorMessage: undefined });
        if (!running) throw new Error("练习任务引用写回未确认");
        return publicSession(running || claimed);
    } catch (error) {
        try {
            const linked = await store.update(scope, claimed.id, { status: "running", taskRefs, errorCode: undefined, errorMessage: undefined });
            if (linked) return publicSession(linked);
        } catch {
            // The durable generation task remains available for reconciliation on the next read.
        }
        await store.update(scope, claimed.id, { status: "running", errorCode: "PRACTICE_SUBMISSION_UNKNOWN", errorMessage: publicErrorMessage(error, "PRACTICE_SUBMISSION_UNKNOWN") }).catch(() => undefined);
        throw new PracticeServiceError("练习任务已提交，结果待确认", 503, "PRACTICE_SUBMISSION_UNKNOWN");
    }
}

export async function getPracticeSessionForUser(actor: PracticeActor, id: string, deps: { store?: PracticeSessionStore } = {}) {
    const scope = await requirePracticeTenant(actor);
    const store = deps.store || defaultPracticeSessionStore();
    const loaded = await store.get(scope, clean(id, 160));
    const session = loaded ? await synchronizePracticeSessionLifecycle(store, loaded) : null;
    if (!session) throw new PracticeServiceError("练习会话不存在", 404);
    return publicSession(session);
}

export async function listPracticeSessionsForUser(actor: PracticeActor, input: { page?: unknown; pageSize?: unknown; module?: PracticeModuleKind } = {}, deps: { store?: PracticeSessionStore } = {}) {
    const scope = await requirePracticeTenant(actor);
    const page = positive(input.page, 1);
    const pageSize = Math.min(100, positive(input.pageSize, 12));
    const store = (deps.store as PracticeSessionListStore | undefined) || defaultPracticeSessionStore();
    const records = await store.list(scope, { page, pageSize, module: input.module });
    return { sessions: await Promise.all(records.items.map(async (item) => publicSession(await synchronizePracticeSessionLifecycle(store, item)))), total: records.total, page, pageSize };
}

export async function retryPracticeSessionForUser(
    actor: PracticeActor,
    id: string,
    deps: { store?: PracticeSessionStore; dispatch?: (input: PracticeTaskDispatchInput) => Promise<PracticeTaskDispatchResult>; resolveModel?: (module: PracticeModuleKind, requestedLogicalModelId?: string) => Promise<PracticeModelResolution> } = {},
) {
    const scope = await requirePracticeTenant(actor);
    const store = deps.store || defaultPracticeSessionStore();
    const loaded = await store.get(scope, clean(id, 160));
    const current = loaded ? await synchronizePracticeSessionLifecycle(store, loaded) : null;
    if (!current) throw new PracticeServiceError("练习会话不存在", 404);
    await requirePracticeTenant(actor, current.module);
    const dispatchNotStarted = (current.status === "queued" || current.status === "running") && !hasTaskReference(current) && current.errorCode !== "PRACTICE_SUBMISSION_UNKNOWN";
    if (current.status !== "failed" && current.status !== "cancelled" && !dispatchNotStarted) throw new PracticeServiceError("当前练习无需重试", 409);
    const storedInput = object(current.input);
    let references: ReturnType<typeof normalizeReferences>;
    try {
        references = (await validatePracticeReferences(scopeValues(scope), current.module, storedInput, storedInput.references)) as ReturnType<typeof normalizeReferences>;
    } catch (error) {
        throw error instanceof PracticeReferenceAuthorizationError ? new PracticeServiceError(error.message, error.status, "PRACTICE_REFERENCE_INVALID") : error;
    }
    await validateIpReferences(
        scopeValues(scope).ownerUserId,
        references.filter((reference): reference is IpReference => reference.type === "ip"),
    );
    const reset = await store.resetForRetry(scope, current.id);
    if (!reset) {
        const latest = await store.get(scope, current.id);
        if (latest && latest.status !== "failed" && latest.status !== "cancelled") return publicSession(latest);
        throw new PracticeServiceError("练习状态更新失败", 409);
    }
    const dispatch = deps.dispatch;
    if (!dispatch) {
        await (deps.resolveModel || defaultResolveModel)(current.module, current.selectedLogicalModelId);
        return publicSession(reset);
    }
    return dispatchQueuedSession(scope, reset, current.clientRequestId, store, dispatch, deps.resolveModel || defaultResolveModel);
}

export async function deletePracticeSession(actorOrUserId: PracticeActor | string, sessionId: string, deps: { store?: PracticeSessionStore } = {}) {
    const actor = typeof actorOrUserId === "string" ? { id: actorOrUserId } : actorOrUserId;
    const scope = await requirePracticeTenant(actor);
    const store = deps.store || defaultPracticeSessionStore();
    const normalizedSessionId = clean(sessionId, 160);
    const session = await store.get(scope, normalizedSessionId);
    if (!session) throw new PracticeServiceError("练习会话不存在", 404);
    await store.delete(scope, normalizedSessionId);
}

export class PracticeServiceError extends Error {
    constructor(
        readonly message: string,
        readonly status: number,
        readonly code?: PracticePublicErrorCode,
    ) {
        super(message);
    }
}

type PracticeSessionListStore = PracticeSessionStore & { list(scope: PracticeSessionScope, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> };

export async function publicPracticeSession(session: PracticeSessionRecord) {
    const reconciled = await reconcileUnknownSubmission(session);
    const task = await publicTaskResult(reconciled);
    const dispatchNeverStarted = reconciled.mode === "workflow" && (reconciled.status === "queued" || reconciled.status === "running") && !hasTaskReference(reconciled) && reconciled.errorCode !== "PRACTICE_SUBMISSION_UNKNOWN";
    return {
        id: reconciled.id,
        title: reconciled.title,
        module: reconciled.module,
        mode: reconciled.mode,
        projectId: reconciled.projectId,
        projectKind: reconciled.projectKind,
        input: reconciled.input,
        ...(reconciled.workflowCode ? { workflowCode: reconciled.workflowCode } : {}),
        ...(reconciled.workflowVersion ? { workflowVersion: reconciled.workflowVersion } : {}),
        ...(reconciled.workflowConfigFingerprint ? { workflowConfigFingerprint: reconciled.workflowConfigFingerprint } : {}),
        ...(reconciled.workflowAdapterVersion ? { workflowAdapterVersion: reconciled.workflowAdapterVersion } : {}),
        status: task?.status === "success" ? "success" : task?.status === "error" ? "failed" : task?.status === "cancelled" ? "cancelled" : dispatchNeverStarted ? "failed" : reconciled.status,
        ...(reconciled.selectedLogicalModelId ? { selectedLogicalModelId: reconciled.selectedLogicalModelId } : {}),
        ...(dispatchNeverStarted ? { errorCode: "PRACTICE_DISPATCH_NOT_STARTED" as const, errorMessage: "练习任务尚未提交，请重试" } : reconciled.errorCode ? { errorCode: reconciled.errorCode, errorMessage: reconciled.errorMessage } : {}),
        ...(task ? { result: task } : {}),
        createdAt: reconciled.createdAt,
        updatedAt: reconciled.updatedAt,
    };
}

const publicSession = publicPracticeSession;

async function publicTaskResult(session: PracticeSessionRecord) {
    if (getDatabaseProvider() === "postgres" && !process.env.DATABASE_URL) return undefined;
    const ref = Array.isArray(session.taskRefs) ? session.taskRefs[0] : undefined;
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) return undefined;
    const taskId = typeof ref.taskId === "string" ? ref.taskId : "";
    const taskType = ref.taskType;
    if (!taskId || !["text", "image", "video", "audio"].includes(String(taskType))) return undefined;
    const task = taskType === "text" ? await getTextTask(taskId) : taskType === "image" ? await getImageTask(taskId) : taskType === "video" ? await getVideoTask(taskId) : await getAudioTask(taskId);
    if (!task || task.userId !== session.userId) return undefined;
    if (task.status === "pending" || task.status === "running") return { status: task.status } as const;
    if (task.status === "needs_review") return { status: "error" as const, error: (task as { error?: string }).error || "视频任务已超过自动查询时间，请联系管理员检查上游状态" };
    if (task.status === "error") {
        if (taskType === "audio") await ensurePracticeAudioGenerationLog(task as AudioTask, "failed", task.error || "练习失败");
        return { status: "error" as const, error: task.error || "练习失败" };
    }
    if (task.status === "cancelled") return { status: "cancelled" as const, error: task.error };
    const result = task && typeof task === "object" && task.result && typeof task.result === "object" ? (task.result as Record<string, unknown>) : {};
    if (taskType === "text") return { status: "success" as const, text: typeof result.content === "string" ? result.content : undefined };
    if (taskType === "image") {
        const url = [result.serverUrl, result.remoteUrl, result.dataUrl].find((item) => typeof item === "string" && item.trim());
        return { status: "success" as const, media: url ? { kind: "image" as const, url, width: typeof result.width === "number" ? result.width : undefined, height: typeof result.height === "number" ? result.height : undefined } : undefined };
    }
    if (taskType === "video") {
        const url = typeof result.url === "string" ? result.url : typeof result.remoteUrl === "string" ? result.remoteUrl : undefined;
        return { status: "success" as const, media: url ? { kind: "video" as const, url, durationMs: typeof result.durationMs === "number" ? result.durationMs : undefined } : undefined };
    }
    await ensurePracticeAudioGenerationLog(task as AudioTask, "success");
    const url = typeof result.url === "string" ? normalizePracticeAudioUrl(result.url) : undefined;
    return { status: "success" as const, media: url ? { kind: "audio" as const, url } : undefined };
}

function normalizePracticeAudioUrl(value: string) {
    try {
        const parsed = new URL(value);
        if (["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname.startsWith("/api/")) return `${parsed.pathname}${parsed.search}`;
    } catch {}
    return value;
}

async function synchronizePracticeSessionLifecycle(store: PracticeSessionStore, session: PracticeSessionRecord) {
    if (session.mode !== "workflow") return session;
    const reconciled = await reconcileUnknownSubmission(session, store);
    if (!Array.isArray(reconciled.taskRefs) || !reconciled.taskRefs.length) return reconciled;
    const task = await publicTaskResult(reconciled);
    if (!task || (task.status !== "success" && task.status !== "error" && task.status !== "cancelled")) return reconciled;
    const status = task.status === "success" ? "success" : task.status === "cancelled" ? "cancelled" : "failed";
    if (reconciled.status === status && (status !== "failed" || reconciled.errorMessage === task.error)) return reconciled;
    const updated = await store.update(sessionScope(reconciled), reconciled.id, {
        status,
        ...(status === "failed" || status === "cancelled"
            ? { errorCode: status === "cancelled" ? "PRACTICE_TASK_CANCELLED" : "PRACTICE_TASK_FAILED", errorMessage: task.error || (status === "cancelled" ? "练习任务已取消" : "练习失败") }
            : { errorCode: undefined, errorMessage: undefined }),
    });
    return updated || reconciled;
}

async function reconcileUnknownSubmission(session: PracticeSessionRecord, store?: PracticeSessionStore) {
    if (session.mode !== "workflow" || session.errorCode !== "PRACTICE_SUBMISSION_UNKNOWN" || hasTaskReference(session)) return session;
    const reference = await findDurableTaskReference(session.userId, session.schoolId, session.clientRequestId, session.module).catch(() => null);
    if (!reference) return session;
    if (!store) return { ...session, taskRefs: [reference] as unknown as JsonValue, errorCode: undefined, errorMessage: undefined };
    const linked = await store.update(sessionScope(session), session.id, { status: "running", taskRefs: [reference] as unknown as JsonValue, errorCode: undefined, errorMessage: undefined }).catch(() => null);
    return linked || session;
}

async function findDurableTaskReference(userId: string, schoolId: string | undefined, clientRequestId: string, module: PracticeModuleKind) {
    const taskType = module === "script" ? "text" : ["character", "scene", "prop", "storyboard-image"].includes(module) ? "image" : module === "storyboard-video" ? "video" : "audio";
    const task = await getStoredGenerationTaskByRequest<{ id?: unknown }>(taskType, userId, clientRequestId);
    return task && typeof task.id === "string" && task.id.trim() ? { taskId: task.id, taskType } : null;
}

async function resolvePracticeProject(scope: PracticeSessionScope, kind: PracticeProjectKind, projectId: string) {
    return kind === "drama" ? getDramaProjectForUser(scopeValues(scope).ownerUserId, projectId) : getCanvasProjectForUser(scopeValues(scope).ownerUserId, projectId);
}

async function defaultResolveModel(module: PracticeModuleKind, requestedLogicalModelId?: string, requestedWorkflowCode?: string): Promise<PracticeModelResolution> {
    const settings = await getAuthSettings();
    return resolvePracticeModelFromSettings(settings, module, requestedLogicalModelId, requestedWorkflowCode);
}

export function resolvePracticeModelFromSettings(settings: Awaited<ReturnType<typeof getAuthSettings>>, module: PracticeModuleKind, requestedLogicalModelId?: string, requestedWorkflowCode?: string): PracticeModelResolution {
    const capability = module === "script" ? "text" : module === "storyboard-video" ? "video" : module === "dubbing" || module === "music" ? "audio" : "image";
    const expectedCode =
        requestedWorkflowCode ||
        ({ character: "character_main_view", scene: "scene_main_view", prop: "prop_main_view", "storyboard-image": "storyboard_shot", "storyboard-video": "storyboard_shot_video", dubbing: "storyboard_dialogue_audio" } as Record<string, string>)[module];
    if (module !== "script") {
        const workflowCandidates = settings.systemChannels
            .filter((channel) => channel.enabled && channel.advancedConfig?.protocol === "runninghub" && channel.purpose === "open-source-practice")
            .flatMap((channel) => Object.values(channel.advancedConfig?.workflowConfigs || {}).map((raw) => ({ channel, workflow: normalizeWorkflow(raw) })))
            .filter(({ workflow }) => workflow.enabled && workflow.capability === capability && workflow.workflowCode === expectedCode)
            .sort((left, right) => right.workflow.version - left.workflow.version);
        const selected = workflowCandidates[0];
        if (selected) return { logicalModelId: requestedLogicalModelId?.trim() || "", capability, workflow: selected.workflow };
        if (settings.systemChannels.some((channel) => channel.advancedConfig?.protocol === "runninghub")) throw new PracticeServiceError("当前练习模块没有可用工作流", 503, "PRACTICE_WORKFLOW_UNAVAILABLE");
    }
    const key = `${capability}Model` as "textModel" | "imageModel" | "videoModel" | "audioModel";
    const requestedModel = requestedLogicalModelId?.trim() || settings.practiceDefaultModels[key] || "";
    const model = resolveLogicalModel({ logicalModels: settings.logicalModels, systemChannels: settings.systemChannels }, capability, requestedModel, "", "open-source-practice");
    if (!model || !model.channel || !["open-source-practice", "shared"].includes(model.channel.purpose || "shared")) throw new PracticeServiceError("当前练习模块没有可用的开源模型", 503, "PRACTICE_MODEL_UNAVAILABLE");
    if (module === "script") return { logicalModelId: model.logicalModelId, capability };
    const workflow = resolvePracticeWorkflow(Object.values(model.channel.advancedConfig?.workflowConfigs || {}), model.channel.id, module, requestedWorkflowCode);
    if (!workflow) throw new PracticeServiceError("当前练习模块没有可用工作流", 503, "PRACTICE_WORKFLOW_UNAVAILABLE");
    return { logicalModelId: model.logicalModelId, capability, workflow };
}

export function normalizePracticeModuleInput(module: PracticeModuleKind, input: Record<string, unknown>, references: unknown[], workflow?: RunningHubWorkflowConfig) {
    const normalizedReferences = normalizeReferences(references);
    const prompt = text(input.prompt);
    const value = module === "dubbing" ? text(input.text) : prompt;
    const multiViewPromptOptional = isCharacterMultiView(module, workflow?.workflowCode || text(input.workflowCode)) && !workflow?.inputSchema.some((field) => field.key === "prompt" && field.required);
    if (module !== "script" && !multiViewPromptOptional && !value) throw new PracticeServiceError("练习内容不能为空", 400, "PRACTICE_INPUT_INVALID");
    if (module === "character" && input.workflowCode === "character_multi_view") {
        const hasReference = normalizedReferences.some((reference) => reference.type === "asset");
        if (!hasReference) throw new PracticeServiceError("角色多视图需要一张主形象参考图", 400, "PRACTICE_REFERENCE_INVALID");
    }
    if (module === "scene" || module === "prop" || module === "character") {
        // Asset modules use their own workflow adapters while retaining the public prompt shape.
    }
    if (module === "storyboard-video") {
        const imageReferences = normalizedReferences.filter((reference) => reference.type === "asset" && !["audio", "lastFrameImage", "firstFrameImage"].includes(reference.inputKey || ""));
        if (imageReferences.length !== 1) throw new PracticeServiceError("请选择一张参考图片", 400, "PRACTICE_REFERENCE_INVALID");
        if (input.audioEnabled === true && !normalizedReferences.some((reference) => reference.type === "asset" && reference.inputKey === "audio") && !text(input.audio))
            throw new PracticeServiceError("启用台词音频后必须提供音频", 400, "PRACTICE_REFERENCE_INVALID");
    }
    const base = { ...(module === "dubbing" ? { text: value } : { prompt: value }), ...(text(input.workflowCode) ? { workflowCode: text(input.workflowCode) } : {}) };
    const accepted = new Set(["prompt", "text", "workflowCode"]);
    const workflowFields =
        workflow?.inputSchema.flatMap((field) => {
            if (accepted.has(field.key) || input[field.key] === undefined || !isPublicWorkflowField(field) || !matchesWorkflowField(field, input[field.key])) return [];
            accepted.add(field.key);
            return [[field.key, input[field.key]] as const];
        }) || [];
    const lines = module === "dubbing" ? normalizeDialogueLines(input.lines) : [];
    return { input: Object.fromEntries([...Object.entries(base), ...workflowFields, ...(lines.length ? [["lines", lines] as const] : [])]), references: normalizedReferences };
}

function resolvePracticeWorkflow(configs: readonly unknown[], channelId: string, module: PracticeModuleKind, requestedWorkflowCode?: string) {
    const code =
        requestedWorkflowCode ||
        ({ character: "character_main_view", scene: "scene_main_view", prop: "prop_main_view", "storyboard-image": "storyboard_shot", "storyboard-video": "storyboard_shot_video", dubbing: "storyboard_dialogue_audio" } as Record<string, string>)[module];
    const exact = code ? configs.map(normalizeWorkflow).find((item) => item.enabled && item.channelId === channelId && item.workflowCode === code) : undefined;
    return (
        exact ||
        (module === "music"
            ? resolveEnabledWorkflow(configs, channelId, "music")
            : module === "script"
              ? undefined
              : resolveEnabledWorkflow(configs, channelId, module === "dubbing" ? "dubbing" : module === "storyboard-video" ? "storyboard-video" : "storyboard-image"))
    );
}

function normalizeWorkflow(value: unknown) {
    return value as RunningHubWorkflowConfig;
}

function matchesWorkflowField(field: RunningHubWorkflowInputField, value: unknown) {
    if (field.type === "text" || field.type === "textarea") return typeof value === "string";
    if (field.type === "number") return typeof value === "number" && Number.isFinite(value);
    if (field.type === "boolean") return typeof value === "boolean";
    if (field.type === "enum") return typeof value === "string" && (!field.options?.length || field.options.includes(value));
    return false;
}

function isPublicWorkflowField(field: RunningHubWorkflowInputField) {
    return ["text", "textarea", "number", "enum", "boolean"].includes(field.type) && !/^s\d+_/.test(field.key);
}

function normalizeDialogueLines(value: unknown) {
    if (!Array.isArray(value)) return [];
    const emotionKeys = ["happy", "sad", "disgust", "fear", "surprise", "angry"] as const;
    return value
        .flatMap((item) => {
            const source = object(item);
            const lineText = text(source.text);
            if (!lineText || /^-[0-9]+(?:\.[0-9]+)?s-$/.test(lineText)) return [];
            const audio = text(source.audio) || text(source.audioUrl);
            const rawEmotion = object(source.emotion);
            const emotion = Object.fromEntries(emotionKeys.flatMap((key) => (typeof rawEmotion[key] === "number" && Number.isFinite(rawEmotion[key]) ? [[key, rawEmotion[key]]] : [])));
            return [{ text: lineText.slice(0, 2_000), ...(audio ? { audio: audio.slice(0, 2_000) } : {}), ...(Object.keys(emotion).length ? { emotion } : {}) }];
        })
        .slice(0, 10);
}

function defaultPracticeSessionStore(): PracticeSessionStore & { list(scope: PracticeSessionScope, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> } {
    if (getDatabaseProvider() === "postgres") return postgresSessionStore();
    return fileSessionStore();
}

function postgresSessionStore(): PracticeSessionStore & { list(scope: PracticeSessionScope, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> } {
    const repository = createPostgresRepositories().practice;
    return {
        getByRequest: (scope, clientRequestId) => repository.getPracticeSessionByClientRequest(scope, clientRequestId),
        create: (input) => repository.createPracticeSession(input),
        get: (scope, id) => repository.getPracticeSessionForUser(scope, id),
        claimDispatch: (scope, id) => repository.claimPracticeSessionDispatch(scope, id),
        resetForRetry: (scope, id) => repository.resetPracticeSessionForRetry(scope, id),
        update: (scope, id, patch) => repository.updatePracticeSession(scope, id, patch),
        delete: (scope, id) => repository.deletePracticeSession(scope, id),
        async list(scope, input) {
            return repository.listPracticeSessionsForUser(scope, input);
        },
    };
}

type FileDatabase = { version: 1; sessions: PracticeSessionRecord[] };
const FILE_NAME = "practice-sessions.json";

function fileSessionStore(): PracticeSessionStore & { list(scope: PracticeSessionScope, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> } {
    const read = () => readJsonDataFile<FileDatabase>(FILE_NAME, { version: 1, sessions: [] });
    return {
        async getByRequest(scope, clientRequestId) {
            return (await read()).sessions.map(normalizeFileSession).find((item) => (!scopeValues(scope).schoolId || item.schoolId === scopeValues(scope).schoolId) && item.userId === scopeValues(scope).ownerUserId && item.clientRequestId === clientRequestId) || null;
        },
        async create(input) {
            let record: PracticeSessionRecord;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                record = db.sessions.find((item) => item.userId === input.userId && item.clientRequestId === input.clientRequestId) || { ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                if (!db.sessions.some((item) => item.id === record.id)) await writeJsonDataFile(FILE_NAME, { ...db, sessions: [record, ...db.sessions] });
            });
            return record!;
        },
        async get(scope, id) {
            return (await read()).sessions.map(normalizeFileSession).find((item) => (!scopeValues(scope).schoolId || item.schoolId === scopeValues(scope).schoolId) && item.userId === scopeValues(scope).ownerUserId && item.id === id) || null;
        },
        async claimDispatch(scope, id) {
            let claimed: PracticeSessionRecord | null = null;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.map((item) => {
                    if ((scopeValues(scope).schoolId && item.schoolId !== scopeValues(scope).schoolId) || item.userId !== scopeValues(scope).ownerUserId || item.id !== id || item.status !== "queued" || (Array.isArray(item.taskRefs) && item.taskRefs.length)) return item;
                    claimed = { ...item, status: "running", updatedAt: new Date().toISOString() };
                    return claimed;
                });
                if (claimed) await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
            return claimed;
        },
        async resetForRetry(scope, id) {
            let reset: PracticeSessionRecord | null = null;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.map((item) => {
                    if (
                        item.schoolId !== scopeValues(scope).schoolId ||
                        item.userId !== scopeValues(scope).ownerUserId ||
                        item.id !== id ||
                        (item.status !== "failed" && item.status !== "cancelled" && !(item.status === "running" && (!Array.isArray(item.taskRefs) || !item.taskRefs.length)))
                    )
                        return item;
                    reset = { ...item, status: "queued", taskRefs: [], errorCode: undefined, errorMessage: undefined, updatedAt: new Date().toISOString() };
                    return reset;
                });
                if (reset) await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
            return reset;
        },
        async update(scope, id, patch) {
            let updated: PracticeSessionRecord | null = null;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.map((item) =>
                    (!scopeValues(scope).schoolId || item.schoolId === scopeValues(scope).schoolId) && item.userId === scopeValues(scope).ownerUserId && item.id === id ? (updated = { ...item, ...patch, updatedAt: new Date().toISOString() }) : item,
                );
                await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
            return updated;
        },
        async delete(scope, id) {
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.filter((item) => !((!scopeValues(scope).schoolId || item.schoolId === scopeValues(scope).schoolId) && item.userId === scopeValues(scope).ownerUserId && item.id === id));
                await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
        },
        async list(scope, input) {
            const all = (await read()).sessions
                .map(normalizeFileSession)
                .filter((item) => (!scopeValues(scope).schoolId || item.schoolId === scopeValues(scope).schoolId) && item.userId === scopeValues(scope).ownerUserId && (!input.module || item.module === input.module))
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
            return { items: all.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: all.length };
        },
    };
}

function normalizeFileSession(value: PracticeSessionRecord): PracticeSessionRecord {
    return { ...value, mode: value.mode === "manual" ? "manual" : "workflow" };
}

function scopeValues(scope: PracticeSessionScope): PracticeTenantScope {
    return typeof scope === "string" ? { schoolId: "", ownerUserId: scope } : scope;
}

function sessionScope(session: Pick<PracticeSessionRecord, "schoolId" | "userId">): PracticeTenantScope {
    if (!session.schoolId) throw new PracticeServiceError("练习会话租户范围缺失", 409);
    return { schoolId: session.schoolId, ownerUserId: session.userId };
}

function isCharacterMultiView(module: PracticeModuleKind, workflowCode?: string) {
    return module === "character" && workflowCode === "character_multi_view";
}

function normalizeModule(value: unknown): PracticeModuleKind {
    if (value === "character" || value === "scene" || value === "prop" || value === "storyboard-image" || value === "storyboard-video" || value === "dubbing" || value === "music") return value;
    if (value === "script") return value;
    throw new PracticeServiceError("练习模块无效", 400);
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeReferences(value: unknown) {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const assets = value.flatMap((item) => {
        const source = object(item);
        const id = text(source.id);
        const inputKey = normalizeReferenceInputKey(source.inputKey);
        const identity = `${id}:${inputKey || ""}`;
        if (source.type !== "asset" || !id || seen.has(identity)) return [];
        seen.add(identity);
        return [{ type: "asset" as const, id, ...(inputKey ? { inputKey } : {}) }];
    });
    const ipReferences = normalizeIpReferences(value.filter((item) => object(item).type === "ip"));
    return [...assets, ...ipReferences];
}

function normalizeReferenceInputKey(value: unknown) {
    const key = text(value);
    return ["referenceImage", "firstFrameImage", "lastFrameImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image", "audio"].includes(key) ? key : undefined;
}

function hasTaskReference(session: Pick<PracticeSessionRecord, "taskRefs">) {
    const reference = Array.isArray(session.taskRefs) ? session.taskRefs[0] : undefined;
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return false;
    return typeof reference.taskId === "string" && reference.taskId.trim().length > 0 && ["text", "image", "video", "audio"].includes(String(reference.taskType));
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanOptional(value: unknown, max: number) {
    const text = clean(value, max);
    return text || undefined;
}

function positive(value: unknown, fallback: number) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function publicErrorCode(error: unknown, fallback: PracticePublicErrorCode): PracticePublicErrorCode {
    return error instanceof PracticeServiceError && error.code ? error.code : fallback;
}

function publicErrorMessage(_error: unknown, code: PracticePublicErrorCode) {
    if (code === "PRACTICE_MODEL_UNAVAILABLE") return "当前练习模块没有可用的开源模型";
    if (code === "PRACTICE_WORKFLOW_UNAVAILABLE") return "当前练习模块没有可用工作流";
    if (code === "PRACTICE_INPUT_INVALID") return "练习输入不完整";
    if (code === "PRACTICE_REFERENCE_INVALID") return "练习引用素材不可用";
    if (code === "PRACTICE_DISPATCH_NOT_STARTED") return "练习任务尚未提交，请重试";
    if (code === "PRACTICE_TASK_CANCELLED") return "练习任务已取消";
    if (code === "PRACTICE_TASK_FAILED") return "练习任务执行失败，请重试";
    if (code === "PRACTICE_SUBMISSION_UNKNOWN") return "练习任务已提交，结果待确认";
    return "练习任务提交失败，请重试";
}

