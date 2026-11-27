import { CANVAS_EXPRESSION_INTENSITIES, CANVAS_EXPRESSION_PRESETS, canvasEmotionPromptParts, type CanvasEmotionSelection } from "@/app/(user)/canvas/utils/canvas-emotion-prompt";
import type { UploadedImage } from "@/services/image-storage";

export const EXPRESSION_HISTORY_LIMIT = 20; // Existing generation history default.
export type ExpressionPracticeRecord = {
    id: string;
    createdAt: number;
    sourceUrl: string;
    selection: CanvasEmotionSelection;
    prompt: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    model?: string;
    image?: UploadedImage;
    error?: string;
};

export function readExpressionSelection(value: unknown): CanvasEmotionSelection | null {
    if (!value || typeof value !== "object") return null;
    const { face, expressionId, intensity, excitement, affinity } = value as Partial<CanvasEmotionSelection>;
    const preset = CANVAS_EXPRESSION_PRESETS.find((item) => item.id === expressionId);
    const strength = CANVAS_EXPRESSION_INTENSITIES.find((item) => item.id === intensity);
    if (!face || !preset || !strength || !unit(excitement) || !unit(affinity)) return null;
    const { x, y, width, height } = face;
    if (![x, y, width, height].every(unit) || width <= 0.01 || height <= 0.01 || x + width > 1 + Number.EPSILON || y + height > 1 + Number.EPSILON) return null;
    return { face: { x, y, width, height }, expressionId: preset.id, intensity: strength.id, excitement, affinity };
}

const unit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

export function expressionLesson(selection: CanvasEmotionSelection) {
    const { values, expression, intensity } = canvasEmotionPromptParts(selection);
    return { expression: expression.label, intensity: intensity.label, prompt: values.join("，") + "。", rows: values.map((value, i) => ({ label: ["编辑对象", "目标表情与强度", "情绪方向", "保留要求"][i], value })) };
}
