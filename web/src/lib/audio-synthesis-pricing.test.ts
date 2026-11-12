import { describe, expect, it } from "vitest";

import { audioBillingUnits, audioPointCostPerUnit, billableChars, readSynthesisText } from "./audio-synthesis-pricing";

describe("audio synthesis billing", () => {
    it("counts characters the way each provider bills them", () => {
        // 千问：中文 1 个字算 1 个字符
        expect(billableChars("你好，世界")).toBe(5);
        // MiniMax：汉字算 2 个，标点算 1 个
        expect(billableChars("你好，世界", { doubleByteCounts: true })).toBe(9);
        expect(billableChars("hi 你好", { doubleByteCounts: true })).toBe(7);
        expect(billableChars("   ")).toBe(0);
    });

    it("reads the text from qwen, minimax and openai-style bodies", () => {
        expect(readSynthesisText({ model: "qwen-audio-3.1-tts-flash", input: { text: "千问", voice: "x" } })).toBe("千问");
        expect(readSynthesisText({ model: "speech-2.8-hd", text: "海螺" })).toBe("海螺");
        expect(readSynthesisText({ model: "tts-1", input: "openai" })).toBe("openai");
        expect(readSynthesisText(undefined)).toBe("");
    });

    it("bills qwen and minimax per 100 billable characters, at least one unit", () => {
        expect(audioBillingUnits("qwen-audio-3.1-tts-flash", { input: { text: "短句" } })).toBe(1);
        expect(audioBillingUnits("qwen-audio-3.1-tts-plus", { input: { text: "字".repeat(100) } })).toBe(1);
        expect(audioBillingUnits("qwen-audio-3.1-tts-plus", { input: { text: "字".repeat(101) } })).toBe(2);
        // MiniMax 50 个汉字 = 100 计费字符 = 1 单位；51 个 = 102 = 2 单位
        expect(audioBillingUnits("speech-2.8-hd", { text: "字".repeat(50) })).toBe(1);
        expect(audioBillingUnits("speech-2.8-hd", { text: "字".repeat(51) })).toBe(2);
    });

    it("keeps per-call billing for suno and openai-style audio", () => {
        expect(audioBillingUnits("suno_music", { prompt: "字".repeat(5000) })).toBe(1);
        expect(audioBillingUnits("tts-1", { input: "字".repeat(5000) })).toBe(1);
    });

    it("caps units at the charge service limit", () => {
        expect(audioBillingUnits("qwen-audio-3.1-tts-plus", { input: { text: "字".repeat(200_000) } })).toBe(1000);
    });

    // 后台给每个模型填的积分 = 每 100 计费字符的积分 = 单价(元/万字符) × 1.1
    it("derives the per-unit point cost from the official price plus 10%", () => {
        expect(audioPointCostPerUnit(1.4)).toBe(1.54); // qwen-audio-3.1-tts-plus
        expect(audioPointCostPerUnit(3.5)).toBe(3.85); // speech-2.8-hd
        expect(audioPointCostPerUnit(2.0)).toBe(2.2); // speech-2.8-turbo
    });

    it("matches the cost-plus-10% target for a realistic sentence", () => {
        // 100 个汉字用 speech-2.8-hd：上游 200 计费字符 × 3.5 元/万 = 0.07 元；平台应收 0.077 元 = 7.7 积分
        const units = audioBillingUnits("speech-2.8-hd", { text: "字".repeat(100) });
        expect(units * audioPointCostPerUnit(3.5)).toBeCloseTo(7.7, 5);
    });
});
