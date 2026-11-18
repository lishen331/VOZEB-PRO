import type { SystemGenerationChannelConfig } from "@/lib/server/generation-channel";
import { applyExclusiveVideoReferenceMode, buildVideoProviderRequest } from "@/lib/server/provider-task-config";
import { normalizeVideoAspectRatio } from "@/lib/server/video-task-config";
import type { VideoGenerationReference } from "@/lib/video-reference-contract";
import { parseImageDimensions } from "@/lib/image-size";
import { resolveChannelModelConfig } from "@/lib/channel-protocol-registry";

type GenerationChannel = NonNullable<SystemGenerationChannelConfig>;

/**
 * Builds the JSON body for a plain `custom` video channel.
 *
 * Both submission paths must agree: the synchronous route (`createUpstream`) and the queued
 * practice worker (`submitQueuedPracticeVideo`). The queued path used to send
 * `{model, prompt, ...workflowInput}`, which silently dropped the channel's
 * `requestTemplate` — MiniMax H3 then rejected the request with
 * "binding: expr_path=content, cause=missing required parameter".
 */
export function buildCustomVideoRequestPayload(input: { channel: GenerationChannel; prompt: string; raw: Record<string, unknown>; references: readonly VideoGenerationReference[] }) {
    const { channel, prompt, raw, references } = input;
    const regularReferences = references.filter((reference) => reference.role !== "first_frame" && reference.role !== "last_frame");
    const firstFrame = references.find((reference) => reference.role === "first_frame");
    const lastFrame = references.find((reference) => reference.role === "last_frame");
    const images = urls(regularReferences, "image");
    const videos = urls(regularReferences, "video");
    const audios = urls(regularReferences, "audio");
    const requestImage = images[0] || "";
    const firstFrameUrl = firstFrame?.url || "";
    const lastFrameUrl = lastFrame?.url || "";
    const dimensions = videoDimensions(raw.size, raw.vquality);
    const generateAudio = raw.videoGenerateAudio !== false && raw.videoGenerateAudio !== "false";
    const adaptiveRatio = channel.capabilityProfile?.videoRatioMode === "adaptive_in_keyframe" && Boolean(firstFrameUrl);
    const requestedRatio = adaptiveRatio ? "adaptive" : aspectRatio(raw.size);
    const promptExpansion = promptExpansionMode(raw.videoPromptExpansion, channel.capabilityProfile?.promptExpansionModes);
    const content = referenceContent(prompt, references);

    const values: Record<string, unknown> = {
        model: channel.model,
        prompt,
        duration: imageDuration(raw.videoSeconds),
        seconds: imageDuration(raw.videoSeconds),
        ratio: requestedRatio,
        aspect_ratio: requestedRatio,
        size: adaptiveRatio ? "adaptive" : sizeValue(raw.size),
        resolution: imageResolution(raw.vquality),
        quality: imageResolution(raw.vquality),
        width: dimensions.width,
        height: dimensions.height,
        generate_audio: generateAudio,
        watermark: booleanValue(raw.videoWatermark),
        prompt_expansion_mode: promptExpansion,
        images,
        videos,
        audios,
        image: requestImage,
        video: videos[0] || "",
        audio: audios[0] || "",
        references: [...references],
        content,
        first_frame: firstFrameUrl,
        first_frame_url: firstFrameUrl,
        last_frame: lastFrameUrl,
        last_frame_url: lastFrameUrl,
    };
    const referenceMode = resolveReferenceModeExclusive(channel) ? { exclusive: true, hasFirstFrame: Boolean(firstFrameUrl), hasLastFrame: Boolean(lastFrameUrl) } : { exclusive: false, hasFirstFrame: false };
    const filteredValues = applyExclusiveVideoReferenceMode(values, referenceMode);
    const defaults: Record<string, unknown> = {
        model: channel.model,
        prompt,
        duration: values.duration,
        seconds: values.seconds,
        ratio: values.ratio,
        aspect_ratio: values.aspect_ratio,
        size: values.size,
        width: values.width,
        height: values.height,
        resolution: values.resolution,
        quality: values.quality,
        generate_audio: generateAudio,
        watermark: booleanValue(raw.videoWatermark),
        ...(promptExpansion ? { prompt_expansion_mode: promptExpansion } : {}),
        // MiniMax H3 style upstreams require `content`; without it a template-less channel
        // (or a template missing the placeholder) fails with "missing required parameter".
        content,
        ...(requestImage ? { image: requestImage } : {}),
        ...(images.length ? { images, image_urls: images, reference_images: images } : {}),
        ...(videos.length ? { video: videos[0], videos, reference_videos: videos } : {}),
        ...(audios.length ? { audio: audios[0], audios, reference_audios: audios } : {}),
        ...(references.length ? { ref_assets: references.map((item) => ({ type: item.type, url: item.url, role: item.role || "reference" })) } : {}),
        ...(firstFrameUrl ? { first_frame: firstFrameUrl, first_frame_url: firstFrameUrl } : {}),
        ...(lastFrameUrl ? { last_frame: lastFrameUrl, last_frame_url: lastFrameUrl } : {}),
    };
    const filteredDefaults = applyExclusiveVideoReferenceMode(defaults, referenceMode);
    return buildVideoProviderRequest(channel.advancedConfig?.requestTemplate, filteredDefaults, filteredValues);
}

function resolveReferenceModeExclusive(channel: GenerationChannel) {
    if (channel.capabilityProfile?.keyframeReferenceExclusive === true) return true;
    return resolveChannelModelConfig(channel.advancedConfig, channel.model)?.referenceModeExclusive === true;
}

function promptExpansionMode(value: unknown, modes: readonly string[] | undefined) {
    if (!modes?.length) return undefined;
    const selected = clean(value);
    return selected && modes.includes(selected) ? selected : modes.includes("balanced") ? "balanced" : modes[0];
}

function referenceContent(prompt: string, references: readonly VideoGenerationReference[]) {
    return [
        { type: "text", text: prompt },
        ...references.map((reference) =>
            reference.type === "image"
                ? { type: "image_url", role: reference.role === "first_frame" || reference.role === "last_frame" ? reference.role : "reference_image", image_url: { url: reference.url } }
                : reference.type === "video"
                  ? { type: "video_url", role: "reference_video", video_url: { url: reference.url } }
                  : { type: "audio_url", role: "reference_audio", audio_url: { url: reference.url } },
        ),
    ];
}

function urls(items: readonly VideoGenerationReference[], type: VideoGenerationReference["type"]) {
    return Array.from(new Set(items.filter((item) => item.type === type).map((item) => clean(item.url))));
}

function imageDuration(value: unknown) {
    const number = Number(value);
    if (number === -1) return -1;
    const seconds = Number.isFinite(number) && number > 0 ? number : 5;
    return Math.max(1, Math.floor(seconds));
}

function aspectRatio(value: unknown) {
    const text = clean(value);
    return text.toLowerCase() === "auto" ? undefined : normalizeVideoAspectRatio(text);
}

function imageResolution(value: unknown) {
    const text = clean(value).replace(/p$/i, "");
    if (text.toLowerCase() === "auto") return undefined;
    if (/^\d+$/.test(text)) return `${text}p`;
    return text || undefined;
}

function sizeValue(value: unknown) {
    const text = clean(value);
    return parseImageDimensions(text) ? text.replace(/\s+/g, "") : aspectRatio(value);
}

function videoDimensions(size: unknown, quality: unknown): { width?: number; height?: number } {
    const exact = parseImageDimensions(String(size || ""));
    if (exact) return exact;
    const fixedRatio = aspectRatio(size);
    const fixedResolution = imageResolution(quality);
    if (!fixedRatio || !fixedResolution) return {};
    const [x, y] = fixedRatio.split(":").map(Number);
    const edge = Number(fixedResolution.replace("p", ""));
    if (!x || !y || !edge) return {};
    if (edge <= Math.max(x, y)) return { width: x, height: y };
    return x >= y ? { width: edge, height: Math.round((edge * y) / x) } : { width: Math.round((edge * x) / y), height: edge };
}

function clean(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown) {
    return value === true || value === "true" || value === 1 || value === "1";
}
