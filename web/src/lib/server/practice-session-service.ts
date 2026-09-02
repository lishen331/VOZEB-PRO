import { nanoid } from "nanoid";

import type { PracticeModuleKind, PracticeProjectKind } from "@/lib/practice-domain";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModel } from "@/lib/server/logical-model-router";
import { getDatabaseProvider, createPostgresRepositories } from "@/lib/server/database";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import type { JsonValue, PracticeSessionRecord } from "@/lib/server/database/repository-types";
import { requirePracticeAccess, type PracticeActor } from "./practice-access-service";
import { getTextTask } from "@/lib/server/text-task-store";
import { getImageTask } from "@/lib/server/image-task-store";
import { getVideoTask } from "@/lib/server/video-task-store";
import { getAudioTask } from "@/lib/server/audio-task-store";
import type { IpReference } from "@/lib/ip-library-domain";
import { normalizeIpReferences, recordIpReferenceUsage, validateIpReferences } from "./ip-library-reference-service";
import type { RunningHubWorkflowConfig } from "@/lib/auth/store-types";
import { resolveEnabledWorkflow } from "./runninghub-workflow-domain";

export type PracticeSessionCreateInput = {
    module: PracticeModuleKind;
    title: string;
    input: Record<string, unknown>;
    references?: unknown[];
    clientRequestId: string;
    projectId?: string;
    projectKind?: PracticeProjectKind;
};

export type PracticeTaskDispatchInput = {
    sessionId: string;
    userId: string;
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

export interface PracticeSessionStore {
    getByRequest(userId: string, clientRequestId: string): Promise<PracticeSessionRecord | null>;
    create(input: Omit<PracticeSessionRecord, "createdAt" | "updatedAt">): Promise<PracticeSessionRecord>;
    get(userId: string, id: string): Promise<PracticeSessionRecord | null>;
    claimDispatch(userId: string, id: string): Promise<PracticeSessionRecord | null>;
    resetForRetry(userId: string, id: string): Promise<PracticeSessionRecord | null>;
    update(userId: string, id: string, patch: Partial<Pick<PracticeSessionRecord, "status" | "taskRefs" | "prompt" | "input" | "title">>): Promise<PracticeSessionRecord | null>;
}

export async function createPracticeSessionForUser(
    actor: PracticeActor,
    input: PracticeSessionCreateInput,
    deps: { store?: PracticeSessionStore; dispatch?: (input: PracticeTaskDispatchInput) => Promise<PracticeTaskDispatchResult>; resolveModel?: (module: PracticeModuleKind) => Promise<PracticeModelResolution> } = {},
) {
    await requirePracticeAccess(actor);
    const store = deps.store || defaultPracticeSessionStore();
    const clientRequestId = clean(input.clientRequestId, 160);
    if (!clientRequestId) throw new PracticeServiceError("缺少练习请求标识", 400);
    const existing = await store.getByRequest(actor.id, clientRequestId);
    if (existing) {
        if (existing.status !== "queued" || (Array.isArray(existing.taskRefs) && existing.taskRefs.length) || !deps.dispatch) return publicSession(existing);
        return dispatchQueuedSession(actor.id, existing, clientRequestId, store, deps.dispatch, deps.resolveModel || defaultResolveModel);
    }
    const moduleKind = normalizeModule(input.module);
    const title = clean(input.title, 120) || "练习会话";
    const sourcePayload = object(input.input);
    const prompt = text(sourcePayload.prompt);
    if (!prompt) throw new PracticeServiceError("练习内容不能为空", 400);
    const references = normalizeReferences(input.references);
    const ipReferences = references.filter((reference): reference is IpReference => reference.type === "ip");
    await validateIpReferences(actor.id, ipReferences);
    const payload = { prompt, ...(references.length ? { references } : {}) };
    if (!deps.dispatch) await (deps.resolveModel || defaultResolveModel)(moduleKind);
    const created = await store.create({
        id: `practice-session-${nanoid()}`,
        userId: actor.id,
        projectId: cleanOptional(input.projectId, 160),
        projectKind: input.projectKind === "drama" ? "drama" : "canvas",
        module: moduleKind,
        title,
        clientRequestId,
        executionProfile: "open-source-practice",
        prompt: (payload.prompt || "") as JsonValue,
        input: payload as JsonValue,
        taskRefs: [],
        status: "queued",
    });
    const dispatch = deps.dispatch;
    if (!dispatch) {
        if (ipReferences.length) await recordIpReferenceUsage(actor.id, { targetType: "practice", targetId: created.id, references: ipReferences });
        return publicSession(created);
    }
    return dispatchQueuedSession(actor.id, created, clientRequestId, store, dispatch, deps.resolveModel || defaultResolveModel);
}

async function dispatchQueuedSession(
    userId: string,
    session: PracticeSessionRecord,
    clientRequestId: string,
    store: PracticeSessionStore,
    dispatch: (input: PracticeTaskDispatchInput) => Promise<PracticeTaskDispatchResult>,
    resolveModel: (module: PracticeModuleKind) => Promise<PracticeModelResolution>,
) {
    const claimed = await store.claimDispatch(userId, session.id);
    if (!claimed) return publicSession((await store.get(userId, session.id)) || session);
    const storedInput = object(claimed.input);
    const references = normalizeReferences(storedInput.references);
    const ipReferences = references.filter((reference): reference is IpReference => reference.type === "ip");
    let model: PracticeModelResolution;
    try {
        await validateIpReferences(userId, ipReferences);
        if (ipReferences.length) await recordIpReferenceUsage(userId, { targetType: "practice", targetId: claimed.id, references: ipReferences });
        model = await resolveModel(claimed.module);
    } catch (error) {
        await store.update(userId, claimed.id, { status: "queued" });
        throw error;
    }
    try {
        const task = await dispatch({
            sessionId: claimed.id,
            userId,
            module: claimed.module,
            input: { prompt: text(storedInput.prompt) },
            references,
            executionProfile: "open-source-practice",
            capability: model.capability,
            logicalModelId: model.logicalModelId,
            clientRequestId,
            projectKind: claimed.projectKind,
            ...(model.workflow ? { workflow: model.workflow } : {}),
        });
        const running = await store.update(userId, claimed.id, { taskRefs: [{ taskId: task.taskId, taskType: task.taskType }] as unknown as JsonValue });
        return publicSession(running || claimed);
    } catch (error) {
        await store.update(userId, claimed.id, { status: "failed" });
        throw error;
    }
}

export async function getPracticeSessionForUser(actor: PracticeActor, id: string, deps: { store?: PracticeSessionStore } = {}) {
    await requirePracticeAccess(actor);
    const session = await (deps.store || defaultPracticeSessionStore()).get(actor.id, clean(id, 160));
    if (!session) throw new PracticeServiceError("练习会话不存在", 404);
    return publicSession(session);
}

export async function listPracticeSessionsForUser(actor: PracticeActor, input: { page?: unknown; pageSize?: unknown; module?: PracticeModuleKind } = {}, deps: { store?: PracticeSessionStore } = {}) {
    await requirePracticeAccess(actor);
    const page = positive(input.page, 1);
    const pageSize = Math.min(100, positive(input.pageSize, 12));
    const records = await ((deps.store as PracticeSessionListStore | undefined) || defaultPracticeSessionStore()).list(actor.id, { page, pageSize, module: input.module });
    return { sessions: await Promise.all(records.items.map(publicSession)), total: records.total, page, pageSize };
}

export async function retryPracticeSessionForUser(
    actor: PracticeActor,
    id: string,
    deps: { store?: PracticeSessionStore; dispatch?: (input: PracticeTaskDispatchInput) => Promise<PracticeTaskDispatchResult>; resolveModel?: (module: PracticeModuleKind) => Promise<PracticeModelResolution> } = {},
) {
    await requirePracticeAccess(actor);
    const store = deps.store || defaultPracticeSessionStore();
    const current = await store.get(actor.id, clean(id, 160));
    if (!current) throw new PracticeServiceError("练习会话不存在", 404);
    if (current.status !== "failed" && current.status !== "cancelled") throw new PracticeServiceError("当前练习无需重试", 409);
    const storedInput = object(current.input);
    const references = normalizeReferences(storedInput.references);
    await validateIpReferences(
        actor.id,
        references.filter((reference): reference is IpReference => reference.type === "ip"),
    );
    const reset = await store.resetForRetry(actor.id, current.id);
    if (!reset) {
        const latest = await store.get(actor.id, current.id);
        if (latest && latest.status !== "failed" && latest.status !== "cancelled") return publicSession(latest);
        throw new PracticeServiceError("练习状态更新失败", 409);
    }
    const dispatch = deps.dispatch;
    if (!dispatch) {
        await (deps.resolveModel || defaultResolveModel)(current.module);
        return publicSession(reset);
    }
    return dispatchQueuedSession(actor.id, reset, current.clientRequestId, store, dispatch, deps.resolveModel || defaultResolveModel);
}

export class PracticeServiceError extends Error {
    constructor(
        readonly message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

type PracticeSessionListStore = PracticeSessionStore & { list(userId: string, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> };

async function publicSession(session: PracticeSessionRecord) {
    const task = await publicTaskResult(session);
    return {
        id: session.id,
        title: session.title,
        module: session.module,
        projectId: session.projectId,
        projectKind: session.projectKind,
        input: session.input,
        status: task?.status === "success" ? "success" : task?.status === "error" ? "failed" : task?.status === "cancelled" ? "cancelled" : session.status,
        ...(task ? { result: task } : {}),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
    };
}

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
    if (task.status === "error") return { status: "error" as const, error: task.error || "练习失败" };
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
    return { status: "success" as const, media: typeof result.url === "string" ? { kind: "audio" as const, url: result.url } : undefined };
}

async function defaultResolveModel(module: PracticeModuleKind): Promise<PracticeModelResolution> {
    const settings = await getAuthSettings();
    return resolvePracticeModelFromSettings(settings, module);
}

export function resolvePracticeModelFromSettings(settings: Awaited<ReturnType<typeof getAuthSettings>>, module: PracticeModuleKind): PracticeModelResolution {
    const capability = module === "script" ? "text" : module === "storyboard-image" ? "image" : module === "storyboard-video" ? "video" : "audio";
    const key = `${capability}Model` as "textModel" | "imageModel" | "videoModel" | "audioModel";
    const boundModels = settings.practiceWorkflowModels[module] || [];
    const requestedModel = (Array.isArray(boundModels) ? boundModels[0] : boundModels) || settings.practiceDefaultModels[key];
    const model = resolveLogicalModel({ logicalModels: settings.logicalModels, systemChannels: settings.systemChannels }, capability, requestedModel, "", "open-source-practice");
    if (!model || !model.channel || !["open-source-practice", "shared"].includes(model.channel.purpose || "shared")) throw new PracticeServiceError("当前练习模块没有可用的开源模型", 503);
    const workflowModelBinding = settings.practiceWorkflowModels[module];
    if (!workflowModelBinding || (Array.isArray(workflowModelBinding) && workflowModelBinding.length === 0)) return { logicalModelId: model.logicalModelId, capability };
    const workflow = resolveEnabledWorkflow(Object.values(model.channel.advancedConfig?.workflowConfigs || {}), model.channel.id, module);
    if (!workflow) throw new PracticeServiceError("当前练习模块没有可用的 RunningHub 工作流", 503);
    return { logicalModelId: model.logicalModelId, capability, workflow };
}

function defaultPracticeSessionStore(): PracticeSessionStore & { list(userId: string, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> } {
    if (getDatabaseProvider() === "postgres") return postgresSessionStore();
    return fileSessionStore();
}

function postgresSessionStore(): PracticeSessionStore & { list(userId: string, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> } {
    const repository = createPostgresRepositories().practice;
    return {
        getByRequest: (userId, clientRequestId) => repository.getPracticeSessionByClientRequest(userId, clientRequestId),
        create: (input) => repository.createPracticeSession(input),
        get: (userId, id) => repository.getPracticeSessionForUser(userId, id),
        claimDispatch: (userId, id) => repository.claimPracticeSessionDispatch(userId, id),
        resetForRetry: (userId, id) => repository.resetPracticeSessionForRetry(userId, id),
        update: (userId, id, patch) => repository.updatePracticeSession(userId, id, patch),
        async list(userId, input) {
            return repository.listPracticeSessionsForUser(userId, input);
        },
    };
}

type FileDatabase = { version: 1; sessions: PracticeSessionRecord[] };
const FILE_NAME = "practice-sessions.json";

function fileSessionStore(): PracticeSessionStore & { list(userId: string, input: { page: number; pageSize: number; module?: PracticeModuleKind }): Promise<{ items: PracticeSessionRecord[]; total: number }> } {
    const read = () => readJsonDataFile<FileDatabase>(FILE_NAME, { version: 1, sessions: [] });
    return {
        async getByRequest(userId, clientRequestId) {
            return (await read()).sessions.find((item) => item.userId === userId && item.clientRequestId === clientRequestId) || null;
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
        async get(userId, id) {
            return (await read()).sessions.find((item) => item.userId === userId && item.id === id) || null;
        },
        async claimDispatch(userId, id) {
            let claimed: PracticeSessionRecord | null = null;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.map((item) => {
                    if (item.userId !== userId || item.id !== id || item.status !== "queued" || (Array.isArray(item.taskRefs) && item.taskRefs.length)) return item;
                    claimed = { ...item, status: "running", updatedAt: new Date().toISOString() };
                    return claimed;
                });
                if (claimed) await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
            return claimed;
        },
        async resetForRetry(userId, id) {
            let reset: PracticeSessionRecord | null = null;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.map((item) => {
                    if (item.userId !== userId || item.id !== id || (item.status !== "failed" && item.status !== "cancelled")) return item;
                    reset = { ...item, status: "queued", taskRefs: [], updatedAt: new Date().toISOString() };
                    return reset;
                });
                if (reset) await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
            return reset;
        },
        async update(userId, id, patch) {
            let updated: PracticeSessionRecord | null = null;
            await withJsonDataFileLock(FILE_NAME, async () => {
                const db = await read();
                const sessions = db.sessions.map((item) => (item.userId === userId && item.id === id ? (updated = { ...item, ...patch, updatedAt: new Date().toISOString() }) : item));
                await writeJsonDataFile(FILE_NAME, { ...db, sessions });
            });
            return updated;
        },
        async list(userId, input) {
            const all = (await read()).sessions.filter((item) => item.userId === userId && (!input.module || item.module === input.module)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
            return { items: all.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: all.length };
        },
    };
}

function normalizeModule(value: unknown): PracticeModuleKind {
    if (value === "storyboard-image" || value === "storyboard-video" || value === "dubbing" || value === "music") return value;
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
        if (source.type !== "asset" || !id || seen.has(id)) return [];
        seen.add(id);
        return [{ type: "asset" as const, id }];
    });
    const ipReferences = normalizeIpReferences(value.filter((item) => object(item).type === "ip"));
    return [...assets, ...ipReferences];
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
