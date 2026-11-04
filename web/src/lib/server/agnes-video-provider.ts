import { isAgnesApiBaseUrl } from "@/lib/agnes-model-catalog";
import type { VideoGenerationReference } from "@/lib/video-reference-contract";

export const AGNES_VIDEO_QUERY_PATH = "/agnesapi?video_id=:task_id";

/** Flash 的 keyframe / reference 任务查询必须带 model_name，text 模式不带也能查，统一都带上。 */
export function agnesVideoQueryPath(model: string) {
    return /flash/i.test(model) ? `${AGNES_VIDEO_QUERY_PATH}&model_name=${encodeURIComponent(model.trim())}` : AGNES_VIDEO_QUERY_PATH;
}

const AGNES_VIDEO_MIN_SECONDS = 4;
const AGNES_VIDEO_MAX_SECONDS = 12;
const AGNES_VIDEO_DEFAULT_SECONDS = 5;

export type AgnesVideoRequest = {
    model: string;
    prompt: string;
    mode: "text" | "keyframe" | "reference";
    seconds: string;
    size?: string;
    aspect_ratio?: string;
    first_frame?: string;
    last_frame?: string;
    images?: string[];
    audios?: string[];
};

/**
 * Agnes 视频（agnes-video-2.5 / 2.5-flash）不是通用 OpenAI 视频接口：
 * POST /v1/videos 必填 mode，查询走 GET /agnesapi?video_id=。
 * mode 由参考素材推导：首尾帧 → keyframe，参考图/音频 → reference，否则 text。
 */
export function buildAgnesVideoRequest(input: { model: string; prompt: string; seconds?: unknown; aspectRatio?: unknown; resolution?: unknown; references?: VideoGenerationReference[] }): AgnesVideoRequest {
    const references = input.references || [];
    const firstFrame = references.find((reference) => reference.type === "image" && reference.role === "first_frame")?.url || "";
    const lastFrame = references.find((reference) => reference.type === "image" && reference.role === "last_frame")?.url || "";
    const images = references.filter((reference) => reference.type === "image" && reference.role !== "first_frame" && reference.role !== "last_frame").map((reference) => reference.url);
    const audios = references.filter((reference) => reference.type === "audio").map((reference) => reference.url);

    const request: AgnesVideoRequest = {
        model: input.model,
        prompt: input.prompt,
        mode: firstFrame || lastFrame ? "keyframe" : images.length || audios.length ? "reference" : "text",
        seconds: agnesVideoSeconds(input.seconds),
    };
    const aspectRatio = agnesVideoAspectRatio(input.aspectRatio);
    if (aspectRatio) request.aspect_ratio = aspectRatio;
    const size = agnesVideoSize(input.resolution);
    if (size) request.size = size;
    if (request.mode === "keyframe") {
        if (firstFrame) request.first_frame = firstFrame;
        if (lastFrame) request.last_frame = lastFrame;
    }
    if (request.mode === "reference") {
        if (images.length) request.images = images;
        if (audios.length) request.audios = audios;
    }
    return request;
}

export function isAgnesVideoChannel(baseUrl: string, model: string) {
    return isAgnesApiBaseUrl(baseUrl) && /^agnes-video-/i.test(model.trim());
}

/** 创建响应里 video_id 才是查询用的标识，id / task_id 只是异步任务号。 */
export function readAgnesVideoId(value: unknown) {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    for (const key of ["video_id", "videoId"]) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "";
}

function agnesVideoSeconds(value: unknown) {
    const parsed = Math.round(Number(value));
    const seconds = Number.isFinite(parsed) ? Math.min(AGNES_VIDEO_MAX_SECONDS, Math.max(AGNES_VIDEO_MIN_SECONDS, parsed)) : AGNES_VIDEO_DEFAULT_SECONDS;
    return String(seconds);
}

function agnesVideoAspectRatio(value: unknown) {
    const text = typeof value === "string" ? value.trim() : "";
    return /^\d+:\d+$/.test(text) ? text : "";
}

function agnesVideoSize(value: unknown) {
    const text = typeof value === "string" ? value.trim() : "";
    return /^\d{3,4}p$/i.test(text) ? text.toUpperCase() : "";
}
