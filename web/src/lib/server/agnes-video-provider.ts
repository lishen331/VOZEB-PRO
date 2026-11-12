import { isAgnesApiBaseUrl } from "@/lib/agnes-model-catalog";
import type { VideoGenerationReference } from "@/lib/video-reference-contract";

export const AGNES_VIDEO_QUERY_PATH = "/agnesapi?video_id=:task_id";

/** 官方所有模式统一使用 video_id + model_name 查询，不能使用创建队列的 task_id。 */
export function agnesVideoQueryPath(model: string) {
    return `${AGNES_VIDEO_QUERY_PATH}&model_name=${encodeURIComponent(model.trim())}`;
}

export type AgnesVideoRequest = {
    model: string;
    prompt: string;
    mode: "text" | "keyframe" | "reference";
    seconds: string;
    size: string;
    aspect_ratio?: string;
    first_frame?: string;
    last_frame?: string;
    images?: string[];
    audios?: string[];
    videos?: Array<{ url: string }>;
};

const RATIOS = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"]);

/** 显式参数不截断、不丢参考素材；所有限制来自官方 Agnes Video 2.5 / Flash 文档。 */
export function buildAgnesVideoRequest(input: { model: string; prompt: string; seconds?: unknown; aspectRatio?: unknown; resolution?: unknown; references?: VideoGenerationReference[] }): AgnesVideoRequest {
    const references = input.references || [];
    const flash = /flash$/i.test(input.model.trim());
    const first = references.filter((reference) => reference.type === "image" && reference.role === "first_frame");
    const last = references.filter((reference) => reference.type === "image" && reference.role === "last_frame");
    const images = references.filter((reference) => reference.type === "image" && reference.role !== "first_frame" && reference.role !== "last_frame").map((reference) => reference.url);
    const audios = references.filter((reference) => reference.type === "audio").map((reference) => reference.url);
    const videos = references.filter((reference) => reference.type === "video").map((reference) => ({ url: reference.url }));
    if (first.length > 1 || last.length > 1) throw new Error("Agnes 每次最多指定一张首帧和一张尾帧");
    if ((first.length || last.length) && (images.length || audios.length || videos.length)) throw new Error("Agnes 首尾帧模式不能混入普通图片、视频或音频参考");
    if (flash && videos.length) throw new Error("Agnes Video Flash 不支持参考视频");
    if (images.length > (flash ? 5 : 8) || audios.length > 3 || videos.length > 1 || references.length > 12) throw new Error(`Agnes 参考素材超出限制：最多 ${flash ? 5 : 8} 张图片、3 段音频、${flash ? 0 : 1} 个视频`);

    const seconds = input.seconds === undefined || input.seconds === "" || input.seconds === "auto" ? 5 : Number(input.seconds);
    if (!Number.isInteger(seconds) || seconds < 4 || seconds > 12) throw new Error("Agnes 视频时长必须是 4–12 秒整数");
    const rawSize = String(input.resolution ?? "")
        .trim()
        .toUpperCase();
    const size = !rawSize || rawSize === "AUTO" ? "720P" : /^\d{3,4}$/.test(rawSize) ? `${rawSize}P` : rawSize;
    if (flash ? size !== "720P" : !["720P", "1080P", "1K", "2K"].includes(size)) throw new Error(flash ? "Agnes Video Flash 仅支持 720P" : "Agnes 视频分辨率仅支持 720P、1080P、1K、2K");
    const ratio = String(input.aspectRatio ?? "").trim();
    if (ratio && ratio !== "auto" && !RATIOS.has(ratio)) throw new Error("Agnes 视频不支持所选画幅比例");
    return {
        model: input.model,
        prompt: input.prompt,
        mode: first.length || last.length ? "keyframe" : images.length || audios.length || videos.length ? "reference" : "text",
        seconds: String(seconds),
        size,
        ...(ratio && ratio !== "auto" ? { aspect_ratio: ratio } : {}),
        ...(first.length ? { first_frame: first[0].url } : {}),
        ...(last.length ? { last_frame: last[0].url } : {}),
        ...(images.length ? { images } : {}),
        ...(audios.length ? { audios } : {}),
        ...(videos.length ? { videos } : {}),
    };
}

export function isAgnesVideoChannel(baseUrl: string, model: string, protocol?: string) {
    return protocol === "agnes" || (isAgnesApiBaseUrl(baseUrl) && /^agnes-video-/i.test(model.trim()));
}

export function readAgnesVideoId(value: unknown) {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    return typeof record.video_id === "string" ? record.video_id.trim() : "";
}
