import { normalizeImagePreviewWidth } from "@/lib/media-image-variant";

export const CANVAS_MAX_ZOOM = 5;

/**
 * Quantise a continuous viewport scale into a power-of-two tier.
 *
 * The preview URL carries a `width` query parameter that is bucketed by
 * `normalizeImagePreviewWidth`. Feeding the raw scale into that bucket means a
 * single wheel notch (1.1x) can cross a bucket boundary, which swaps `src` on
 * every visible image node at once — a burst of refetches plus a server-side
 * WebP transcode per node. Quantising to powers of two makes a swap need eight
 * consecutive notches instead of one.
 */
export function canvasImageZoomTier(scale: number) {
    if (!Number.isFinite(scale) || scale <= 1) return 1;
    const capped = Math.min(scale, CANVAS_MAX_ZOOM);
    return Math.pow(2, Math.floor(Math.log2(capped)));
}

/**
 * Preview width for an image node, in device pixels, clamped to the source
 * image so bucket rounding can never ask for more pixels than the source has.
 */
export function canvasImagePreviewWidthForTier(nodeWidth: number, tier: number, naturalWidth?: number) {
    const safeTier = Number.isFinite(tier) && tier > 0 ? tier : 1;
    const target = Math.max(1, Math.ceil(nodeWidth * safeTier * (globalThis.devicePixelRatio || 1)));
    const capped = naturalWidth && naturalWidth > 0 ? Math.min(target, naturalWidth) : target;
    const normalized = normalizeImagePreviewWidth(capped);
    return naturalWidth && naturalWidth > 0 ? Math.min(normalized, naturalWidth) : normalized;
}
