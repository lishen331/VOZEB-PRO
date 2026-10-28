import { parseImageDimensions } from "@/lib/image-size";

// 画质（quality）与清晰度（resolution）是两个独立参数：画质是渲染档位，清晰度是像素档位。
// 上游没有的参数不发送；面板上照常可点，只是不会带到上游。
// 依据：OpenAI / 兔子 / 模汇 / 火山 / Google 文档与 staging 实测（2026-10-28）。

export const IMAGE_RESOLUTIONS = ["1k", "2k", "4k"] as const;
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];

// 上游画质原样透传（含 dall-e 风格的 standard/hd），1k/2k/4k 是旧的画质别名。
const QUALITY_KEYS: Record<string, string> = { low: "low", medium: "medium", high: "high", standard: "standard", hd: "hd", "1k": "low", "2k": "medium", "4k": "high" };
// 未显式选择清晰度时由画质推导，与旧 QUALITY_BASE 一致（standard=1024，hd=2048）。
const QUALITY_DERIVED_RESOLUTION: Record<string, ImageResolution> = { low: "1k", medium: "2k", high: "4k", standard: "1k", hd: "2k" };
const RESOLUTION_PIXEL_TIER: Record<ImageResolution, "low" | "medium" | "high"> = { "1k": "low", "2k": "medium", "4k": "high" };

// Seedream / Gemini / Imagen 只有分辨率档位，没有画质参数；模汇 gpt-image-2-all（按次计费版）文档里也没有 quality。
const NO_QUALITY_MODEL = /seedream|gemini|imagen|nano-banana|^gpt-image-2-all$/i;
// gpt-image-1 / 1.5 只有 1024 档的三个固定尺寸；兔子 -1k 型号只接受固定的约 1.5MP 尺寸。
const ONE_K_ONLY_MODEL = /^gpt-image-1(?:\.5)?(?:-vip)?$|-1k$/i;
// 火山 Seedream 4.5 / 5.0 lite 的 WxH 下限是 2560x1440（3,686,400 像素），没有 1K 档。
const SEEDREAM_NO_1K_MODEL = /seedream-4-5|seedream-5-0/i;

const ONE_K_MAX_PIXELS = 1_600_000;
const TWO_K_MAX_PIXELS = 4_500_000;

type ImageParamConfig = { model?: string; quality?: string; resolution?: string };

/**
 * 只认 1k/2k/4k。旧节点 metadata 里的 low/medium/high 是解绑前的默认值，当时从未生效，
 * 这里按"未选择"处理，避免老画布的出图尺寸被悄悄改掉。
 */
export function normalizeImageResolution(value: unknown): ImageResolution | undefined {
    const text = typeof value === "string" ? value.trim().toLowerCase() : "";
    return (IMAGE_RESOLUTIONS as readonly string[]).includes(text) ? (text as ImageResolution) : undefined;
}

/** 未显式选择清晰度时，面板显示/后端使用的由画质推导出的档位。 */
export function imageResolutionFromQuality(quality: string | undefined): ImageResolution {
    return QUALITY_DERIVED_RESOLUTION[QUALITY_KEYS[(quality || "").trim().toLowerCase()] || ""] || "2k";
}

export function imageModelAcceptsQuality(model: string | undefined) {
    return !NO_QUALITY_MODEL.test((model || "").trim());
}

/** 发给上游的画质：模型没有画质参数、或是 auto 时返回 undefined（不发送）。 */
export function upstreamImageQuality(config: ImageParamConfig) {
    if (!imageModelAcceptsQuality(config.model)) return undefined;
    return QUALITY_KEYS[(config.quality || "").trim().toLowerCase()];
}

/**
 * 实际请求的清晰度：显式选择优先；未选择时沿用旧行为由画质推导（Agent、短剧等调用方不传清晰度）。
 * 返回 undefined 表示交给上游默认尺寸。
 */
export function requestedImageResolution(config: ImageParamConfig): ImageResolution | undefined {
    const model = (config.model || "").trim();
    if (ONE_K_ONLY_MODEL.test(model)) return "1k";
    const derived = QUALITY_DERIVED_RESOLUTION[QUALITY_KEYS[(config.quality || "").trim().toLowerCase()] || ""];
    const resolution = normalizeImageResolution(config.resolution) || derived;
    if (resolution === "1k" && SEEDREAM_NO_1K_MODEL.test(model)) return "2k";
    return resolution;
}

/** resolveSize 使用的像素档位键（low/medium/high → 1024² / 2048² / 2880²）。 */
export function imagePixelTier(config: ImageParamConfig) {
    const resolution = requestedImageResolution(config);
    return resolution ? RESOLUTION_PIXEL_TIER[resolution] : undefined;
}

/** 按像素归档，用于计费：≤1.6MP 记 1K，≤4.5MP 记 2K，更大记 4K。 */
export function imageResolutionFromPixels(width: number, height: number): ImageResolution | undefined {
    const pixels = width * height;
    if (!Number.isFinite(pixels) || pixels <= 0) return undefined;
    if (pixels <= ONE_K_MAX_PIXELS) return "1k";
    if (pixels <= TWO_K_MAX_PIXELS) return "2k";
    return "4k";
}

/** 从上游请求字段（"2K"、"4k"、"2048x2048"）解析清晰度档位。 */
export function imageResolutionFromRequestValue(value: unknown): ImageResolution | undefined {
    if (typeof value !== "string") return undefined;
    const tier = normalizeImageResolution(value);
    if (tier) return tier;
    const dimensions = parseImageDimensions(value.trim());
    return dimensions ? imageResolutionFromPixels(dimensions.width, dimensions.height) : undefined;
}

type ImageMultiplierMaps = { imageQuality?: Record<string, number>; imageResolution?: Record<string, number> };

function multiplierOf(values: Record<string, number> | undefined, key: string) {
    const value = values?.[key];
    return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 1;
}

/** 计费用的画质键：hd/standard 归到 high/medium，未知值原样（命中不到倍率即按 1 计）。 */
export function imageQualityBillingKey(value: unknown) {
    const key = String(value || "auto")
        .trim()
        .toLowerCase();
    if (key === "hd" || key === "4k") return "high";
    if (key === "standard" || key === "2k") return "medium";
    if (key === "1k") return "low";
    return key || "auto";
}

/** 计费用的清晰度键：实际请求的像素档位；没有任何分辨率信号时记 auto。 */
export function imageResolutionBillingKey(config: ImageParamConfig & { size?: string }) {
    const dimensions = parseImageDimensions((config.size || "").trim());
    if (dimensions) return imageResolutionFromPixels(dimensions.width, dimensions.height) || "auto";
    return requestedImageResolution(config) || "auto";
}

/** 图片单张的参数倍率 = 画质倍率 × 清晰度倍率（只计实际发给上游的画质）。 */
export function imageTaskPointMultiplier(config: ImageParamConfig & { size?: string }, multipliers: ImageMultiplierMaps) {
    return multiplierOf(multipliers.imageQuality, imageQualityBillingKey(upstreamImageQuality(config))) * multiplierOf(multipliers.imageResolution, imageResolutionBillingKey(config));
}
