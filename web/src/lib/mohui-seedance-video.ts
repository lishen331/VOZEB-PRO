import type { VideoGenerationReference } from "@/lib/video-reference-contract";

const MOHUI_RATIOS = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]);

export function mohuiSeedanceResolutions(model: string) {
    if (/seedance[-_.]?2[-_.]5/i.test(model)) return new Set(["720p", "1080p"]);
    if (/seedance[-_.]?2[-_.]0[-_.](?:fast|mini)/i.test(model)) return new Set(["480p", "720p"]);
    return new Set(["480p", "720p", "1080p"]);
}

export function buildMohuiSeedanceVideoRequest(input: { model: string; prompt: string; duration?: number; ratio?: string; resolution?: string; generateAudio: boolean; references: readonly VideoGenerationReference[] }) {
    const images = input.references.filter((reference) => reference.type === "image");
    const media = input.references.filter((reference) => reference.type !== "image");
    const firstFrames = images.filter((reference) => reference.role === "first_frame");
    const lastFrames = images.filter((reference) => reference.role === "last_frame");
    const frameMode = !media.length && firstFrames.length === 1 && (images.length === 1 || (images.length === 2 && lastFrames.length === 1));
    const orderedImages = frameMode ? [...firstFrames, ...lastFrames] : images;
    const content = [
        { type: "text", text: input.prompt },
        ...orderedImages.map((reference) => ({ type: "image_url", image_url: { url: reference.url }, role: frameMode ? reference.role : "reference_image" })),
        ...media.map((reference) => (reference.type === "video" ? { type: "video_url", video_url: { url: reference.url }, role: "reference_video" } : { type: "audio_url", audio_url: { url: reference.url }, role: "reference_audio" })),
    ];
    const requestedRatio = input.ratio?.trim().toLowerCase();
    const ratio = requestedRatio && MOHUI_RATIOS.has(requestedRatio) ? requestedRatio : frameMode ? "adaptive" : undefined;
    const resolution = input.resolution?.trim().toLowerCase();
    const duration = input.duration && Number.isFinite(input.duration) && input.duration > 0 ? Math.max(4, Math.min(15, Math.round(input.duration))) : undefined;
    return {
        model: input.model,
        content,
        ...(ratio ? { ratio } : {}),
        ...(resolution && mohuiSeedanceResolutions(input.model).has(resolution) ? { resolution } : {}),
        ...(duration ? { duration } : {}),
        generate_audio: input.generateAudio,
        watermark: false,
    };
}
