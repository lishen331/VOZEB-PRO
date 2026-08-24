import { readProviderError, readProviderString } from "@/lib/server/provider-task-config";

export const VIDEO_PROVIDER_ID_KEYS = ["task_id", "taskId", "id", "job_id", "jobId", "request_id", "requestId", "uuid", "task_uuid", "taskUuid", "generation_id", "generationId"];
export const VIDEO_PROVIDER_STATUS_KEYS = ["status", "state", "task_status", "taskStatus"];
export const VIDEO_PROVIDER_MEDIA_KEYS = ["video_url", "videoUrl", "media_url", "mediaUrl", "content_url", "contentUrl", "output_url", "outputUrl", "result_url", "resultUrl", "url", "uri"];
export const VIDEO_PROVIDER_SUCCESS = new Set(["completed", "complete", "succeeded", "success", "done", "finished"]);
export const VIDEO_PROVIDER_FAILED = new Set(["failed", "failure", "error", "cancelled", "canceled", "expired"]);

export function parseVideoProviderJson(value: string) {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        throw new Error("视频接口返回了无效 JSON");
    }
}

export function readVideoProviderHttpError(value: string, status: number) {
    try {
        return readProviderError(JSON.parse(value)) || `视频接口请求失败（${status}）`;
    } catch {
        return value.slice(0, 300) || `视频接口请求失败（${status}）`;
    }
}

export function readVideoProviderId(value: unknown) {
    return readProviderString(value, undefined, VIDEO_PROVIDER_ID_KEYS);
}

export function readVideoProviderStatus(value: unknown, configuredPath?: string) {
    return readProviderString(value, configuredPath, VIDEO_PROVIDER_STATUS_KEYS).toLowerCase();
}

export function readVideoProviderUrl(value: unknown, configuredPath?: string) {
    const configured = readProviderString(value, configuredPath, []);
    // New API wraps the actual signed media URL several levels below `data`,
    // while its compatibility `result_url` points to the unsupported
    // `/v1/videos/:id/content` endpoint. Prefer a nested media field when the
    // configured/fallback value is that stale compatibility URL.
    if (configured && !isLegacyVideoContentUrl(configured)) return configured;
    const nested = readProviderString(
        value,
        undefined,
        VIDEO_PROVIDER_MEDIA_KEYS.filter((key) => !["result_url", "resultUrl", "url", "uri"].includes(key)),
    );
    if (nested && (!configured || isLegacyVideoContentUrl(configured))) return nested;
    return configured || readProviderString(value, undefined, VIDEO_PROVIDER_MEDIA_KEYS);
}

function isLegacyVideoContentUrl(value: string) {
    return /\/(?:v1\/)?videos\/[^/?#]+\/content(?:[?#]|$)/i.test(value.trim());
}

export function videoProviderMediaUrl(baseUrl: string, url: string) {
    const base = baseUrl.replace(/\/+$/, "");
    return /^https?:\/\//i.test(url) ? `${base}/_media?url=${encodeURIComponent(url)}` : `${base}/${url.replace(/^\/+/, "")}`;
}
