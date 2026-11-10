import { describe, expect, it } from "vitest";

import { creativeUploadLimitLabel, creativeUploadMaxBytes, creativeUploadTypeFromMime, isCreativeUploadMimeType } from "./creative-upload";

describe("creative upload limits", () => {
    it("accepts the audio/x-flac MIME returned by the bundled storyboard voice", () => {
        expect(isCreativeUploadMimeType("audio/x-flac")).toBe(true);
        expect(creativeUploadTypeFromMime("audio/x-flac")).toBe("audio");
    });
    it.each([
        ["image/png", "image", 20, "20MB"],
        ["audio/mpeg", "audio", 30, "30MB"],
        ["video/mp4", "video", 800, "800MB"],
    ])("uses the shared %s upload limit", (mime, type, megabytes, label) => {
        expect(creativeUploadTypeFromMime(mime)).toBe(type);
        expect(creativeUploadMaxBytes(type as "image" | "audio" | "video")).toBe(megabytes * 1024 * 1024);
        expect(creativeUploadLimitLabel(type as "image" | "audio" | "video")).toBe(label);
    });
});
