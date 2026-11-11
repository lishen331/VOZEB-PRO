import { describe, expect, it } from "vitest";

import { audioModeBlockingReason, buildAudioModeRequest, resolveAudioMode, shouldSuggestDialog } from "./audio-node-mode";

const twoRoles = ["小美：你好", "阿强：你也好"].join("\n");

describe("resolveAudioMode", () => {
    it("defaults to plain synthesis", () => {
        expect(resolveAudioMode({}, false)).toBe("tts");
    });

    it("switches to clone when a reference audio is connected", () => {
        expect(resolveAudioMode({}, true)).toBe("clone");
        expect(resolveAudioMode({ audioMode: "design" }, true)).toBe("clone");
    });

    it("falls back from clone once the reference is removed", () => {
        expect(resolveAudioMode({ audioMode: "clone" }, false)).toBe("tts");
    });

    it("keeps a manually chosen mode regardless of connections", () => {
        expect(resolveAudioMode({ audioMode: "tts", audioModeManual: true }, true)).toBe("tts");
        expect(resolveAudioMode({ audioMode: "dialog", audioModeManual: true }, false)).toBe("dialog");
    });
});

describe("shouldSuggestDialog", () => {
    it("suggests only when two roles appear and the user has not dismissed it", () => {
        expect(shouldSuggestDialog({}, "tts", twoRoles)).toEqual(["小美", "阿强"]);
        expect(shouldSuggestDialog({ audioDialogSuggestDismissed: true }, "tts", twoRoles)).toBeNull();
        expect(shouldSuggestDialog({}, "dialog", twoRoles)).toBeNull();
        expect(shouldSuggestDialog({}, "tts", "注意：明天下雨")).toBeNull();
    });
});

describe("audioModeBlockingReason", () => {
    it("requires a description for design", () => {
        expect(audioModeBlockingReason("design", {}, { text: "hi" })).toContain("声音描述");
        expect(audioModeBlockingReason("design", { audioVoiceDescription: "女声" }, { text: "hi" })).toBeNull();
    });

    it("requires a reference and consent for clone", () => {
        expect(audioModeBlockingReason("clone", { audioCloneConsent: true }, { text: "hi" })).toContain("参考音频");
        expect(audioModeBlockingReason("clone", {}, { text: "hi", referenceAudioUrl: "/a.mp3" })).toContain("授权");
        expect(audioModeBlockingReason("clone", { audioCloneConsent: true }, { text: "hi", referenceAudioUrl: "/a.mp3" })).toBeNull();
    });

    it("requires every dialog role to have a voice", () => {
        expect(audioModeBlockingReason("dialog", { audioDialogRoles: { 小美: { voice: "a" } } }, { text: twoRoles })).toContain("阿强");
        expect(audioModeBlockingReason("dialog", { audioDialogRoles: { 小美: { voice: "a" }, 阿强: { voice: "b" } } }, { text: twoRoles })).toBeNull();
    });
});

describe("buildAudioModeRequest", () => {
    it("only sends roles that appear in the text", () => {
        const request = buildAudioModeRequest("dialog", { audioDialogRoles: { 小美: { voice: "a" }, 阿强: { voice: "b" }, 多余: { voice: "c" } } }, { text: twoRoles });
        expect(request).toEqual({ mode: "dialog", dialogText: twoRoles, dialogRoles: { 小美: { voice: "a" }, 阿强: { voice: "b" } } });
    });

    it("builds clone and design payloads", () => {
        expect(buildAudioModeRequest("clone", { audioCloneConsent: true }, { text: "hi", referenceAudioUrl: "/a.mp3" })).toEqual({ mode: "clone", referenceAudioUrl: "/a.mp3", cloneConsent: true });
        expect(buildAudioModeRequest("design", { audioVoiceDescription: "  女声 " }, { text: "hi" })).toEqual({ mode: "design", voiceDescription: "女声" });
        expect(buildAudioModeRequest("tts", {}, { text: "hi" })).toEqual({ mode: "tts" });
    });
});
