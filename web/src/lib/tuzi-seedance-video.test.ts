import { describe, expect, it } from "vitest";

import { buildTuziSeedanceVideoRequest } from "./tuzi-seedance-video";

const base = { prompt: "p", generateAudio: false } as const;

describe("buildTuziSeedanceVideoRequest", () => {
    it("builds text-to-video with clamped duration and uppercase resolution", () => {
        const body = buildTuziSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-0-260128", duration: 20, ratio: "16:9", resolution: "720p", references: [] });
        expect(body).toMatchObject({ refer_model: "textToVideo", duration: 15, ratio: "16:9", resolution: "720P", generate_audio: false, count: 1 });
        expect(body.content).toEqual([{ type: "text", text: "p" }]);
    });

    it("marks multiple images as reference_image under referToVideo", () => {
        const body = buildTuziSeedanceVideoRequest({
            ...base,
            model: "doubao-seedance-2-0-260128",
            references: [
                { type: "image", url: "asset://aaa111" },
                { type: "image", url: "https://x/b.png" },
            ],
        });
        expect(body.refer_model).toBe("referToVideo");
        expect(body.content.slice(1).map((item) => (item as { role: string }).role)).toEqual(["reference_image", "reference_image"]);
    });

    it("forces adaptive ratio for 2.5 first/last frame and orders frames", () => {
        const body = buildTuziSeedanceVideoRequest({
            ...base,
            model: "doubao-seedance-2-5-260628",
            duration: 40,
            ratio: "16:9",
            references: [
                { type: "image", url: "https://x/last.png", role: "last_frame" },
                { type: "image", url: "https://x/first.png", role: "first_frame" },
            ],
        });
        expect(body).toMatchObject({ refer_model: "firstAndLastFrame", ratio: "adaptive", duration: 30 });
        expect(body.content.slice(1).map((item) => (item as { role: string }).role)).toEqual(["first_frame", "last_frame"]);
    });

    it("downgrades frames to reference_image when mixed with video", () => {
        const body = buildTuziSeedanceVideoRequest({
            ...base,
            model: "doubao-seedance-2-5-260628",
            references: [
                { type: "image", url: "https://x/a.png", role: "first_frame" },
                { type: "video", url: "https://x/v.mp4" },
            ],
        });
        expect(body.refer_model).toBe("referToVideo");
        expect(body.content.slice(1)).toEqual([
            { type: "image_url", role: "reference_image", image_url: { url: "https://x/a.png" } },
            { type: "video_url", role: "reference_video", video_url: { url: "https://x/v.mp4" } },
        ]);
    });

    it("omits duration, ratio and unsupported resolution when auto", () => {
        const body = buildTuziSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-5-260628", resolution: "4k", references: [] });
        expect(body).not.toHaveProperty("duration");
        expect(body).not.toHaveProperty("ratio");
        expect(body).not.toHaveProperty("resolution");
    });
});
