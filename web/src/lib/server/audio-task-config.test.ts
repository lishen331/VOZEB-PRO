import { describe, expect, it } from "vitest";

import { resolveAudioModeOptions, resolveAudioTaskOptions, resolveDialogScript } from "./audio-task-config";

describe("resolveAudioTaskOptions", () => {
    const defaults = { audioVoice: "nova", audioFormat: "wav" };

    it("uses backend generation defaults when request parameters are missing", () => {
        expect(resolveAudioTaskOptions(undefined, defaults)).toEqual({ voice: "nova", format: "wav", speed: "1" });
    });

    it("keeps explicit request parameters", () => {
        expect(resolveAudioTaskOptions({ voice: "alloy", format: "mp3", speed: "1.25" }, defaults)).toEqual({ voice: "alloy", format: "mp3", speed: "1.25" });
    });

    it("treats blank request parameters as missing", () => {
        expect(resolveAudioTaskOptions({ voice: " ", format: "", speed: " " }, defaults)).toEqual({ voice: "nova", format: "wav", speed: "1" });
    });
});

describe("resolveAudioModeOptions", () => {
    const context = { channelId: "channel-1", model: "speech-2.8-turbo", userId: "user-1" };

    it("defaults to plain synthesis for unknown modes", () => {
        expect(resolveAudioModeOptions(undefined, context)).toEqual({ mode: "tts" });
        expect(resolveAudioModeOptions({ mode: "voice-cloning" }, context)).toEqual({ mode: "tts" });
    });

    it("keeps the design description and drops unknown fields", () => {
        expect(resolveAudioModeOptions({ mode: "design", voiceDescription: "  撒娇女声  " }, context)).toEqual({ mode: "design", voiceDescription: "撒娇女声" });
    });

    it("computes a clone fingerprint that varies by user, channel, model and audio", () => {
        const request = { mode: "clone", referenceAudioUrl: "https://cdn.example.com/a.mp3", cloneConsent: true };
        const first = resolveAudioModeOptions(request, context);
        expect(first).toMatchObject({ mode: "clone", cloneConsent: true, referenceAudioUrl: request.referenceAudioUrl });
        expect("referenceAudioFingerprint" in first && first.referenceAudioFingerprint).toMatch(/^[a-f0-9]{64}$/);
        const other = resolveAudioModeOptions(request, { ...context, model: "speech-2.8-hd" });
        expect("referenceAudioFingerprint" in other && other.referenceAudioFingerprint).not.toBe("referenceAudioFingerprint" in first && first.referenceAudioFingerprint);
    });

    it("omits the fingerprint when the reference audio is missing", () => {
        expect(resolveAudioModeOptions({ mode: "clone", cloneConsent: true }, context)).toEqual({ mode: "clone", referenceAudioUrl: "", cloneConsent: true });
    });
});

describe("resolveDialogScript", () => {
    it("keeps only roles that appear in the script and have a voice", () => {
        const result = resolveDialogScript({
            dialogText: "小美：你好\n阿强：你也好\n小美：再见",
            dialogRoles: {
                小美: { voice: "longanhuan_v3.1", instruction: "  撒娇  " },
                阿强: { voice: "longlaotie_v3.1", emotion: "happy" },
                多余: { voice: "unused" },
            },
        });
        expect(result.lines.map((line) => line.role)).toEqual(["小美", "阿强", "小美"]);
        expect(result.roles).toEqual({ 小美: { voice: "longanhuan_v3.1", instruction: "撒娇" }, 阿强: { voice: "longlaotie_v3.1", emotion: "happy" } });
    });

    it("drops roles without a voice so validation can report them", () => {
        expect(resolveDialogScript({ dialogText: "小美：你好\n阿强：你好", dialogRoles: { 小美: { voice: "v" } } }).roles).toEqual({ 小美: { voice: "v" } });
    });

    it("tolerates missing input", () => {
        expect(resolveDialogScript(undefined)).toEqual({ lines: [], roles: {} });
    });
});
