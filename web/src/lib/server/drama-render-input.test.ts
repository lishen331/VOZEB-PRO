import { describe, expect, it } from "vitest";

import { normalizeDramaRenderShots } from "./drama-render-input";

describe("normalizeDramaRenderShots", () => {
    it("keeps every render shot, explicit duration and full subtitle", () => {
        const longSubtitle = "完整字幕".repeat(700);
        const shots = Array.from({ length: 61 }, (_, index) => ({
            videoUrl: `/api/reference-assets/video-${index}.mp4`,
            audioMode: "source",
            subtitle: index === 60 ? longSubtitle : `字幕 ${index}`,
            duration: index === 60 ? 21 : 5,
        }));

        const result = normalizeDramaRenderShots(shots);

        expect(result).toHaveLength(61);
        expect(result[60]).toMatchObject({ duration: 21, subtitle: longSubtitle, videoUrl: "/api/reference-assets/video-60.mp4" });
    });

    it("projects ready dialogue and narration tracks and keeps them separate", () => {
        const result = normalizeDramaRenderShots([
            {
                videoUrl: "/shot.mp4",
                audioMode: "source",
                audioUrl: "/legacy.mp3",
                dialogueAudio: { status: "success", url: "/dialogue.mp3" },
                narrationAudio: { status: "success", url: "/narration.mp3" },
                duration: 6,
            },
        ]);

        expect(result[0]).toMatchObject({
            audioMode: "voiceover",
            audioUrl: "/dialogue.mp3",
            dialogueAudioUrl: "/dialogue.mp3",
            narrationAudioUrl: "/narration.mp3",
            audioTracks: [
                { kind: "dialogue", url: "/dialogue.mp3" },
                { kind: "narration", url: "/narration.mp3" },
            ],
        });
    });

    it("can preserve legacy /drama audioMode when shared TTS fields are present", () => {
        const result = normalizeDramaRenderShots(
            [{
                videoUrl: "/shot.mp4",
                audioMode: "source",
                dialogueAudio: { status: "success", url: "/dialogue.mp3" },
                narrationAudio: { status: "success", url: "/narration.mp3" },
            }],
            { preferDedicatedAudio: false },
        )[0];

        expect(result).toMatchObject({ audioMode: "source", audioTracks: [{ kind: "dialogue" }, { kind: "narration" }] });
    });

    it("accepts legacy audioUrl only when the caller explicitly requests voiceover", () => {
        expect(normalizeDramaRenderShots([{ videoUrl: "/shot.mp4", audioUrl: "/legacy.mp3", audioMode: "voiceover" }])[0]).toMatchObject({
            audioMode: "voiceover",
            audioUrl: "/legacy.mp3",
            audioTracks: [{ kind: "legacy", url: "/legacy.mp3" }],
        });
        expect(normalizeDramaRenderShots([{ videoUrl: "/shot.mp4", audioUrl: "/legacy.mp3", audioMode: "source" }])[0]).toMatchObject({ audioMode: "source" });
    });

    it("does not consume a stale per-kind URL while a track is running", () => {
        const result = normalizeDramaRenderShots([{ videoUrl: "/shot.mp4", audioMode: "voiceover", dialogueAudio: { status: "running", url: "/stale.mp3" } }])[0];
        expect(result).toMatchObject({ audioMode: "voiceover", audioUrl: "", audioTracks: [] });
    });

    it("uses dialogue or narration as a subtitle fallback when no explicit subtitle is sent", () => {
        expect(normalizeDramaRenderShots([{ videoUrl: "/shot.mp4", dialogue: "对白文本" }])[0].subtitle).toBe("对白文本");
    });
});
