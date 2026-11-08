import { describe, expect, it } from "vitest";

import { filterPlayablePublicWorkAssets } from "./public-work-media-browser";

const asset = (id: string, mediaType: "image" | "video" | "audio" | "text") => ({ id, mediaType, role: "content", url: `/${id}`, mimeType: `${mediaType}/x`, sortOrder: 0, metadata: {} }) as never;

describe("published work media viewer", () => {
    it("keeps only playable published image/video/audio assets and omits failed URLs", () => {
        expect(filterPlayablePublicWorkAssets([asset("image-one", "image"), asset("image-failed", "image"), asset("video-one", "video"), asset("audio-one", "audio"), asset("text-one", "text")], new Set(["image-failed"])).map((item) => item.id)).toEqual([
            "image-one",
            "video-one",
            "audio-one",
        ]);
    });
});
