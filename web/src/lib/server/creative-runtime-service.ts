import {
    creativeConversationSourceForSurface,
    isCreativeConversationSourceCompatible,
    normalizeCreativeConversationSource,
    normalizeCreativeSurface,
    type CreativeAsset,
    type CreativeAssetType,
    type CreativeConversationStatus,
} from "@/lib/creative-runtime-contract";
import { creativeUploadLimitMessage, creativeUploadMaxBytes, isCreativeUploadMimeType } from "@/lib/creative-upload";
import {
    createCreativeConversation,
    getCreativeAsset,
    getCreativeConversation,
    getCreativeConversationsByIds,
    listCreativeAssets,
    listCreativeConversations,
    listCreativeMessages,
    registerCreativeAssets,
    updateCreativeConversation,
} from "@/lib/server/creative-runtime-store";
import { isReferenceAssetPath, writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";
import { deleteCreativeConversationAggregates } from "@/lib/server/creative-entity-deletion-store";
import { getLocalMediaRegistration, isLocalMediaRegistrationExpired } from "@/lib/server/local-media-registry";
import { localMediaStorageKeyFromValue } from "@/lib/server/local-media-references";
import { readRegisteredMediaBytes } from "@/lib/server/object-storage-service";
import { deleteUserMediaAssetsCascade } from "@/lib/server/user-media-deletion-service";

export class CreativeRuntimeServiceError extends Error {
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
    }
}

export async function createConversationForUser(userId: string, value: unknown) {
    const input = object(value);
    const surface = normalizeCreativeSurface(input.surface);
    const source = input.source === undefined ? (surface ? creativeConversationSourceForSurface(surface) : null) : normalizeCreativeConversationSource(input.source);
    const projectId = optionalText(input.projectId, 160);
    const title = optionalText(input.title, 120);
    if (!surface) throw new CreativeRuntimeServiceError("创作入口不正确", 400);
    if (!source || !isCreativeConversationSourceCompatible(surface, source)) throw new CreativeRuntimeServiceError("创作会话来源不正确", 400);
    if (surface === "chat" && projectId) throw new CreativeRuntimeServiceError("普通对话不接受项目标识", 400);
    if (surface !== "chat" && !projectId) throw new CreativeRuntimeServiceError(surface === "canvas" ? "画布标识不能为空" : "短剧项目标识不能为空", 400);
    return createCreativeConversation(userId, { surface, source, projectId, title });
}

export function listConversationsForUser(userId: string, input: { surface?: string | null; source?: string | null; projectId?: string | null; status?: string | null; limit?: string | null; offset?: string | null }) {
    const surface = input.surface ? normalizeCreativeSurface(input.surface) : undefined;
    const source = input.source ? normalizeCreativeConversationSource(input.source) : undefined;
    if (input.surface && !surface) throw new CreativeRuntimeServiceError("创作入口不正确", 400);
    if (input.source && !source) throw new CreativeRuntimeServiceError("创作会话来源不正确", 400);
    const projectId = optionalText(input.projectId, 160);
    const status = normalizeStatus(input.status);
    return listCreativeConversations(userId, { surface: surface || undefined, source: source || undefined, projectId, status, limit: Number(input.limit), offset: Number(input.offset) });
}

export async function getConversationForUser(userId: string, id: string) {
    const conversation = await getCreativeConversation(id, userId);
    if (!conversation || conversation.userId !== userId) throw new CreativeRuntimeServiceError("创作会话不存在", 404);
    return conversation;
}

export async function updateConversationForUser(userId: string, id: string, value: unknown) {
    await getConversationForUser(userId, id);
    const input = object(value);
    const title = input.title === undefined ? undefined : optionalText(input.title, 120) || "新对话";
    const status = input.status === undefined ? undefined : normalizeStatus(input.status);
    if (input.status !== undefined && !status) throw new CreativeRuntimeServiceError("会话状态不正确", 400);
    return updateCreativeConversation(id, userId, { title, status });
}

export async function deleteConversationsForUser(userId: string, value: unknown) {
    const ids = normalizeIds(value, 100);
    if (!ids.length) return 0;
    const conversations = await getCreativeConversationsByIds(userId, ids);
    if (conversations.length !== ids.length) throw new CreativeRuntimeServiceError("创作会话不存在", 404);
    if (conversations.some((conversation) => conversation.surface !== "chat")) throw new CreativeRuntimeServiceError("项目会话需从对应项目中删除", 409);
    const result = await deleteCreativeConversationAggregates(userId, ids);
    await deleteUserMediaAssetsCascade(userId, result.mediaStorageKeys);
    return result.deletedConversations;
}

export async function listMessagesForUser(userId: string, id: string, afterSequence: number, limit: number, beforeSequence = 0) {
    await getConversationForUser(userId, id);
    return listCreativeMessages(id, afterSequence, limit, beforeSequence);
}

/** Repair historical Worker-origin audio URLs at the authenticated read boundary. */
function publicAudioAsset(asset: CreativeAsset): CreativeAsset {
    if (asset.type !== "audio") return asset;
    const source = asset.serverUrl || asset.remoteUrl;
    if (!source) return asset;
    try {
        const url = new URL(source);
        if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password) return asset;
        const prefix = "/api/reference-assets/";
        if (!url.pathname.startsWith(prefix) || !isReferenceAssetPath(url.pathname.slice(prefix.length))) return asset;
        return { ...asset, serverUrl: url.pathname, remoteUrl: undefined };
    } catch {
        return asset;
    }
}

export async function listAssetsForUser(userId: string, id: string) {
    await getConversationForUser(userId, id);
    return (await listCreativeAssets(id, userId)).map(publicAudioAsset);
}

export async function getAssetForUser(userId: string, id: string) {
    const asset = await getCreativeAsset(id, userId);
    if (!asset || asset.userId !== userId || asset.status === "deleted") throw new CreativeRuntimeServiceError("创作资产不存在", 404);
    return publicAudioAsset(asset);
}

export async function uploadAssetForUser(userId: string, conversationId: string, file: File) {
    const conversation = await getConversationForUser(userId, conversationId);
    if (conversation.status !== "active") throw new CreativeRuntimeServiceError("已归档会话不能上传素材", 409);
    const type = isCreativeUploadMimeType(file.type) ? creativeAssetType(file.type) : null;
    if (!type) throw new CreativeRuntimeServiceError("仅支持图片、视频和音频素材", 400);
    if (!file.size) throw new CreativeRuntimeServiceError("上传文件为空", 400);
    const maxBytes = creativeUploadMaxBytes(type);
    if (file.size > maxBytes) throw new CreativeRuntimeServiceError(creativeUploadLimitMessage(type), 413);
    const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    let stored: Awaited<ReturnType<typeof writePersistentMediaDataUrl>>;
    try {
        stored = await writePersistentMediaDataUrl(dataUrl, type, { ownerUserId: userId, source: "creative-upload", originalName: file.name, conversationId, maxBytes });
    } catch (error) {
        throw new CreativeRuntimeServiceError(error instanceof Error ? error.message : "素材保存失败", 400);
    }
    const url = stored.url || `/api/reference-assets/${stored.token}`;
    const [asset] = await registerCreativeAssets([
        {
            userId,
            conversationId,
            sourceRunId: "upload",
            sourceTaskId: stored.token,
            ordinal: 0,
            type,
            title: optionalText(file.name, 160) || `上传${type === "image" ? "图片" : type === "video" ? "视频" : "音频"}`,
            storageKind: stored.storage === "object" ? "object" : "local",
            storageKey: stored.token,
            remoteUrl: /^https?:\/\//i.test(url) ? url : undefined,
            serverUrl: /^https?:\/\//i.test(url) ? undefined : url,
            mimeType: stored.mimeType,
            bytes: stored.bytes,
            metadata: { source: "upload", originalName: file.name, storageClass: "permanent" },
        },
    ]);
    return asset;
}

export async function referenceAssetForUser(userId: string, conversationId: string, value: unknown) {
    const conversation = await getConversationForUser(userId, conversationId);
    if (conversation.status !== "active") throw new CreativeRuntimeServiceError("已归档会话不能引用素材", 409);
    const input = object(value);
    const sourceUrl = optionalText(input.sourceUrl, 2_000) || "";
    const storageKey = localMediaStorageKeyFromValue(sourceUrl);
    const scope = mediaScopeFromUrl(sourceUrl);
    if (!storageKey || !scope) throw new CreativeRuntimeServiceError("仅支持引用站内生成素材", 400);
    const registration = await getLocalMediaRegistration(storageKey);
    if (!registration || registration.ownerUserId !== userId || registration.scope !== scope || isLocalMediaRegistrationExpired(registration)) throw new CreativeRuntimeServiceError("参考素材不存在", 404);
    const type = creativeAssetType(registration.mimeType);
    if (!type || registration.type !== type) throw new CreativeRuntimeServiceError("该媒体格式暂不支持作为参考素材", 400);
    const maxBytes = creativeUploadMaxBytes(type);
    let bytes: Buffer;
    try {
        bytes = await readRegisteredMediaBytes(registration, creativeUploadMaxBytes(type));
    } catch (error) {
        throw new CreativeRuntimeServiceError(error instanceof Error ? error.message : "读取参考素材失败", 400);
    }
    const title = optionalText(input.title, 160) || `引用${type === "image" ? "图片" : type === "video" ? "视频" : "音频"}`;
    const originalName = `${title}.${extensionFromMimeType(registration.mimeType, type)}`;
    let stored: Awaited<ReturnType<typeof writePersistentMediaDataUrl>>;
    try {
        stored = await writePersistentMediaDataUrl(`data:${registration.mimeType};base64,${bytes.toString("base64")}`, type, {
            ownerUserId: userId,
            source: "creative-reference",
            originalName,
            conversationId,
            maxBytes,
        });
    } catch (error) {
        throw new CreativeRuntimeServiceError(error instanceof Error ? error.message : "参考素材保存失败", 400);
    }
    const url = stored.url || `/api/reference-assets/${stored.token}`;
    const [asset] = await registerCreativeAssets([
        {
            userId,
            conversationId,
            sourceRunId: "reference",
            sourceTaskId: stored.token,
            ordinal: 0,
            type,
            title,
            storageKind: stored.storage === "object" ? "object" : "local",
            storageKey: stored.token,
            remoteUrl: /^https?:\/\//i.test(url) ? url : undefined,
            serverUrl: /^https?:\/\//i.test(url) ? undefined : url,
            mimeType: stored.mimeType,
            bytes: stored.bytes,
            metadata: { source: "reference", sourceUrl, sourceStorageKey: storageKey, originalName, storageClass: "permanent" },
        },
    ]);
    return asset;
}

export async function registerGenerationTaskAssetsForUser(
    userId: string,
    input: {
        conversationId?: string;
        runId?: string;
        surface?: "chat" | "canvas" | "drama";
        projectId?: string;
        taskId: string;
        title: string;
        assets: Array<{ type: "image" | "video" | "audio"; url: string; mimeType?: string; width?: number; height?: number; durationMs?: number; bytes?: number }>;
    },
) {
    if (!input.conversationId || !input.assets.length) return [];
    await getConversationForUser(userId, input.conversationId);
    return registerCreativeAssets(
        input.assets.map((asset, ordinal) => {
            const remoteUrl = /^https?:\/\//i.test(asset.url) ? asset.url : undefined;
            const serverUrl = asset.url.startsWith("/") ? asset.url : undefined;
            return {
                userId,
                conversationId: input.conversationId!,
                sourceRunId: input.runId || `${input.surface || "task"}:${input.projectId || input.conversationId}`,
                sourceTaskId: input.taskId,
                ordinal,
                type: asset.type,
                title: input.title || `生成${asset.type === "image" ? "图片" : asset.type === "video" ? "视频" : "音频"}`,
                storageKind: serverUrl ? ("local" as const) : ("remote" as const),
                remoteUrl,
                serverUrl,
                mimeType: asset.mimeType,
                width: asset.width,
                height: asset.height,
                durationMs: asset.durationMs,
                bytes: asset.bytes,
                metadata: { surface: input.surface, projectId: input.projectId },
            };
        }),
    );
}

function normalizeStatus(value: unknown): CreativeConversationStatus | undefined {
    return value === "active" || value === "archived" ? value : undefined;
}

function creativeAssetType(mimeType: string): Exclude<CreativeAssetType, "text"> | null {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return null;
}

function mediaScopeFromUrl(value: string) {
    try {
        const pathname = new URL(value, "http://vozeb.local").pathname;
        if (pathname.startsWith("/api/generation-log-assets/")) return "generation" as const;
        if (pathname.startsWith("/api/reference-assets/")) return "reference" as const;
    } catch {
        // Invalid URLs are rejected by the caller.
    }
    return null;
}

function extensionFromMimeType(mimeType: string, type: Exclude<CreativeAssetType, "text">) {
    const subtype = mimeType.split("/", 2)[1]?.split(";", 1)[0]?.trim().toLowerCase();
    if (subtype === "jpeg") return "jpg";
    if (subtype === "quicktime") return "mov";
    if (subtype === "mpeg") return type === "audio" ? "mp3" : "mpeg";
    return subtype?.replace(/[^a-z0-9.+-]/g, "") || (type === "image" ? "png" : type === "video" ? "mp4" : "mp3");
}

function object(value: unknown) {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function optionalText(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
}

function normalizeIds(value: unknown, limit: number) {
    return Array.from(new Set((Array.isArray(value) ? value : []).map((item) => optionalText(item, 160)).filter((item): item is string => Boolean(item)))).slice(0, limit);
}
