import { describe, expect, it } from "vitest";

import { assertVideoReferenceRoles } from "@/lib/server/provider-task-config";

import { buildMohuiSeedanceVideoRequest } from "./mohui-seedance-video";

const base = { prompt: "p", generateAudio: false } as const;
const roles = (body: { content: unknown[] }) => body.content.slice(1).map((item) => (item as { role: string }).role);

describe("buildMohuiSeedanceVideoRequest", () => {
    it("builds text-to-video with lowercase resolution and clamped duration", () => {
        const body = buildMohuiSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-0", duration: 20, ratio: "16:9", resolution: "480P", references: [] });
        expect(body).toEqual({ model: "doubao-seedance-2-0", content: [{ type: "text", text: "p" }], ratio: "16:9", resolution: "480p", duration: 15, generate_audio: false, watermark: false });
    });

    it("omits auto duration and unsupported resolutions per model", () => {
        expect(buildMohuiSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-5", resolution: "480p", references: [] })).not.toHaveProperty("resolution");
        expect(buildMohuiSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-0-fast", resolution: "1080p", references: [] })).not.toHaveProperty("resolution");
        expect(buildMohuiSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-5", resolution: "720p", references: [] }).resolution).toBe("720p");
        expect(buildMohuiSeedanceVideoRequest({ ...base, model: "doubao-seedance-2-0", references: [] })).not.toHaveProperty("duration");
    });

    it("sends real-person images as reference_image URLs", () => {
        const body = buildMohuiSeedanceVideoRequest({
            ...base,
            model: "doubao-seedance-2-0",
            references: [
                { type: "image", url: "https://x/a.jpg" },
                { type: "image", url: "https://x/b.jpg", role: "first_frame" },
            ],
        });
        expect(roles(body)).toEqual(["reference_image", "reference_image"]);
        expect(body.content[1]).toEqual({ type: "image_url", image_url: { url: "https://x/a.jpg" }, role: "reference_image" });
        expect(body).not.toHaveProperty("ratio");
    });

    it("keeps first/last frame roles in order and defaults ratio to adaptive", () => {
        const body = buildMohuiSeedanceVideoRequest({
            ...base,
            model: "doubao-seedance-2-0",
            references: [
                { type: "image", url: "https://x/last.jpg", role: "last_frame" },
                { type: "image", url: "https://x/first.jpg", role: "first_frame" },
            ],
        });
        expect(roles(body)).toEqual(["first_frame", "last_frame"]);
        expect(body.ratio).toBe("adaptive");
    });

    it("maps video and audio references", () => {
        const body = buildMohuiSeedanceVideoRequest({
            ...base,
            model: "doubao-seedance-2-0",
            references: [
                { type: "video", url: "https://x/v.mp4" },
                { type: "audio", url: "https://x/a.mp3" },
            ],
        });
        expect(roles(body)).toEqual(["reference_video", "reference_audio"]);
    });

    it("accepts first/last frame roles for the protocol", () => {
        const frames = [
            { type: "image", url: "https://x/f.jpg", role: "first_frame" },
            { type: "image", url: "https://x/l.jpg", role: "last_frame" },
        ] as never;
        expect(() => assertVideoReferenceRoles({ protocol: "mohui-seedance" } as never, frames)).not.toThrow();
    });
});
