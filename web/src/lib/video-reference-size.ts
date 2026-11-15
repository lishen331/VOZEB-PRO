// 视频上游（Seedance 系）要求参考图每条边在 300–6000 像素之间；超出时提交前等比缩放到边界内。
export const VIDEO_REFERENCE_MIN_SIDE = 300;
export const VIDEO_REFERENCE_MAX_SIDE = 6000;
export const VIDEO_REFERENCE_MIN_RATIO = 0.4;
export const VIDEO_REFERENCE_MAX_RATIO = 2.5;

export type VideoReferenceSizeIssue = { index: number; width: number; height: number; target: { width: number; height: number } | "impossible"; reason: "size" | "ratio" | "size-and-ratio" };

/** 列出需要缩放或无法满足的参考图（序号从 1 开始，与提示词里的“图片N”一致）。 */
export function videoReferenceSizeIssues(images: Array<{ width?: number; height?: number }>): VideoReferenceSizeIssue[] {
    return images.flatMap((image, index) => {
        const { width, height } = image;
        if (!width || !height) return [];
        const target = fitVideoReferenceForVideo(width, height);
        if (!target) return [];
        const ratioChanged = width / height < VIDEO_REFERENCE_MIN_RATIO || width / height > VIDEO_REFERENCE_MAX_RATIO;
        const sizeChanged = width < VIDEO_REFERENCE_MIN_SIDE || height < VIDEO_REFERENCE_MIN_SIDE || width > VIDEO_REFERENCE_MAX_SIDE || height > VIDEO_REFERENCE_MAX_SIDE;
        return [{ index: index + 1, width, height, target, reason: ratioChanged && sizeChanged ? "size-and-ratio" : ratioChanged ? "ratio" : "size" }];
    });
}

/** 返回等比缩放后的宽高；无需缩放时返回 null。比例超过 20:1 时无法同时满足两边，返回 "impossible"。 */
export function fitVideoReferenceSize(width: number | undefined, height: number | undefined): { width: number; height: number } | null | "impossible" {
    if (!width || !height) return null;
    const short = Math.min(width, height);
    const long = Math.max(width, height);
    if (long / short > VIDEO_REFERENCE_MAX_SIDE / VIDEO_REFERENCE_MIN_SIDE) return "impossible";
    const scale = short < VIDEO_REFERENCE_MIN_SIDE ? VIDEO_REFERENCE_MIN_SIDE / short : long > VIDEO_REFERENCE_MAX_SIDE ? VIDEO_REFERENCE_MAX_SIDE / long : 1;
    if (scale === 1) return null;
    const round = scale > 1 ? Math.ceil : Math.floor;
    return { width: Math.max(1, round(width * scale)), height: Math.max(1, round(height * scale)) };
}

/** For accepted ratios, retain the existing proportional size normalization. For an out-of-range
 * ratio, make a bounded letterbox canvas so the source image is neither stretched nor cropped. */
export function fitVideoReferenceForVideo(width: number | undefined, height: number | undefined): { width: number; height: number } | null {
    if (!width || !height) return null;
    const ratio = width / height;
    if (ratio >= VIDEO_REFERENCE_MIN_RATIO && ratio <= VIDEO_REFERENCE_MAX_RATIO) {
        const fitted = fitVideoReferenceSize(width, height);
        return fitted === "impossible" ? null : fitted;
    }
    if (ratio > VIDEO_REFERENCE_MAX_RATIO) {
        const targetWidth = Math.min(VIDEO_REFERENCE_MAX_SIDE, Math.max(VIDEO_REFERENCE_MIN_SIDE * VIDEO_REFERENCE_MAX_RATIO, width));
        return { width: targetWidth, height: Math.ceil(targetWidth / VIDEO_REFERENCE_MAX_RATIO) };
    }
    const targetHeight = Math.min(VIDEO_REFERENCE_MAX_SIDE, Math.max(VIDEO_REFERENCE_MIN_SIDE / VIDEO_REFERENCE_MIN_RATIO, height));
    return { width: Math.ceil(targetHeight * VIDEO_REFERENCE_MIN_RATIO), height: targetHeight };
}
