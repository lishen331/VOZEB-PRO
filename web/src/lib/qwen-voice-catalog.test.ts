import { describe, expect, it } from "vitest";

import { normalizeAudioParams } from "./audio-model-params";
import { isQwenBasicPreviewFile, QWEN_BASIC_VOICE_GROUP, qwenCatalogVoices } from "./qwen-voice-catalog";

const counts: Record<string, number> = {
    "qwen-audio-3.1-tts-plus": 4,
    "qwen-audio-3.1-tts-flash": 139,
    "qwen-audio-3.0-tts-plus": 599,
    "qwen-audio-3.0-tts-flash": 609,
};

describe("qwen voice catalog", () => {
    it("matches the official voice counts per model", () => {
        for (const [model, count] of Object.entries(counts)) expect(qwenCatalogVoices(model)).toHaveLength(count);
    });

    it("has unique ids and a preview for every voice", () => {
        for (const model of Object.keys(counts)) {
            const voices = qwenCatalogVoices(model);
            expect(new Set(voices.map((voice) => voice.value)).size).toBe(voices.length);
            for (const voice of voices) expect(voice.preview).toMatch(/^(https:\/\/(g-adoc\.alcasset\.com|help-static-aliyun-doc\.aliyuncs\.com)\/|\/api\/public\/qwen-voice-previews\/[a-z0-9_]+\.wav$)/);
        }
    });

    it("prefixes basic voices with their own model", () => {
        for (const model of ["qwen-audio-3.0-tts-plus", "qwen-audio-3.0-tts-flash"]) {
            const basic = qwenCatalogVoices(model).filter((voice) => voice.group === QWEN_BASIC_VOICE_GROUP);
            expect(basic).toHaveLength(597);
            for (const voice of basic) expect(voice.value.startsWith(`${model}-`)).toBe(true);
        }
        expect(qwenCatalogVoices("qwen-audio-3.1-tts-flash").some((voice) => voice.group === QWEN_BASIC_VOICE_GROUP)).toBe(false);
    });

    it("keeps voices scoped to their model and existing defaults valid", () => {
        expect(normalizeAudioParams("qwen-audio-3.0-tts-flash", { voiceId: "qwen-audio-3.0-tts-plus-longcanzhuyue" }).voiceId).toBe("longanhuan_v3.6");
        expect(normalizeAudioParams("qwen-audio-3.0-tts-plus", { voiceId: "qwen-audio-3.0-tts-plus-longcanzhuyue" }).voiceId).toBe("qwen-audio-3.0-tts-plus-longcanzhuyue");
        expect(normalizeAudioParams("qwen-audio-3.1-tts-flash", { voiceId: "qwen-audio-3.1-tts-flash-lumen_la" }).voiceId).toBe("qwen-audio-3.1-tts-flash-lumen_la");
        expect(normalizeAudioParams("qwen-audio-3.1-tts-flash", {}).voiceId).toBe("longanhuan_v3.1");
        expect(normalizeAudioParams("qwen-audio-3.0-tts-plus", {}).voiceId).toBe("longanlingxin");
    });

    it("searches by trait and language, not only the label", () => {
        expect(qwenCatalogVoices("qwen-audio-3.1-tts-flash").find((voice) => voice.value === "qwen-audio-3.1-tts-flash-lumen_la")?.search).toContain("拉丁语");
        expect(qwenCatalogVoices("qwen-audio-3.0-tts-flash").find((voice) => voice.value.endsWith("-longcanzhuyue"))?.search).toContain("日常对话");
    });

    it("only accepts preview file names from the catalog", () => {
        expect(isQwenBasicPreviewFile("longcanzhuyue.wav")).toBe(true);
        for (const file of ["longbailanlan.wav", "../longcanzhuyue.wav", "longcanzhuyue"]) expect(isQwenBasicPreviewFile(file)).toBe(false);
    });
});
