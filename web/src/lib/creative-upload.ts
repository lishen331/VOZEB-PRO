export type CreativeUploadType = "text" | "image" | "video" | "audio";

export const CREATIVE_UPLOAD_LIMITS: Record<CreativeUploadType, number> = {
    text: 20 * 1024 * 1024,
    image: 20 * 1024 * 1024,
    audio: 30 * 1024 * 1024,
    video: 800 * 1024 * 1024,
};

/** Backward-compatible image/reference default. */
export const CREATIVE_UPLOAD_MAX_BYTES = CREATIVE_UPLOAD_LIMITS.image;

export const CREATIVE_UPLOAD_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/opus",
    "audio/aac",
    "audio/flac",
] as const;

export const CREATIVE_UPLOAD_ACCEPT = CREATIVE_UPLOAD_MIME_TYPES.join(",");

export function isCreativeUploadMimeType(value: string): value is (typeof CREATIVE_UPLOAD_MIME_TYPES)[number] {
    return CREATIVE_UPLOAD_MIME_TYPES.includes(value.toLowerCase() as (typeof CREATIVE_UPLOAD_MIME_TYPES)[number]);
}

export function creativeUploadTypeFromMime(value: string): CreativeUploadType | undefined {
    const mime = value.split(";", 1)[0]?.trim().toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("text/") || mime === "application/pdf" || mime === "application/rtf") return "text";
    return undefined;
}

export function creativeUploadMaxBytes(type: CreativeUploadType) {
    return CREATIVE_UPLOAD_LIMITS[type];
}

export function creativeUploadLimitLabel(type: CreativeUploadType) {
    return `${Math.floor(CREATIVE_UPLOAD_LIMITS[type] / 1024 / 1024)}MB`;
}

export function creativeUploadLimitMessage(type: CreativeUploadType) {
    return `单个${type === "text" ? "文本" : type === "image" ? "图片" : type === "video" ? "视频" : "音频"}文件不能超过 ${creativeUploadLimitLabel(type)}`;
}
