import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { IP_IMAGE_CATEGORIES, groupIpLibraryItems, ipUseTargetPath, visibleIpDetailCommands } from "./ip-library-detail";

describe("IP library detail contract", () => {
    it("passes the selected child IP to creative workspaces", () => {
        const detail = { id: "ip one" };
        expect(ipUseTargetPath("canvas", detail as never, "child one")).toBe("/canvas?ipId=ip+one&subIpId=child+one");
        expect(ipUseTargetPath("drama", detail as never, "child one")).toBe("/drama?ipId=ip+one&subIpId=child+one");
    });

    it("groups child content by media type and image category", () => {
        const grouped = groupIpLibraryItems([item("text", "story_summary"), item("image", "character"), item("audio", "background_music"), item("video", "trailer")] as never);
        expect(IP_IMAGE_CATEGORIES.map((entry) => entry.label)).toEqual(["角色", "场景", "道具", "特效", "风格参考"]);
        expect(grouped.text).toHaveLength(1);
        expect(grouped.images.character).toHaveLength(1);
        expect(grouped.audio).toHaveLength(1);
        expect(grouped.video).toHaveLength(1);
        expect(visibleIpDetailCommands()).toEqual(["download-package"]);
    });

    it("keeps the explicit child route title when the API returns one child", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/ip-library/components/ip-library-detail.tsx"), "utf8");
        expect(source).toContain("{subIpId ? selected.title : detail.title}");
    });
});

function item(kind: string, category: string) {
    return { id: `${kind}-${category}`, subIpId: "child-one", kind, category, title: kind, summary: "", sortOrder: 0, createdAt: "2026-09-07T00:00:00.000Z" };
}
