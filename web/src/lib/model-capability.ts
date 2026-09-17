import type { LogicalModelCapability } from "@/lib/auth/store-types";

export type ModelCatalogSource = "configured" | "provider" | "official";

export type ModelCatalogEntry = {
    id: string;
    capability: LogicalModelCapability;
    source: ModelCatalogSource;
};

const NON_CREATIVE_MODEL_PATTERN =
    /(?:^|[-_.\s/])(?:embed(?:ding|dings)?|rerank(?:er|ing)?|re[-_.\s]?rank(?:er|ing)?|ocr|asr|stt|speech[-_.\s]?to[-_.\s]?text|audio[-_.\s]?(?:transcription|transcriptions|transcribe)|transcription|transcriptions|moderation|safety|guard(?:rail)?|classifier|topic[-_.\s]?control)(?:$|[-_.\s/])|whisper|sensevoice|paraformer|funasr|nemoguard|bge[-_.\s]?(?:m3|embedding|reranker)|(?:^|[-_.\s/])e5[-_.\s]|gte[-_.\s]|jina[-_.\s]?embeddings?/;

export function isCreativeGenerationModel(model: string) {
    return !NON_CREATIVE_MODEL_PATTERN.test(normalizeModelId(model));
}

export function inferModelCapability(model: string): LogicalModelCapability {
    const value = normalizeModelId(model);
    if (isSeedanceVideoModelName(value) || /stable[-_.\s]?video[-_.\s]?diffusion|(?:^|[-_.\s/])(video|videos|svd|i2v|t2v|img2video|text2video|sora|veo|kling|wan|hailuo|runway|luma|vidu)(?:$|[-_.\s/])/.test(value)) return "video";
    if (/(?:^|[-_.\s/])(audio|tts|speech|voice|music|sound)(?:$|[-_.\s/])|whisper|sensevoice/.test(value)) return "audio";
    if (/(?:^|[-_.\s/])(image|images|img|flux|sdxl|midjourney)(?:$|[-_.\s/])|nano[-_.\s]?banana|seedream|gpt[-_.]?image|dall[-_.]?e|imagen|stable[-_.\s]?diffusion/.test(value) || isShortStableDiffusionName(value)) return "image";
    return "text";
}

// Chinese aggregators label the catalog category in their own language, and that
// label is a deliberate capability statement rather than a transport detail.
const CJK_CAPABILITY_HINTS: Array<[RegExp, LogicalModelCapability]> = [
    [/视频|影片/, "video"],
    [/语音|音频|音乐|声音|配音/, "audio"],
    [/生图|图片|图像|绘图/, "image"],
    [/文本|文字|对话|聊天/, "text"],
];

// A bare `video` token states a capability. A vendor compound such as
// `openai-video` only names an endpoint shape the model is reachable through,
// and New API style catalogs list that shape on image models too, so it must
// not outrank an explicit image endpoint declared in the same hint.
const VIDEO_HINT = /(?:^|[-_.\s/])(video|videos|i2v|t2v|image[-_.\s]?to[-_.\s]?video|text[-_.\s]?to[-_.\s]?video)(?:$|[-_.\s/])|\/videos?(?:\/|$)/;
const STANDALONE_VIDEO_HINT = /(?:^|[\s/])(?:video|videos|i2v|t2v)(?:$|[\s/])|\/videos?(?:\/|$)|image[-_.\s]?to[-_.\s]?video|text[-_.\s]?to[-_.\s]?video/;
const AUDIO_HINT = /(?:^|[-_.\s/])(audio|tts|speech|voice|music|sound)(?:$|[-_.\s/])|\/audio(?:\/|$)/;
const IMAGE_HINT = /(?:^|[-_.\s/])(image|images|img|text[-_.\s]?to[-_.\s]?image)(?:$|[-_.\s/])|\/images?(?:\/|$)/;
const TEXT_HINT = /(?:^|[-_.\s/])(text|chat|language|llm|completion|generatecontent)(?:$|[-_.\s/])|\/chat(?:\/|$)|\/responses(?:\/|$)/;

export function capabilityFromHint(value: unknown): LogicalModelCapability | undefined {
    const hint = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(" ") : typeof value === "string" ? value : "";
    const normalized = hint.trim().toLowerCase();
    if (!normalized || normalized === "model") return undefined;
    for (const [pattern, capability] of CJK_CAPABILITY_HINTS) if (pattern.test(normalized)) return capability;
    const image = IMAGE_HINT.test(normalized);
    if (VIDEO_HINT.test(normalized) && (!image || STANDALONE_VIDEO_HINT.test(normalized))) return "video";
    if (AUDIO_HINT.test(normalized)) return "audio";
    if (image) return "image";
    if (TEXT_HINT.test(normalized)) return "text";
    return undefined;
}

export function normalizeModelId(value: string) {
    return String(value || "")
        .trim()
        .replace(/^models\//i, "")
        .toLowerCase();
}

export function isSeedanceVideoModelName(model: string) {
    const value = normalizeModelId(model);
    return value.includes("seedance") || /^(?:sd[-_.\s]?2(?:$|[-_\s])|sd[-_.\s]?2[._-]?0(?:$|[-_.\s]))/.test(value);
}

function isShortStableDiffusionName(value: string) {
    return value === "sd" || /^sd(?:xl|[-_.\s]?\d)/.test(value);
}
