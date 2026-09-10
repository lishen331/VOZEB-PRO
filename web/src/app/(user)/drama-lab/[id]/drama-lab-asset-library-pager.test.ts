import { describe, expect, it, vi } from "vitest";
import type { ImageAsset } from "@/lib/library-asset-contract";
import type { LibraryAssetPage } from "@/services/api/library-assets";
import { createAssetLibraryPager } from "./drama-lab-asset-library-pager";
function asset(id: string): ImageAsset {
    return { id, kind: "image", title: id, coverUrl: "", tags: [], createdAt: "", updatedAt: "", data: { dataUrl: "/image.webp", width: 1, height: 1, bytes: 1, mimeType: "image/webp" } };
}
function page(ids: string[], number = 1, total = ids.length): LibraryAssetPage {
    return { assets: ids.map(asset), page: number, pageSize: 100, total };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
describe("asset library paging", () => {
    it("loads beyond 100 items and deduplicates overlapping pages", async () => {
        const load = vi
            .fn()
            .mockResolvedValueOnce(
                page(
                    Array.from({ length: 100 }, (_, i) => String(i)),
                    1,
                    120,
                ),
            )
            .mockResolvedValueOnce(page(["99", ...Array.from({ length: 20 }, (_, i) => String(i + 100))], 2, 120));
        const pager = createAssetLibraryPager(load);
        await pager.reset("characters", "");
        await pager.loadMore();
        expect(pager.getSnapshot().assets).toHaveLength(120);
        expect(pager.getSnapshot().hasMore).toBe(false);
        expect(load.mock.calls[1][0]).toMatchObject({ page: 2, kind: "image", dramaAssetType: "character" });
    });
    it("searches remotely and ignores an older search finishing last", async () => {
        const older = deferred<LibraryAssetPage>();
        const load = vi
            .fn()
            .mockReturnValueOnce(older.promise)
            .mockResolvedValueOnce(page(["new"]));
        const pager = createAssetLibraryPager(load);
        const first = pager.reset("characters", "old");
        await pager.reset("characters", " new ");
        older.resolve(page(["old"]));
        await first;
        expect(pager.getSnapshot().assets.map((item) => item.id)).toEqual(["new"]);
        expect(load.mock.calls[1][0]).toMatchObject({ keyword: "new", page: 1 });
        expect(load.mock.calls[0][1].aborted).toBe(true);
    });
    it("resets kind and ignores both stale results and stale errors", async () => {
        const old = deferred<LibraryAssetPage>();
        const load = vi
            .fn()
            .mockReturnValueOnce(old.promise)
            .mockResolvedValueOnce(page(["scene"]));
        const pager = createAssetLibraryPager(load);
        const pending = pager.reset("props", "");
        await pager.reset("scenes", "");
        old.reject(new Error("old prop request failed"));
        await pending;
        expect(pager.getSnapshot()).toMatchObject({ error: "", loading: false, assets: [asset("scene")] });
        expect(load.mock.calls[1][0]).toMatchObject({ page: 1, dramaAssetType: "scene" });
    });
    it("retains previous pages after failure and retries the failed page", async () => {
        const load = vi
            .fn()
            .mockResolvedValueOnce(page(["first"], 1, 2))
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(page(["second"], 2, 2));
        const pager = createAssetLibraryPager(load);
        await pager.reset("props", "");
        await pager.loadMore();
        expect(pager.getSnapshot()).toMatchObject({ error: "offline", assets: [asset("first")], hasMore: true });
        await pager.loadMore();
        expect(load.mock.calls.slice(1).map((call) => call[0].page)).toEqual([2, 2]);
        expect(pager.getSnapshot()).toMatchObject({ error: "", assets: [asset("first"), asset("second")] });
    });
    it("retries an initial failure and ends on an empty page", async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([]));
        const pager = createAssetLibraryPager(load);
        await pager.reset("characters", "absent");
        await pager.loadMore();
        expect(load.mock.calls.map((call) => call[0].page)).toEqual([1, 1]);
        expect(pager.getSnapshot()).toMatchObject({ assets: [], loading: false, error: "", hasMore: false });
    });
    it("coalesces duplicate loads and discards responses after closing", async () => {
        const pending = deferred<LibraryAssetPage>();
        const load = vi.fn().mockReturnValue(pending.promise);
        const pager = createAssetLibraryPager(load);
        const first = pager.reset("characters", "");
        await pager.loadMore();
        expect(load).toHaveBeenCalledTimes(1);
        pager.dispose();
        pending.resolve(page(["late"]));
        await first;
        expect(pager.getSnapshot().assets).toEqual([]);
    });
});
