import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { buildPublicWorkProcessSnapshot, parsePublicWorkProcessSnapshot, PublicProcessSnapshotError } from "@/lib/public-work-process-snapshot";
import type { PublicProcessSnapshot } from "@/lib/practice-domain";
import { createPostgresRepositories, ensurePostgresSchema, getDatabaseProvider, withPostgresTransaction, type PublishedWorkRecord, type PublishedWorkVersionRecord } from "@/lib/server/database";
import type { PracticeActor } from "@/lib/server/practice-access-service";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { WorkPublicationServiceError } from "@/lib/server/work-publication-service";

export class PublicWorkProcessServiceError extends WorkPublicationServiceError {
    constructor(message: string, status = 400) {
        super(message, status);
        this.name = "PublicWorkProcessServiceError";
    }
}

export async function setPublishedWorkPullFilm(actorIdValue: unknown, workIdValue: unknown, enabled: boolean) {
    await assertReady();
    const actorId = requiredId(actorIdValue, "管理员");
    const workId = requiredId(workIdValue, "作品");
    const actor = await createPostgresRepositories().users.getById(actorId);
    if (!hasAdminPermission(actor, "content.manage")) throw new PublicWorkProcessServiceError("需要内容运营权限", 403);

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, undefined, true);
        if (!work) throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);
        if (work.sourceType === "media") throw new PublicWorkProcessServiceError("素材作品不支持制作流程", 409);
        const version = await publicVersion(repos, work);
        if (version.workId !== work!.id || version.id !== work!.publishedVersionId) throw new PublicWorkProcessServiceError("作品公开版本已变化，请刷新后重试", 409);

        let snapshot: PublicProcessSnapshot | undefined;
        if (enabled) {
            const source = await repos.workPublications.getSourceJson(work!.ownerUserId, work!.sourceType, work!.sourceId);
            if (!source) throw new PublicWorkProcessServiceError("作品来源不存在", 404);
            const assets = await repos.workPublications.listVersionAssets(version.id);
            try {
                snapshot = buildPublicWorkProcessSnapshot({ sourceType: work!.sourceType, versionId: version.id, source: source.value, assets });
            } catch (error) {
                if (error instanceof PublicProcessSnapshotError) throw new PublicWorkProcessServiceError(error.message, 409);
                throw error;
            }
        }
        const saved = await repos.practice.setPullFilmVersion({ workId: work!.id, versionId: version.id, enabled, snapshot, enabledByUserId: actorId, enabledAt: new Date().toISOString() });
        if (!saved) throw new PublicWorkProcessServiceError("拉片状态保存失败，请刷新后重试", 409);
        return { hasProcess: enabled, processVersionId: enabled ? version.id : undefined, updatedAt: saved.enabledAt || new Date().toISOString(), snapshot: enabled ? snapshot : undefined };
    });
}

export async function getPublicWorkProcess(slugValue: unknown) {
    await assertReady();
    const slug = requiredSlug(slugValue);
    const repos = createPostgresRepositories();
    const work = await repos.workPublications.getPublicWork(slug);
    const version = work?.publishedVersion;
    if (!work || !version || work.sourceType === "media" || work.publishedVersionId !== version.id || version.moderationStatus !== "approved" || version.visibility !== "public" || version.pullFilmEnabled !== true)
        throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);
    const snapshot = parsePublicWorkProcessSnapshot(version.pullFilmSnapshot);
    if (!snapshot || snapshot.versionId !== version.id || snapshot.sourceType !== work.sourceType) throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);
    return withPublicAssetUrls(snapshot, slug);
}

export async function copyPublicWorkToPractice(actor: PracticeActor, slugValue: unknown, clientRequestIdValue: unknown, requestedKind?: unknown) {
    await assertReady();
    await requirePracticeAccess(actor);
    const slug = requiredSlug(slugValue);
    const clientRequestId = clean(clientRequestIdValue, 160);
    if (!clientRequestId) throw new PublicWorkProcessServiceError("缺少练习请求标识", 400);

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkBySlug(slug, true);
        const version = await publicVersion(repos, work);
        if (!work || work.sourceType === "media" || (requestedKind !== undefined && requestedKind !== work.sourceType)) throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);
        const snapshot = parsePublicWorkProcessSnapshot(version.pullFilmSnapshot);
        if (!snapshot || snapshot.versionId !== version.id || snapshot.sourceType !== work.sourceType || version.pullFilmEnabled !== true) throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);

        const projectId = `${work.sourceType}-${randomUUID()}`;
        const claimed = await repos.practice.claimCopyRequest({ userId: actor.id, clientRequestId, sourceWorkId: work.id, sourceVersionId: version.id, projectKind: work.sourceType, projectId });
        if (claimed.projectId !== projectId) return { kind: claimed.projectKind, projectId: claimed.projectId, clientRequestId };

        const now = new Date().toISOString();
        const conversationId = `conversation-${randomUUID()}`;
        const projectJson = buildPracticeProject(snapshot, work.sourceType, projectId, conversationId, work.slug, now);
        await repos.practice.createPracticeProjectCopy({
            userId: actor.id,
            kind: work.sourceType,
            projectId,
            conversationId,
            title: projectTitle(snapshot, work.sourceType),
            projectJson,
            createdAt: now,
            updatedAt: now,
            sourceWorkId: work.id,
            sourceVersionId: version.id,
            executionProfile: "open-source-practice",
        });
        return { kind: work.sourceType, projectId, clientRequestId };
    });
}

function withPublicAssetUrls(snapshot: PublicProcessSnapshot, slug: string): PublicProcessSnapshot {
    return { ...snapshot, assets: snapshot.assets.map((asset) => ({ ...asset, previewUrl: `/api/public/works/${encodeURIComponent(slug)}/media/${encodeURIComponent(asset.id)}` })) };
}

function buildPracticeProject(snapshot: PublicProcessSnapshot, kind: "canvas" | "drama", projectId: string, conversationId: string, slug: string, now: string) {
    if (kind === "canvas" && snapshot.sourceType === "canvas") {
        const assetUrls = new Map(snapshot.assets.map((asset) => [asset.id, `/api/public/works/${encodeURIComponent(slug)}/media/${encodeURIComponent(asset.id)}`]));
        return {
            id: projectId,
            creativeConversationId: conversationId,
            title: snapshot.title || "无限练习画布",
            createdAt: now,
            updatedAt: now,
            nodes: snapshot.nodes.map((node, index) => ({
                id: node.id,
                type: node.type,
                title: node.title || "未命名节点",
                position: node.position || { x: index * 280, y: 0 },
                width: 240,
                height: 160,
                metadata: { content: node.summary || "", status: "ready", serverUrl: node.assetIds?.map((id) => assetUrls.get(id)).find(Boolean) },
            })),
            connections: snapshot.connections,
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 0, y: 0, k: 1 },
        };
    }
    if (kind === "drama" && snapshot.sourceType === "drama") {
        const assetUrls = new Map(snapshot.assets.map((asset) => [asset.id, `/api/public/works/${encodeURIComponent(slug)}/media/${encodeURIComponent(asset.id)}`]));
        const url = (ids: readonly string[] | undefined) => ids?.map((id) => assetUrls.get(id)).find(Boolean);
        return {
            id: projectId,
            creativeConversationId: conversationId,
            title: snapshot.title || "无限练习短剧",
            summary: snapshot.summary || "",
            style: snapshot.style || "",
            ratio: snapshot.ratio || "16:9",
            status: "active",
            activeEpisodeId: snapshot.episodes[0]?.id,
            characters: snapshot.characters.map((character) => ({ id: character.id, name: character.name, description: character.summary || "", references: [], referenceImageUrl: url(character.assetIds) })),
            scenes: snapshot.scenes.map((scene) => ({ id: scene.id, name: scene.title || "未命名场景", description: scene.summary || "" })),
            props: [],
            clues: [],
            defaultVideoMode: "storyboard",
            episodes: snapshot.episodes.map((episode) => ({
                id: episode.id,
                title: episode.title,
                script: episode.scriptSummary || "",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: episode.reviewStatus === "approved" ? "approved" : "draft",
                shots: episode.shots.map((shot) => ({
                    id: shot.id,
                    order: shot.order,
                    title: shot.title || "未命名镜头",
                    description: shot.summary || "",
                    sourceText: "",
                    shotBoundary: "",
                    dialogue: "",
                    narration: "",
                    utterances: [],
                    imagePrompt: "",
                    videoPrompt: "",
                    cameraMotion: "",
                    duration: 5,
                    characterIds: [],
                    propIds: [],
                    clueIds: [],
                    storyboardImageUrl: url(shot.storyboardAssetIds),
                    videoUrl: url(shot.videoAssetIds),
                    audioUrl: url(shot.audioAssetIds),
                })),
            })),
            sourceAssets: [],
            createdAt: now,
            updatedAt: now,
        };
    }
    throw new PublicWorkProcessServiceError("制作流程类型与作品来源不匹配", 409);
}

async function publicVersion(repos: ReturnType<typeof createPostgresRepositories>, work: PublishedWorkRecord | null | undefined) {
    if (!work || work.lifecycleStatus !== "active" || !work.publishedVersionId || (work.sourceType !== "canvas" && work.sourceType !== "drama")) throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);
    const version = await repos.workPublications.getVersionById(work.publishedVersionId, true);
    if (!version || version.workId !== work.id || version.moderationStatus !== "approved" || version.visibility !== "public") throw new PublicWorkProcessServiceError("作品制作流程不存在", 404);
    return version;
}

function projectTitle(snapshot: PublicProcessSnapshot, kind: "canvas" | "drama") {
    return (snapshot.title || (kind === "canvas" ? "无限练习画布" : "无限练习短剧")).slice(0, 120);
}

async function assertReady() {
    if (getDatabaseProvider() !== "postgres") throw new PublicWorkProcessServiceError("作品发布需要启用 PostgreSQL 数据库", 409);
    await ensurePostgresSchema();
}

function requiredId(value: unknown, label: string) {
    const result = clean(value, 160);
    if (!result) throw new PublicWorkProcessServiceError(`${label}标识无效`, 400);
    return result;
}

function requiredSlug(value: unknown) {
    const slug = clean(value, 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{5,79}$/.test(slug)) throw new PublicWorkProcessServiceError("作品链接无效", 404);
    return slug;
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
