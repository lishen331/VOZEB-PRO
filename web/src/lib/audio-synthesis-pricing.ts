import { audioModelFamily } from "@/lib/audio-model-params";

/*
 * 语音合成按上游字数计费（成本价 × 1.1，100 积分 = 1 元）。
 *
 * 扣费链路是：积分 = 计费单位数 × 模型积分（model_point_costs）。所以这里只算「计费单位数」：
 *   1 单位 = 100 个计费字符，不足 100 按 1 单位，最少 1 单位。
 * 每个模型的积分（每 100 字符）在后台按 单价(元/万字符) × 1.1 填写，例如：
 *   qwen-audio-3.1-tts-plus  1.4 元/万字符 → 1.54
 *   speech-2.8-hd            3.5 元/万字符 → 3.85
 *
 * - 千问：按字符计费，中文也是 1 个字符。
 * - MiniMax：官方口径 1 个汉字算 2 个字符，其他字符算 1 个。
 * - Suno、OpenAI 兼容等其他音频模型仍按次计费（1 单位）。
 */

export const AUDIO_CHARS_PER_UNIT = 100;
/** 扣费层对单位数有 1000 的上限；按 100 字符一单位，即单次最多 10 万计费字符。 */
const MAX_AUDIO_UNITS = 1000;

/** 按官方口径统计计费字符数。 */
export function billableChars(text: string, options: { doubleByteCounts?: boolean } = {}) {
    const value = (text || "").trim();
    if (!value) return 0;
    if (!options.doubleByteCounts) return [...value].length;
    let total = 0;
    for (const char of value) total += /[㐀-䶿一-鿿豈-﫿]/.test(char) ? 2 : 1;
    return total;
}

/** 从请求体里取出要合成的文本：MiniMax 用 text，千问用 input.text，OpenAI 兼容用 input。 */
export function readSynthesisText(payload: unknown): string {
    if (!payload || typeof payload !== "object") return "";
    const body = payload as Record<string, unknown>;
    const direct = [body.text, body.input].find((value) => typeof value === "string" && value.trim());
    if (typeof direct === "string") return direct;
    const input = body.input;
    if (input && typeof input === "object" && !Array.isArray(input)) {
        const text = (input as Record<string, unknown>).text;
        if (typeof text === "string") return text;
    }
    return "";
}

/** 一次音频请求的计费单位数。 */
export function audioBillingUnits(model: string, payload: unknown) {
    const family = audioModelFamily(model);
    if (family !== "qwen" && family !== "minimax") return 1;
    const chars = billableChars(readSynthesisText(payload), { doubleByteCounts: family === "minimax" });
    return Math.min(MAX_AUDIO_UNITS, Math.max(1, Math.ceil(chars / AUDIO_CHARS_PER_UNIT)));
}

/** 后台填写的模型积分（每 100 计费字符）：单价(元/万字符) × 1.1，向上保留两位小数。 */
export function audioPointCostPerUnit(pricePerTenThousandChars: number) {
    // 先消掉浮点尾差（3.5 × 1.1 × 100 = 385.00000000000006），再向上取整到分，保证不低于成本 +10%。
    const cents = Number((pricePerTenThousandChars * 1.1 * 100).toFixed(6));
    return Math.ceil(cents) / 100;
}
