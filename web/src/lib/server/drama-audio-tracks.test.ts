import { describe, expect, it } from "vitest";

import { resolveDramaAudioTracks } from "./drama-audio-tracks";

describe("resolveDramaAudioTracks", () => {
    it("uses ready per-kind states without duplicating the legacy projection", () => {
        expect(
            resolveDramaAudioTracks({
                audioUrl: "/latest.mp3",
                dialogueAudio: { status: "success", url: "/dialogue.mp3" },
                narrationAudio: { status: "success", url: "/narration.mp3" },
            }),
        ).toEqual({
            dialogueUrl: "/dialogue.mp3",
            narrationUrl: "/narration.mp3",
            legacyUrl: "/latest.mp3",
            tracks: [
                { kind: "dialogue", url: "/dialogue.mp3" },
                { kind: "narration", url: "/narration.mp3" },
            ],
        });
    });

    it("falls back to the legacy field for older shots", () => {
        expect(resolveDramaAudioTracks({ audioUrl: "/legacy.mp3" }).tracks).toEqual([{ kind: "legacy", url: "/legacy.mp3" }]);
    });

    it("ignores failed or in-flight dedicated states", () => {
        expect(
            resolveDramaAudioTracks({
                audioUrl: "/legacy.mp3",
                dialogueAudio: { status: "error", url: "/stale-dialogue.mp3" },
                narrationAudio: { status: "running", url: "/stale-narration.mp3" },
            }).tracks,
        ).toEqual([]);
    });

    it("does not expose data/blob URLs to downstream media fetchers", () => {
        expect(resolveDramaAudioTracks({ audioUrl: "data:audio/mp3;base64,AAAA", dialogueAudio: { status: "success", url: "blob:http://local/id" } }).tracks).toEqual([]);
    });

    it("assigns a legacy root URL to narration when only narration text is present", () => {
        expect(
            resolveDramaAudioTracks({
                audioUrl: "/legacy-narration.mp3",
                narration: "旁白文本",
                dialogueAudio: { status: "success", url: "/dialogue.mp3" },
            }).tracks,
        ).toEqual([
            { kind: "dialogue", url: "/dialogue.mp3" },
            { kind: "narration", url: "/legacy-narration.mp3" },
        ]);
    });

    it("assigns a legacy root URL to dialogue when only dialogue text is present", () => {
        expect(
            resolveDramaAudioTracks({
                audioUrl: "/legacy-dialogue.mp3",
                dialogue: "对白文本",
                narrationAudio: { status: "success", url: "/narration.mp3" },
            }).tracks,
        ).toEqual([
            { kind: "narration", url: "/narration.mp3" },
            { kind: "dialogue", url: "/legacy-dialogue.mp3" },
        ]);
    });

    it("marks an ambiguous legacy URL for review instead of silently dropping it", () => {
        expect(
            resolveDramaAudioTracks({
                audioUrl: "/legacy.mp3",
                dialogue: "对白文本",
                narration: "旁白文本",
                dialogueAudio: { status: "success", url: "/dialogue.mp3" },
            }),
        ).toMatchObject({
            tracks: [{ kind: "dialogue", url: "/dialogue.mp3" }],
            needsReview: true,
            reviewReason: expect.stringContaining("无法确定归属"),
        });
    });

    it("marks an unassigned legacy-only URL for review when both text kinds exist", () => {
        expect(resolveDramaAudioTracks({ audioUrl: "/legacy.mp3", dialogue: "对白文本", narration: "旁白文本" })).toMatchObject({
            tracks: [{ kind: "legacy", url: "/legacy.mp3" }],
            needsReview: true,
            reviewReason: expect.stringContaining("无法确定归属"),
        });
    });

    it("does not duplicate a root URL that already exists on a dedicated track", () => {
        expect(
            resolveDramaAudioTracks({
                audioUrl: "/same.mp3",
                dialogueAudio: { status: "success", url: "/same.mp3" },
                narration: "旁白文本",
            }).tracks,
        ).toEqual([{ kind: "dialogue", url: "/same.mp3" }]);
    });
});
