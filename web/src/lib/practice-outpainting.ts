export const OUTPAINTING_TITLE = "AI 扩图";
export const OUTPAINTING_HISTORY_LIMIT = 20;
export const OUTPAINTING_RATIOS = ["original", "free", "1:1", "4:3", "3:4", "16:9", "9:16"] as const;
export type OutpaintingRatio = (typeof OUTPAINTING_RATIOS)[number];
export type OutpaintingPadding = Record<"left" | "right" | "top" | "bottom", number>;
export type OutpaintingSelection = { padding: OutpaintingPadding; ratio: OutpaintingRatio; resolution: "1k" | "2k" };
export type OutpaintingSnapshot = { selection: OutpaintingSelection; width: number; height: number };
export type OutpaintingRecord = OutpaintingSnapshot & { id: string; createdAt: number; sourceUrl: string; prompt: string; model?: string; image: { url: string; width: number; height: number; bytes: number; mimeType: string } };
export const emptyOutpaintingPadding = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
const edges = ["left", "right", "top", "bottom"] as const;
const sideName = { left: "左侧", right: "右侧", top: "上方", bottom: "下方" };
const pixel = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export function readOutpaintingSelection(value: unknown): OutpaintingSelection | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { padding, ratio, resolution } = value as Partial<OutpaintingSelection>;
    if (!padding || !edges.every((edge) => pixel(padding[edge])) || !edges.some((edge) => padding[edge] > 0) || !ratio || ratio === "original" || !OUTPAINTING_RATIOS.includes(ratio) || (resolution !== "1k" && resolution !== "2k")) return null;
    return { padding: { left: padding.left, right: padding.right, top: padding.top, bottom: padding.bottom }, ratio, resolution };
}

export function readOutpaintingSnapshot(value: unknown): OutpaintingSnapshot | null {
    if (!value || typeof value !== "object") return null;
    const { width, height, selection } = value as Partial<OutpaintingSnapshot>;
    const validated = readOutpaintingSelection(selection);
    if (!validated || !pixel(width) || !pixel(height) || !outpaintingGeometry(width, height, validated)) return null;
    return { width, height, selection: validated };
}

export function centeredOutpainting(width: number, height: number, ratio: OutpaintingRatio): OutpaintingPadding {
    if (ratio === "original" || ratio === "free") return emptyOutpaintingPadding();
    const [a, b] = ratio.split(":").map(Number);
    const k = Math.max(Math.ceil(width / a), Math.ceil(height / b));
    const dx = a * k - width,
        dy = b * k - height;
    const left = Math.floor(dx / 2),
        top = Math.floor(dy / 2);
    return { left, top, right: dx - left, bottom: dy - top };
}

export function outpaintingGeometry(sourceW: number, sourceH: number, selection: OutpaintingSelection) {
    if (!pixel(sourceW) || !pixel(sourceH) || !sourceW || !sourceH || !readOutpaintingSelection(selection)) return null;
    const p = selection.padding;
    if (selection.ratio !== "free") {
        const expected = centeredOutpainting(sourceW, sourceH, selection.ratio);
        if (edges.some((edge) => expected[edge] !== p[edge])) return null;
    }
    const w = sourceW + p.left + p.right,
        h = sourceH + p.top + p.bottom;
    if (!pixel(w) || !pixel(h)) return null;
    const long = selection.resolution === "2k" ? 2048 : 1024;
    const scale = long / Math.max(w, h);
    const width = Math.round(w * scale),
        height = Math.round(h * scale);
    const left = Math.round(p.left * scale),
        top = Math.round(p.top * scale);
    const right = Math.round((w - p.right) * scale),
        bottom = Math.round((h - p.bottom) * scale);
    if (right <= left || bottom <= top || (p.left && !left) || (p.top && !top) || (p.right && right === width) || (p.bottom && bottom === height)) return null;
    return { width, height, left, top, sourceWidth: right - left, sourceHeight: bottom - top };
}

export function outpaintingLesson(selection: OutpaintingSelection, width: number, height: number) {
    const geometry = outpaintingGeometry(width, height, selection);
    const region = edges
        .filter((edge) => selection.padding[edge])
        .map((edge) => `${sideName[edge]} ${selection.padding[edge]} 像素`)
        .join("、");
    const sections = [
        { title: "扩图目标", text: `扩大原图边界，生成 ${geometry?.width} × ${geometry?.height} 的连续画面。`, tip: "先交代目标画幅，再说明这是延展，不是重绘。" },
        { title: "补全区域", text: `只生成透明蒙版对应的新增区域（按原图尺度：${region}）。`, tip: "说清楚哪一边要补、补多少；不需要扩的方向不要写。" },
        { title: "画面延续", text: "自然延伸邻近背景、地平线和透视，保持光线方向、色彩、材质和画风一致，衔接处不要有明显接缝。", tip: "观察边缘有什么，写出要延续的线条、光线和环境。" },
        { title: "禁止事项", text: "保留原图区域的构图、主体、文字和标识。不移动、裁剪或拉伸原图，不重复主体，不绘制蒙版本身。", tip: "明确哪些内容不能变，降低模型重复主体或改写文字的概率。" },
    ];
    return { sections, prompt: sections.map((part) => `${part.title}：${part.text}`).join("\n") };
}
