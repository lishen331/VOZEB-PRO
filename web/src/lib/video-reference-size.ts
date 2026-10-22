// 视频上游（Seedance 系）要求参考图每条边在 300–6000 像素之间；超出时提交前等比缩放到边界内。
export const VIDEO_REFERENCE_MIN_SIDE = 300;
export const VIDEO_REFERENCE_MAX_SIDE = 6000;

export type VideoReferenceSizeIssue = { index: number; width: number; height: number; target: { width: number; height: number } | "impossible" };

/** 列出需要缩放或无法满足的参考图（序号从 1 开始，与提示词里的“图片N”一致）。 */
export function videoReferenceSizeIssues(images: Array<{ width?: number; height?: number }>): VideoReferenceSizeIssue[] {
    return images.flatMap((image, index) => {
        const target = fitVideoReferenceSize(image.width, image.height);
        return target ? [{ index: index + 1, width: image.width as number, height: image.height as number, target }] : [];
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
