import { createHash } from "node:crypto";

import { nanoid } from "nanoid";

import type { CanvasProject, CanvasProjectMutation, CanvasProjectSaveAck, CreateCanvasProjectInput } from "@/lib/canvas-project-contract";
import { DRAMA_LAB_CANVAS_HANDOFF_PREFIX, dramaLabEpisodeCanvasHandoffId, isDramaLabCanvasProject, parseDramaLabEpisodeCanvasHandoffId } from "@/lib/drama-lab-canvas-contract";
import {
    createCanvasProject,
    CanvasProjectStoreError,
    getCanvasProject,
    getCanvasProjectWithOwner,
    listCanvasProjectSummaries,
    listDramaLabCanvasProjectSummariesForProjects,
    updateCanvasProject,
    updateCanvasProjectMutationPatch,
} from "@/lib/server/canvas-project-store";
import { getDramaLabMembership, getDramaLabProjectGroup, listDramaLabProjectIdsForUser } from "@/lib/server/drama-lab-collaboration-service";
import { deleteUserMediaAssetsCascade } from "@/lib/server/user-media-deletion-service";
import { createCreativeConversation, updateCreativeConversation } from "@/lib/server/creative-runtime-store";
import { CreativeEntityDeletionConflict, deleteCanvasAssistantConversationAggregates, deleteCanvasProjectAggregates } from "@/lib/server/creative-entity-deletion-store";
import type { CanvasProjectIdentityInput } from "@/lib/server/canvas-project-store";
import type { IpReference } from "@/lib/ip-library-domain";
import { normalizeIpReferences, recordIpReferenceUsage, validateIpReferences } from "@/lib/server/ip-library-reference-service";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";

const MAX_PROJECT_BYTES = 5 * 1024 * 1024;
type CanvasProjectScope = "ordinary" | "drama-lab";

export class CanvasProjectServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export function listCanvasProjectsForUser(userId: string, input: { page?: unknown; pageSize?: unknown; executionProfile?: "production" | "open-source-practice"; schoolId?: string } = {}) {
    return listCanvasProjectSummaries(userId, {
        page: positiveInteger(input.page, 1, 1_000_000),
        pageSize: positiveInteger(input.pageSize, 12, 100),
        executionProfile: input.executionProfile || "production",
        schoolId: input.schoolId,
    });
}

export async function listDramaLabCanvasProjectsForUser(userId: string, input: { page?: unknown; pageSize?: unknown } = {}) {
    const page = positiveInteger(input.page, 1, 1_000_000);
    const pageSize = positiveInteger(input.pageSize, 12, 100);
    const projectIds = await listDramaLabProjectIdsForUser(userId);
    return listDramaLabCanvasProjectSummariesForProjects(projectIds, { page, pageSize });
}

export async function getCanvasProjectForUser(userId: string, id: string) {
    return getScopedCanvasProjectForUser(userId, id, "ordinary");
}

export async function createCanvasProjectForUser(userId: string, value: unknown, identity: CanvasProjectIdentityInput = {}) {
    return createScopedCanvasProjectForUser(userId, value, identity, "ordinary");
}

export async function getDramaLabCanvasProjectForUser(userId: string, id: string) {
    return (await resolveDramaLabCanvasProjectForUser(userId, id)).project;
}

/** Resolve a drama Canvas after checking project-group membership. */
export async function getDramaLabCanvasProjectWithOwnerForUser(userId: string, id: string) {
    return resolveDramaLabCanvasProjectForUser(userId, id);
}

export async function createDramaLabCanvasProjectForUser(userId: string, value: unknown, identity: CanvasProjectIdentityInput = {}) {
    return createScopedCanvasProjectForUser(userId, value, identity, "drama-lab");
}

async function createScopedCanvasProjectForUser(userId: string, value: unknown, identity: CanvasProjectIdentityInput, scope: CanvasProjectScope) {
    const input = object(value) as CreateCanvasProjectInput;
    const source = object(input.project);
    const sourceHandoffId = normalizeSourceHandoffId(input.sourceHandoffId || source.sourceHandoffId, scope);
    assertCreateScope(sourceHandoffId, scope);
    const id = sourceHandoffId ? canvasHandoffProjectId(userId, sourceHandoffId) : `canvas-${nanoid()}`;
    if (sourceHandoffId) {
        const existing = await getCanvasProject(id, userId);
        if (existing) return assertCanvasProjectScope(existing, scope);
    }
    const title = text(input.title || source.title, 120) || "未命名画布";
    const previews = await validateIpReferences(userId, input.ipReferences ?? source.ipReferences);
    const ipReferences = previews.map((item) => item.reference);
    const now = new Date().toISOString();
    const conversation = await createCreativeConversation(userId, { surface: "canvas", projectId: id, title });
    const project = normalizeProject(source, {
        id,
        sourceHandoffId: sourceHandoffId || undefined,
        creativeConversationId: conversation.id,
        title,
        createdAt: now,
        updatedAt: now,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
        ipReferences,
    });
    try {
        if (ipReferences.length) await recordIpReferenceUsage(userId, { targetType: identity.executionProfile === "open-source-practice" ? "practice" : "canvas", targetId: project.id, references: ipReferences });
        return await createCanvasProject(userId, project, identity);
    } catch (error) {
        await updateCreativeConversation(conversation.id, userId, { status: "archived" }).catch(() => null);
        if (sourceHandoffId && error instanceof CanvasProjectStoreError && error.status === 409) {
            const existing = await getCanvasProject(id, userId);
            if (existing) return assertCanvasProjectScope(existing, scope);
        }
        throw error;
    }
}

export async function updateCanvasProjectForUser(userId: string, id: string, value: unknown) {
    return updateScopedCanvasProjectForUser(userId, id, value, "ordinary");
}

export async function updateDramaLabCanvasProjectForUser(userId: string, id: string, value: unknown) {
    return updateScopedCanvasProjectForUser(userId, id, value, "drama-lab");
}

async function updateScopedCanvasProjectForUser(userId: string, id: string, value: unknown, scope: CanvasProjectScope) {
    const input = object(value);
    const mutation = object(input.mutation);
    if (Object.keys(mutation).length) return updateCanvasProjectMutationForUser(userId, id, mutation, scope);
    const expectedUpdatedAt = isoTimestamp(input.expectedUpdatedAt);
    if (!expectedUpdatedAt) throw new CanvasProjectServiceError("缺少画布项目版本，请刷新后重试", 400);
    const resolved = scope === "drama-lab" ? await resolveDramaLabCanvasProjectForUser(userId, id) : { project: await getScopedCanvasProjectForUser(userId, id, scope), ownerUserId: userId };
    const current = resolved.project;
    const storageOwnerUserId = resolved.ownerUserId;
    const source = object(input.project);
    const ipReferences = source.ipReferences === undefined ? current.ipReferences || [] : await validateIpReferenceUpdate(storageOwnerUserId, current.ipReferences, source.ipReferences);
    const project = normalizeProject({ ...source, ipReferences }, current);
    const added = addedIpReferences(current.ipReferences, ipReferences);
    if (added.length) await recordIpReferenceUsage(storageOwnerUserId, { targetType: canvasUsageTarget(current), targetId: current.id, references: added });
    return updateCanvasProject(storageOwnerUserId, project, expectedUpdatedAt);
}

async function updateCanvasProjectMutationForUser(userId: string, id: string, input: Record<string, unknown>, scope: CanvasProjectScope): Promise<CanvasProjectSaveAck> {
    const mutationId = text(input.mutationId, 160);
    const baseUpdatedAt = isoTimestamp(input.baseUpdatedAt);
    if (!mutationId || !baseUpdatedAt) throw new CanvasProjectServiceError("缺少画布项目版本或操作标识，请刷新后重试", 400);
    const projectId = text(id, 160);
    const resolved = scope === "drama-lab" ? await resolveDramaLabCanvasProjectForUser(userId, projectId) : { project: await getScopedCanvasProjectForUser(userId, projectId, scope), ownerUserId: userId };
    const current = resolved.project;
    const storageOwnerUserId = resolved.ownerUserId;
    let added: IpReference[] = [];
    if (input.ipReferences !== undefined) {
        const ipReferences = await validateIpReferenceUpdate(storageOwnerUserId, current.ipReferences, input.ipReferences);
        input = { ...input, ipReferences };
        added = addedIpReferences(current.ipReferences, ipReferences);
    }
    const mutation = normalizeMutation(input, mutationId, baseUpdatedAt);
    if (added.length) await recordIpReferenceUsage(storageOwnerUserId, { targetType: canvasUsageTarget(current), targetId: projectId, references: added });
    return updateCanvasProjectMutationPatch(storageOwnerUserId, projectId, mutation);
}

async function validateIpReferenceUpdate(userId: string, current: unknown, incoming: unknown) {
    await validateIpReferences(userId, current);
    return (await validateIpReferences(userId, incoming)).map((item) => item.reference);
}

function canvasUsageTarget(project: CanvasProject | null) {
    return (project as (CanvasProject & { executionProfile?: string }) | null)?.executionProfile === "open-source-practice" ? ("practice" as const) : ("canvas" as const);
}

export async function deleteCanvasProjectsForUser(userId: string, value: unknown) {
    const ids = Array.isArray(value) ? normalizeEntityDeletes(value) : [];
    const projects = await Promise.all(
        ids.map(async (id) => {
            const project = await getCanvasProject(id, userId);
            if (!project) return null;
            const scoped = assertCanvasProjectScope(project, "ordinary");
            if ((scoped as CanvasProject & { executionProfile?: string }).executionProfile === "open-source-practice") await requireCurrentPracticeAccess(userId, "画布");
            return scoped;
        }),
    );
    if (projects.some((project) => project && isDramaLabCanvasProject(project))) throw canvasProjectNotFound();
    const result = await deleteCanvasProjectAggregates(userId, ids);
    await deleteUserMediaAssetsCascade(userId, result.mediaStorageKeys);
    return result.deletedProjects;
}

export async function deleteDramaLabEpisodeCanvasForUser(userId: string, dramaProjectId: string, episodeId: string) {
    const projectId = dramaProjectId.trim();
    const sourceHandoffId = dramaLabEpisodeCanvasHandoffId(projectId, episodeId.trim());
    if (!projectId || !episodeId.trim()) return false;

    // A collaboration Canvas is stored under the stable physical owner, not
    // necessarily the current logical project manager.  Legacy projects with
    // no group retain the previous caller-owned lookup for backwards
    // compatibility.
    const group = await getDramaLabProjectGroup(projectId);
    let storageOwnerUserId = userId;
    if (group) {
        const membership = await getDramaLabMembership(userId, projectId);
        if (!membership) return false;
        const drama = await import("@/lib/server/drama-project-store").then(({ getDramaProjectWithOwner }) => getDramaProjectWithOwner(projectId));
        if (!drama) return false;
        storageOwnerUserId = drama.ownerUserId;
    }
    const id = canvasHandoffProjectId(storageOwnerUserId, sourceHandoffId);
    const project = await getCanvasProject(id, storageOwnerUserId);
    if (!project || project.sourceHandoffId !== sourceHandoffId || !isDramaLabCanvasProject(project)) return false;
    const result = await deleteCanvasProjectAggregates(storageOwnerUserId, [id], { includeDramaLab: true });
    await deleteUserMediaAssetsCascade(storageOwnerUserId, result.mediaStorageKeys);
    return result.deletedProjects > 0;
}

export async function deleteCanvasAssistantConversationsForUser(userId: string, projectId: string, value: unknown) {
    return deleteScopedCanvasAssistantConversationsForUser(userId, projectId, value, "ordinary");
}

export async function deleteDramaLabCanvasAssistantConversationsForUser(userId: string, projectId: string, value: unknown) {
    return deleteScopedCanvasAssistantConversationsForUser(userId, projectId, value, "drama-lab");
}

async function deleteScopedCanvasAssistantConversationsForUser(userId: string, projectId: string, value: unknown, scope: CanvasProjectScope) {
    const ids = normalizeEntityDeletes(Array.isArray(value) ? value : []);
    const resolved = scope === "drama-lab" ? await resolveDramaLabCanvasProjectForUser(userId, projectId) : { project: await getScopedCanvasProjectForUser(userId, projectId, scope), ownerUserId: userId };
    const project = resolved.project;
    const storageOwnerUserId = resolved.ownerUserId;
    if (!ids.length) return { deleted: 0, chatSessions: project.chatSessions, activeChatId: project.activeChatId };
    let result: Awaited<ReturnType<typeof deleteCanvasAssistantConversationAggregates>>;
    try {
        result = scope === "drama-lab" ? await deleteCanvasAssistantConversationAggregates(storageOwnerUserId, projectId, ids, { includeDramaLab: true }) : await deleteCanvasAssistantConversationAggregates(storageOwnerUserId, projectId, ids);
    } catch (error) {
        if (error instanceof CreativeEntityDeletionConflict) throw new CanvasProjectServiceError(error.message, 409);
        throw error;
    }
    await deleteUserMediaAssetsCascade(storageOwnerUserId, result.mediaStorageKeys);
    return { deleted: result.deletedConversations, chatSessions: result.canvasAssistantState?.chatSessions || [], activeChatId: result.canvasAssistantState?.activeChatId || null };
}

async function getScopedCanvasProjectForUser(userId: string, id: string, scope: CanvasProjectScope) {
    const project = await getCanvasProject(text(id, 160), userId);
    if (!project) throw canvasProjectNotFound();
    const scoped = assertCanvasProjectScope(project, scope);
    if ((scoped as CanvasProject & { executionProfile?: string }).executionProfile === "open-source-practice") await requireCurrentPracticeAccess(userId, "画布");
    return scoped;
}

async function requireCurrentPracticeAccess(userId: string, label: string) {
    try {
        await requirePracticeAccess({ id: userId });
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 403;
        throw new CanvasProjectServiceError(error instanceof Error ? error.message : `${label}练习权限已失效`, status);
    }
}

function assertCanvasProjectScope(project: CanvasProject, scope: CanvasProjectScope) {
    if (isDramaLabCanvasProject(project) !== (scope === "drama-lab")) throw canvasProjectNotFound();
    return project;
}

function assertCreateScope(sourceHandoffId: string, scope: CanvasProjectScope) {
    const isDramaLab = sourceHandoffId.startsWith(DRAMA_LAB_CANVAS_HANDOFF_PREFIX);
    if (scope === "drama-lab" ? !isDramaLab : isDramaLab) throw new CanvasProjectServiceError("画布项目来源无效", 400);
}

async function resolveDramaLabCanvasProjectForUser(userId: string, id: string) {
    const ownedByCaller = await getCanvasProject(id, userId);
    const direct = ownedByCaller ? { project: ownedByCaller, ownerUserId: userId } : await getCanvasProjectWithOwner(id);
    if (!direct || !isDramaLabCanvasProject(direct.project)) throw canvasProjectNotFound();
    const binding = parseDramaLabEpisodeCanvasHandoffId(direct.project.sourceHandoffId);
    if (!binding) throw canvasProjectNotFound();
    const group = await getDramaLabProjectGroup(binding.projectId);
    if (group) {
        const membership = await getDramaLabMembership(userId, binding.projectId);
        if (!membership) throw canvasProjectNotFound();
    } else if (direct.ownerUserId !== userId) {
        throw canvasProjectNotFound();
    }
    // A valid handoff is not enough on its own. Reject stale canvases whose
    // source episode has been deleted (or belongs to another project).
    const { getDramaProjectWithOwner } = await import("@/lib/server/drama-project-store");
    const drama = await getDramaProjectWithOwner(binding.projectId);
    if (!drama || !drama.project.episodes.some((episode) => episode.id === binding.episodeId)) throw canvasProjectNotFound();
    return { project: assertCanvasProjectScope(direct.project, "drama-lab"), ownerUserId: direct.ownerUserId };
}

function normalizeSourceHandoffId(value: unknown, scope: CanvasProjectScope) {
    const sourceHandoffId = typeof value === "string" ? value.trim() : "";
    const maxLength = scope === "drama-lab" ? 512 : 160;
    if (sourceHandoffId.length > maxLength) throw new CanvasProjectServiceError("画布项目来源标识过长", 400);
    return sourceHandoffId;
}

function canvasProjectNotFound() {
    return new CanvasProjectServiceError("画布项目不存在", 404);
}

function normalizeProject(value: Record<string, unknown>, current: CanvasProject): CanvasProject {
    const sanitized = sanitizeProjectPayload(value);
    const nodes = Array.isArray(sanitized.nodes) ? sanitized.nodes : current.nodes;
    const connections = Array.isArray(sanitized.connections) ? sanitized.connections : current.connections;
    const chatSessions = Array.isArray(sanitized.chatSessions) ? sanitized.chatSessions : current.chatSessions;
    return {
        ...current,
        title: text(sanitized.title, 120) || current.title,
        nodes: nodes as CanvasProject["nodes"],
        connections: connections as CanvasProject["connections"],
        chatSessions: chatSessions as CanvasProject["chatSessions"],
        activeChatId: typeof sanitized.activeChatId === "string" ? sanitized.activeChatId.slice(0, 160) : sanitized.activeChatId === null ? null : current.activeChatId,
        backgroundMode: sanitized.backgroundMode === "dots" || sanitized.backgroundMode === "blank" ? sanitized.backgroundMode : "lines",
        showImageInfo: sanitized.showImageInfo === true,
        viewport: normalizeViewport(sanitized.viewport, current.viewport),
        ipReferences: sanitized.ipReferences === undefined ? current.ipReferences || [] : normalizeIpReferences(sanitized.ipReferences),
        createdAt: current.createdAt,
        updatedAt: nextProjectVersion(current.updatedAt),
        id: current.id,
        sourceHandoffId: current.sourceHandoffId,
        creativeConversationId: current.creativeConversationId,
    };
}

function normalizeMutation(input: Record<string, unknown>, mutationId: string, baseUpdatedAt: string): CanvasProjectMutation {
    const sanitized = sanitizeProjectPayload(input);
    const mutation: CanvasProjectMutation = { mutationId, baseUpdatedAt };
    const title = text(sanitized.title, 120);
    const creativeConversationId = text(sanitized.creativeConversationId, 160);
    if (title) mutation.title = title;
    if (creativeConversationId) mutation.creativeConversationId = creativeConversationId;
    if (typeof sanitized.activeChatId === "string" || sanitized.activeChatId === null) mutation.activeChatId = sanitized.activeChatId === null ? null : text(sanitized.activeChatId, 160);
    if (sanitized.backgroundMode === "dots" || sanitized.backgroundMode === "lines" || sanitized.backgroundMode === "blank") mutation.backgroundMode = sanitized.backgroundMode;
    if (typeof sanitized.showImageInfo === "boolean") mutation.showImageInfo = sanitized.showImageInfo;
    const viewport = normalizeMutationViewport(sanitized.viewport);
    if (viewport) mutation.viewport = viewport;
    if (sanitized.ipReferences !== undefined) mutation.ipReferences = normalizeIpReferences(sanitized.ipReferences);
    if (Array.isArray(sanitized.nodeUpserts)) mutation.nodeUpserts = normalizeEntityUpserts<CanvasProject["nodes"][number]>(sanitized.nodeUpserts);
    if (Array.isArray(sanitized.nodeDeletes)) mutation.nodeDeletes = normalizeEntityDeletes(sanitized.nodeDeletes);
    if (Array.isArray(sanitized.connectionUpserts)) mutation.connectionUpserts = normalizeEntityUpserts<CanvasProject["connections"][number]>(sanitized.connectionUpserts);
    if (Array.isArray(sanitized.connectionDeletes)) mutation.connectionDeletes = normalizeEntityDeletes(sanitized.connectionDeletes);
    if (Array.isArray(sanitized.chatSessionUpserts)) mutation.chatSessionUpserts = normalizeEntityUpserts<CanvasProject["chatSessions"][number]>(sanitized.chatSessionUpserts);
    if (Array.isArray(sanitized.chatSessionDeletes)) mutation.chatSessionDeletes = normalizeEntityDeletes(sanitized.chatSessionDeletes);
    return mutation;
}

function sanitizeProjectPayload(value: Record<string, unknown>) {
    const sanitized = JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "string" && (item.startsWith("data:") || item.startsWith("blob:")) ? "" : item))) as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(sanitized)) > MAX_PROJECT_BYTES) throw new CanvasProjectServiceError("画布项目数据过大", 413);
    return sanitized;
}

function normalizeViewport(value: unknown, fallback: CanvasProject["viewport"]) {
    const input = object(value);
    const x = Number(input.x);
    const y = Number(input.y);
    const k = Number(input.k);
    return { x: Number.isFinite(x) ? x : fallback.x, y: Number.isFinite(y) ? y : fallback.y, k: Number.isFinite(k) ? Math.max(0.05, Math.min(8, k)) : fallback.k };
}

function normalizeMutationViewport(value: unknown) {
    const input = object(value);
    const x = Number(input.x);
    const y = Number(input.y);
    const k = Number(input.k);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(k) ? { x, y, k: Math.max(0.05, Math.min(8, k)) } : null;
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function addedIpReferences(previous: IpReference[] | undefined, next: IpReference[]) {
    const existing = new Set((previous || []).map(referenceKey));
    return next.filter((reference) => !existing.has(referenceKey(reference)));
}

function referenceKey(reference: IpReference) {
    return `${reference.id}:${reference.subIpId}:${reference.itemIds.join(",")}`;
}

function canvasHandoffProjectId(userId: string, sourceHandoffId: string) {
    return `canvas-handoff-${createHash("sha256").update(`${userId}\0${sourceHandoffId}`).digest("hex").slice(0, 32)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeEntityUpserts<T extends { id: string }>(value: unknown[]): T[] {
    const byId = new Map<string, T>();
    value.forEach((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) return;
        const id = text(item.id, 160);
        if (id) byId.set(id, { ...item, id } as T);
    });
    return Array.from(byId.values());
}

function normalizeEntityDeletes(value: unknown[]) {
    return Array.from(new Set(value.map((item) => text(item, 160)).filter(Boolean)));
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInteger(value: unknown, fallback: number, max: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function isoTimestamp(value: unknown) {
    if (typeof value !== "string") return "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function nextProjectVersion(current: string) {
    const previous = Date.parse(current);
    return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
}

export function canvasProjectError(error: unknown) {
    if (error instanceof CanvasProjectServiceError) return error;
    if (error instanceof CanvasProjectStoreError) return new CanvasProjectServiceError(error.message, error.status);
    return null;
}
