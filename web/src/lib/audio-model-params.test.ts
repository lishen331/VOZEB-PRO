import { describe, expect, it } from "vitest";

import { audioModelFamily, audioModelFields, audioModelPlaceholder, audioParamsSummary, audioUpstreamFields, audioVisibleFields, isAudioLyricsMode, normalizeAudioParams } from "./audio-model-params";

describe("audio model params", () => {
    it("routes models to their LibTV-style parameter family", () => {
        expect(audioModelFamily("speech-2.8-hd")).toBe("minimax");
        expect(audioModelFamily("speech-02-turbo")).toBe("minimax");
        expect(audioModelFamily("suno/v6")).toBe("suno");
        expect(audioModelFamily("suno_music")).toBe("suno");
        expect(audioModelFamily("tts-1")).toBe("openai");
    });

    it("fills defaults, clamps ranges and drops unknown keys", () => {
        const params = normalizeAudioParams("speech-2.8-hd", { speed: 9, pitch: -40, emotion: "bogus", injected: "x" });
        expect(params).toMatchObject({ voiceId: "female-shaonv", speed: 2, pitch: -12, volume: 1, emotion: "auto", soundEffect: "none", format: "mp3" });
        expect(params).not.toHaveProperty("injected");
    });

    it("maps MiniMax params to native voice_setting / voice_modify fields", () => {
        const fields = audioUpstreamFields("speech-2.8-turbo", "你好", { voiceId: "male-qn-jingying", speed: 1.2, pitch: 3, volume: 2, emotion: "happy", modifyPitch: 10, soundEffect: "robotic", format: "wav" });
        expect(fields).toEqual({
            voice: "male-qn-jingying",
            speed: 1.2,
            response_format: "wav",
            voice_setting: { voice_id: "male-qn-jingying", speed: 1.2, vol: 2, pitch: 3, emotion: "happy" },
            voice_modify: { pitch: 10, intensity: 0, timbre: 0, sound_effects: "robotic" },
            audio_setting: { format: "wav" },
        });
    });

    it("maps Suno describe and lyrics modes", () => {
        expect(audioUpstreamFields("suno/v6", "一首夏日电子乐", { instrumental: true, tags: "电子" })).toEqual({ prompt: "", gpt_description_prompt: "一首夏日电子乐", tags: "电子", make_instrumental: true });
        expect(audioUpstreamFields("suno_music", "[Verse] 歌词", { mode: "lyrics", title: "夏天" })).toEqual({ prompt: "[Verse] 歌词", title: "夏天", tags: undefined, make_instrumental: false });
        expect(audioParamsSummary("suno/v6", { mode: "lyrics", instrumental: true })).toBe("歌词生音乐");
        expect(audioParamsSummary("suno/v6", { instrumental: true })).toBe("描述生音乐 · 纯音乐");
    });

    it("forces make_instrumental off for saved lyrics-mode params", () => {
        expect(audioUpstreamFields("suno/v6", "[Chorus] 歌词", { mode: "lyrics", instrumental: true })).toMatchObject({ prompt: "[Chorus] 歌词", make_instrumental: false });
    });

    it("shows Suno fields per mode", () => {
        const keys = (params: unknown) => audioVisibleFields("suno/v6", params).map((field) => field.key);
        expect(keys({})).toEqual(["mode", "instrumental", "tags"]);
        expect(keys({ mode: "lyrics" })).toEqual(["mode", "title", "tags"]);
        expect(audioVisibleFields("speech-02-hd", {}).length).toBe(audioModelFields("speech-02-hd").length);
    });

    it("switches the Suno placeholder and lyrics flag with the mode", () => {
        expect(isAudioLyricsMode("suno/v6", { mode: "lyrics" })).toBe(true);
        expect(isAudioLyricsMode("suno/v6", {})).toBe(false);
        expect(isAudioLyricsMode("speech-02-hd", { mode: "lyrics" })).toBe(false);
        expect(audioModelPlaceholder("suno/v6", { mode: "lyrics" })).toContain("AI 写歌词");
        expect(audioModelPlaceholder("suno/v6", {})).toContain("描述你想要的音乐");
    });

    it("leaves OpenAI-style models untouched", () => {
        expect(audioUpstreamFields("tts-1", "hi", { speed: 2 })).toEqual({});
        expect(normalizeAudioParams("tts-1", { speed: 2 })).toEqual({});
    });
});
