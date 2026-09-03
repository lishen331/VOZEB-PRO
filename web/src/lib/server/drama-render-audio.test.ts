import { describe, expect, it } from "vitest";

import { buildDramaRenderAudioFilter, normalizeDramaShotAudioMode, resolveDramaRenderAudioPlan } from "./drama-render-audio";

describe("drama render audio", () => {
    it("keeps a generated video audio track in source mode", () => {
        expect(resolveDramaRenderAudioPlan("source", "", true)).toBe("source");
    });

    it("falls back to silence when source video has no audio", () => {
        expect(resolveDramaRenderAudioPlan("source", "", false)).toBe("silence");
        expect(resolveDramaRenderAudioPlan("mute", "/voice.mp3", true)).toBe("silence");
    });

    it("uses dedicated voiceover only when it is ready", () => {
        expect(resolveDramaRenderAudioPlan("voiceover", "/voice.mp3", true)).toBe("voiceover");
        expect(() => resolveDramaRenderAudioPlan("voiceover", "", true)).toThrow("AI 配音尚未完成");
    });

    it("normalizes unknown modes to source audio", () => {
        expect(normalizeDramaShotAudioMode("mute")).toBe("mute");
        expect(normalizeDramaShotAudioMode("unknown")).toBe("source");
    });

    it("builds a fixed-format filter for one or multiple generated tracks", () => {
        expect(buildDramaRenderAudioFilter(1, 5)).toBe("[1:a]aformat=sample_rates=44100:channel_layouts=stereo[audio0];[audio0]apad,atrim=0:5,aformat=sample_rates=44100:channel_layouts=stereo[a]");
        expect(buildDramaRenderAudioFilter(2, 7)).toContain("[1:a]aformat=sample_rates=44100:channel_layouts=stereo[audio0];[2:a]aformat=sample_rates=44100:channel_layouts=stereo[audio1];[audio0][audio1]amix=inputs=2");
        expect(() => buildDramaRenderAudioFilter(0, 5)).toThrow();
        expect(() => buildDramaRenderAudioFilter(1, 0)).toThrow();
    });
});
