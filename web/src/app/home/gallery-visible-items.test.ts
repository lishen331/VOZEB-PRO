import { describe, expect, it } from "vitest";

import { filterVisibleGalleryItems, publicGalleryEmptyState } from "./gallery-visible-items";

describe("public gallery visible media", () => {
    it("omits only entries whose real media request has failed", () => {
        const items = [{ slug: "ok" }, { slug: "bad" }, { slug: "ok-2" }];
        expect(filterVisibleGalleryItems(items, new Set(["bad"]))).toEqual([{ slug: "ok" }, { slug: "ok-2" }]);
    });

    it("explains empty video and short-drama categories instead of implying media failure", () => {
        expect(publicGalleryEmptyState("视频", "")).toEqual({ title: "视频分类暂无可展示作品", description: "目前没有该分类的已公开作品，切换到其他分类继续浏览。" });
        expect(publicGalleryEmptyState("短剧", "").title).toBe("短剧分类暂无可展示作品");
    });
});
