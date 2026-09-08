import { fileTypeFromBuffer } from "file-type";

import { creativeUploadLimitMessage, creativeUploadMaxBytes } from "@/lib/creative-upload";

import { deleteUserLocalMediaAssets } from "@/lib/server/local-media-storage";
import { getLocalMediaRegistrations, listLocalMediaRegistrationPage } from "@/lib/server/local-media-registry";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";

const MEDIA_LIMITS = { image: creativeUploadMaxBytes("image"), video: creativeUploadMaxBytes("video"), audio: creativeUploadMaxBytes("audio") } as const;
type OfficialMediaType = keyof typeof MEDIA_LIMITS;

export class OfficialWorkMediaServiceError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}

export async function uploadOfficialWorkMedia(adminUserIdValue: unknown, file: File) {
    const adminUserId = requiredText(adminUserIdValue, "管理员");
    if (!(file instanceof File) || !file.size) throw new OfficialWorkMediaServiceError("请选择媒体文件");
    const declaredType = mediaType(file.type);
    if (!declaredType) throw new OfficialWorkMediaServiceError("仅支持图片、视频或音频", 415);
    if (file.size > MEDIA_LIMITS[declaredType]) throw new OfficialWorkMediaServiceError(creativeUploadLimitMessage(declaredType), 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedMime = (await fileTypeFromBuffer(bytes))?.mime?.toLowerCase() || "";
    const detectedType = mediaType(detectedMime);
    if (!detectedType || detectedType !== declaredType) throw new OfficialWorkMediaServiceError("媒体真实格式与声明格式不一致", 415);
    const stored = await writePersistentMediaDataUrl(`data:${detectedMime};base64,${bytes.toString("base64")}`, detectedType, {
        ownerUserId: adminUserId,
        source: "admin-official-work-upload",
        originalName: file.name,
        maxBytes: MEDIA_LIMITS[detectedType],
    });
    return {
        storageKey: stored.token,
        mediaType: detectedType,
        mimeType: stored.mimeType,
        originalName: file.name,
        bytes: stored.bytes,
        previewUrl: referenceUrl(stored.token),
    };
}

export async function listOfficialWorkMedia(adminUserIdValue: unknown, input: { page?: unknown; pageSize?: unknown; type?: unknown; keyword?: unknown } = {}) {
    const adminUserId = requiredText(adminUserIdValue, "管理员");
    const type = input.type === "image" || input.type === "video" || input.type === "audio" ? input.type : undefined;
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
    const result = await listLocalMediaRegistrationPage({
        ownerUserIds: [adminUserId],
        storageClass: "permanent",
        ...(type ? { type } : {}),
        search: typeof input.keyword === "string" ? input.keyword.trim().slice(0, 160) : "",
        page,
        pageSize,
    });
    return {
        ...result,
        items: result.items
            .filter((item) => item.ownerUserId === adminUserId && item.storageClass === "permanent" && (item.type === "image" || item.type === "video" || item.type === "audio"))
            .map((item) => ({ ...item, mediaType: item.type, previewUrl: item.scope === "reference" ? referenceUrl(item.storageKey) : generationUrl(item.storageKey) })),
    };
}

export async function deleteOfficialWorkMedia(adminUserIdValue: unknown, storageKeyValues: unknown) {
    const adminUserId = requiredText(adminUserIdValue, "管理员");
    const storageKeys = Array.isArray(storageKeyValues) ? Array.from(new Set(storageKeyValues.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))) : [];
    if (!storageKeys.length) throw new OfficialWorkMediaServiceError("请选择需要清理的媒体");
    const registrations = await getLocalMediaRegistrations(storageKeys);
    const ownedKeys = registrations.filter((item) => item.ownerUserId === adminUserId && item.storageClass === "permanent" && item.source === "admin-official-work-upload").map((item) => item.storageKey);
    return deleteUserLocalMediaAssets(adminUserId, ownedKeys);
}

function mediaType(mimeType: string): OfficialMediaType | undefined {
    const value = mimeType.toLowerCase();
    if (value.startsWith("image/") && value !== "image/svg+xml") return "image";
    if (value.startsWith("video/")) return "video";
    if (value.startsWith("audio/") || value === "application/ogg") return "audio";
}

function requiredText(value: unknown, label: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new OfficialWorkMediaServiceError(`${label}无效`);
    return text;
}

function positiveInteger(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function mediaLabel(type: OfficialMediaType) {
    return type === "image" ? "图片" : type === "video" ? "视频" : "音频";
}

function referenceUrl(storageKey: string) {
    return `/api/reference-assets/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}

function generationUrl(storageKey: string) {
    return `/api/generation-log-assets/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}
