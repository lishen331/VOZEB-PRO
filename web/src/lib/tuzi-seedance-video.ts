import type { VideoGenerationReference } from "@/lib/video-reference-contract";

export type TuziReferMode = "textToVideo" | "referToVideo" | "imageToVideo" | "firstAndLastFrame";

const TUZI_25_RATIOS = new Set(["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
const TUZI_20_RATIOS = new Set(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
const TUZI_25_RESOLUTIONS = new Set(["480P", "720P", "1080P"]);
const TUZI_20_RESOLUTIONS = new Set(["480P", "720P", "1080P", "4K"]);

export function isTuziSeedance25Model(model: string) {
    return /seedance[-_.]?2[-_.]5/i.test(model);
}

export function buildTuziSeedanceVideoRequest(input: { model: string; prompt: string; duration?: number; ratio?: string; resolution?: string; generateAudio: boolean; references: readonly VideoGenerationReference[] }) {
    const is25 = isTuziSeedance25Model(input.model);
    const images = input.references.filter((reference) => reference.type === "image");
    const media = input.references.filter((reference) => reference.type !== "image");
    const firstFrames = images.filter((reference) => reference.role === "first_frame");
    const lastFrames = images.filter((reference) => reference.role === "last_frame");
    const mode: TuziReferMode = !input.references.length
        ? "textToVideo"
        : !media.length && images.length === 1 && firstFrames.length === 1
          ? "imageToVideo"
          : !media.length && images.length === 2 && firstFrames.length === 1 && lastFrames.length === 1
            ? "firstAndLastFrame"
            : "referToVideo";
    const orderedImages = mode === "firstAndLastFrame" ? [...firstFrames, ...lastFrames] : images;
    const content = [
        { type: "text", text: input.prompt },
        ...orderedImages.map((reference) => ({ type: "image_url", role: mode === "referToVideo" ? "reference_image" : reference.role, image_url: { url: reference.url } })),
        ...media.map((reference) => (reference.type === "video" ? { type: "video_url", role: "reference_video", video_url: { url: reference.url } } : { type: "audio_url", role: "reference_audio", audio_url: { url: reference.url } })),
    ];
    const ratio = tuziRatio(input.ratio, is25, mode);
    const resolution = input.resolution?.trim().toUpperCase();
    return {
        model: input.model,
        content,
        refer_model: mode,
        ...(tuziDuration(input.duration, is25) ? { duration: tuziDuration(input.duration, is25) } : {}),
        ...(ratio ? { ratio } : {}),
        ...(resolution && (is25 ? TUZI_25_RESOLUTIONS : TUZI_20_RESOLUTIONS).has(resolution) ? { resolution } : {}),
        generate_audio: input.generateAudio,
        count: 1,
    };
}

function tuziDuration(value: number | undefined, is25: boolean) {
    if (!value || !Number.isFinite(value) || value <= 0) return undefined;
    return Math.max(4, Math.min(is25 ? 30 : 15, Math.round(value)));
}

function tuziRatio(value: string | undefined, is25: boolean, mode: TuziReferMode) {
    // Seedance 2.5 rejects fixed ratios for frame-driven modes.
    if (is25 && (mode === "imageToVideo" || mode === "firstAndLastFrame")) return "adaptive";
    const ratio = value?.trim().toLowerCase();
    return ratio && (is25 ? TUZI_25_RATIOS : TUZI_20_RATIOS).has(ratio) ? ratio : undefined;
}
