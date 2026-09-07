import { describe, expect, it } from "vitest";

import type { Asset } from "@/lib/library-asset-contract";
import { dramaLibraryAssetType, isDramaLibraryAsset } from "@/lib/drama-lab-library-assets";

describe("drama lab material library asset classification", () => {
    it("uses the explicit metadata contract", () => {
        expect(dramaLibraryAssetType(asset({ metadata: { dramaAssetType: "scene" } }))).toBe("scene");
        expect(isDramaLibraryAsset(asset({ metadata: { dramaAssetType: "scene" } }), "scene")).toBe(true);
        expect(isDramaLibraryAsset(asset({ metadata: { dramaAssetType: "scene" } }), "character")).toBe(false);
    });

    it("keeps compatibility with assets saved before metadata was added", () => {
        expect(dramaLibraryAssetType(asset({ tags: ["短剧", "角色"] }))).toBe("character");
        expect(dramaLibraryAssetType(asset({ tags: ["短剧", "场景"] }))).toBe("scene");
        expect(dramaLibraryAssetType(asset({ tags: ["短剧", "道具"] }))).toBe("prop");
    });
});

function asset(patch: Partial<Asset> = {}): Asset {
    return {
        id: "asset-one",
        kind: "image",
        title: "测试素材",
        coverUrl: "/api/reference-assets/permanent/test.png",
        tags: [],
        createdAt: "2026-09-07T00:00:00.000Z",
        updatedAt: "2026-09-07T00:00:00.000Z",
        data: {
            dataUrl: "/api/reference-assets/permanent/test.png",
            storageKey: "permanent/test.png",
            serverUrl: "/api/reference-assets/permanent/test.png",
            width: 1024,
            height: 1024,
            bytes: 4,
            mimeType: "image/png",
        },
        ...patch,
    } as Asset;
}
