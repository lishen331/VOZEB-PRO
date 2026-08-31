import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { IP_IMAGE_CATEGORIES, groupIpLibraryItems, ipUseTargetPath, visibleIpDetailCommands } from "./ip-library-detail";
import { IP_REFERENCE_ENTRY_VISIBLE } from "@/lib/ip-library-domain";

describe("IP library detail contract", () => {
    it("keeps the five required image groups", () => {
        expect(IP_IMAGE_CATEGORIES.map((item) => item.label)).toEqual(["角色", "场景", "道具", "特效", "风格参考"]);
    });

    it("hands a stable IP version to each creative workspace", () => {
        const detail = { id: "ip one", version: { id: "version one" } };
        expect(ipUseTargetPath("canvas", detail as never)).toBe("/canvas?ipId=ip+one&versionId=version+one");
        expect(ipUseTargetPath("drama", detail as never)).toBe("/drama?ipId=ip+one&versionId=version+one");
        expect(ipUseTargetPath("practice", detail as never)).toBe("/practice?ipId=ip+one&versionId=version+one");
    });

    it("keeps creative handoff code dormant behind the shared entry flag", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/ip-library/components/ip-library-detail.tsx"), "utf8");

        expect(source).toContain("IP_REFERENCE_ENTRY_VISIBLE ? (");
        expect(source).toContain("一键使用");
        expect(source).toContain("ipUseTargetPath");
        expect(IP_REFERENCE_ENTRY_VISIBLE).toBe(false);
        expect(visibleIpDetailCommands()).toEqual(["download-package"]);
    });

    it("groups the complete resource set while retaining station preview URLs", () => {
        const grouped = groupIpLibraryItems([
            publicItem("text", "story_summary"),
            publicItem("image", "character", "/api/ip-library/ip-one/items/image/media"),
            publicItem("audio", "background_music", "/api/ip-library/ip-one/items/audio/media"),
            publicItem("video", "trailer", "/api/ip-library/ip-one/items/video/media"),
        ] as never);

        expect(grouped.text).toHaveLength(1);
        expect(grouped.images.character[0]?.previewUrl).toContain("/api/ip-library/");
        expect(grouped.audio[0]?.previewUrl).toContain("/api/ip-library/");
        expect(grouped.video[0]?.previewUrl).toContain("/api/ip-library/");
    });
});

function publicItem(kind: string, category: string, previewUrl?: string) {
    return { id: kind, versionId: "version-one", kind, category, title: kind, summary: "", sortOrder: 0, createdAt: "2026-08-19T00:00:00.000Z", previewUrl };
}
