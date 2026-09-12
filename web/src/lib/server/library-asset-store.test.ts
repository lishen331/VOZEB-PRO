import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset } from "@/lib/library-asset-contract";

const mocks = vi.hoisted(() => ({ files: new Map<string, unknown>(), provider: "file" as "file" | "postgres", postgresQuery: vi.fn() }));

vi.mock("@/lib/server/database", () => ({ ensurePostgresSchema: vi.fn(), getDatabaseProvider: vi.fn(() => mocks.provider), postgresQuery: mocks.postgresQuery }));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
}));

import { createLibraryAsset, deleteLibraryAsset, getLibraryAsset, getLibraryAssetById, hasLibraryAssetMediaReference, listLibraryAssetPage, listLibraryAssets, updateLibraryAsset } from "./library-asset-store";

describe("library asset file provider", () => {
    beforeEach(() => {
        mocks.files.clear();
        mocks.provider = "file";
        mocks.postgresQuery.mockReset();
    });

    it("keeps server-backed assets isolated by user", async () => {
        await createLibraryAsset("user-one", textAsset("one", "素材一"));
        await createLibraryAsset("user-two", textAsset("two", "素材二"));

        expect(await listLibraryAssets("user-one")).toMatchObject([{ id: "one", title: "素材一" }]);
        expect(await updateLibraryAsset("user-one", textAsset("two", "越权修改"))).toBeNull();
        expect(await deleteLibraryAsset("user-one", "two")).toBe(false);
        expect(await deleteLibraryAsset("user-one", "one")).toBe(true);
        expect(await listLibraryAssets("user-two")).toHaveLength(1);
    });

    it("filters and paginates file-provider assets on the server", async () => {
        await createLibraryAsset("user-one", textAsset("one", "品牌脚本", "2026-07-20T00:00:00.000Z"));
        await createLibraryAsset("user-one", textAsset("two", "商品标题", "2026-07-21T00:00:00.000Z"));
        await createLibraryAsset("user-one", textAsset("three", "品牌口号", "2026-07-22T00:00:00.000Z"));

        await expect(listLibraryAssetPage("user-one", { page: 2, pageSize: 1, kind: "text", keyword: "品牌" })).resolves.toMatchObject({
            items: [{ id: "one" }],
            total: 2,
            page: 2,
            pageSize: 1,
        });
        await expect(getLibraryAsset("user-one", "two")).resolves.toMatchObject({ title: "商品标题" });
    });

    it("filters short-drama material libraries without exposing unrelated assets", async () => {
        await createLibraryAsset("user-one", { ...textAsset("character", "角色甲"), tags: ["短剧", "角色"] });
        await createLibraryAsset("user-one", { ...textAsset("scene", "场景甲"), metadata: { dramaAssetType: "scene" } });
        await createLibraryAsset("user-one", textAsset("other", "普通素材"));

        await expect(listLibraryAssetPage("user-one", { page: 1, pageSize: 20, dramaAssetType: "character" })).resolves.toMatchObject({ total: 1, items: [{ id: "character" }] });
        await expect(listLibraryAssetPage("user-one", { page: 1, pageSize: 20, dramaAssetType: "scene" })).resolves.toMatchObject({ total: 1, items: [{ id: "scene" }] });
    });

    it("filters assets by their saved category", async () => {
        await createLibraryAsset("user-one", { ...textAsset("lead", "主角甲"), metadata: { category: "主角" } });
        await createLibraryAsset("user-one", { ...textAsset("support", "配角乙"), metadata: { category: "配角" } });

        await expect(listLibraryAssetPage("user-one", { page: 1, pageSize: 20, category: "主角" })).resolves.toMatchObject({ total: 1, items: [{ id: "lead" }] });
    });
    it("uses one bounded PostgreSQL query for a filtered page", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [{ assets: [textAsset("one", "品牌脚本")], total: "12" }] });

        await expect(listLibraryAssetPage("user-one", { page: 2, pageSize: 5, kind: "text", keyword: "品牌" })).resolves.toMatchObject({ total: 12, items: [{ id: "one" }] });

        expect(mocks.postgresQuery).toHaveBeenCalledTimes(1);
        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("WITH filtered AS");
        expect(statement).toContain("WHERE user_id = $1");
        expect(statement).toContain("ORDER BY updated_at DESC, id ASC");
        expect(statement).toContain("LIMIT $5 OFFSET $6");
        expect(params).toEqual(["user-one", "text", "品牌", "%品牌%", 5, 5, null, null, ""]);
    });

    it("prevents the unbounded asset reader from querying PostgreSQL", async () => {
        mocks.provider = "postgres";

        await expect(listLibraryAssets("user-one")).rejects.toThrow("paginated asset query");
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("resolves a stable asset id only for trusted server-side references", async () => {
        await createLibraryAsset("admin-one", textAsset("ip-source", "审核素材"));
        await expect(getLibraryAssetById("ip-source")).resolves.toMatchObject({ title: "审核素材" });

        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [{ asset_json: textAsset("ip-source", "审核素材") }] });
        await expect(getLibraryAssetById("ip-source")).resolves.toMatchObject({ id: "ip-source" });
        expect(mocks.postgresQuery).toHaveBeenLastCalledWith("SELECT asset_json FROM library_assets WHERE id = $1", ["ip-source"]);
    });

    it("recognizes media referenced by an asset owned by the requesting user", async () => {
        await createLibraryAsset("user-one", { ...textAsset("one", "素材一"), coverUrl: "/api/reference-assets/permanent/shared.png" });
        await createLibraryAsset("user-two", { ...textAsset("two", "素材二"), coverUrl: "/api/reference-assets/permanent/private.png" });

        await expect(hasLibraryAssetMediaReference("user-one", "permanent/shared.png")).resolves.toBe(true);
        await expect(hasLibraryAssetMediaReference("user-one", "permanent/private.png")).resolves.toBe(false);

        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [{ allowed: true }] });
        await expect(hasLibraryAssetMediaReference("user-one", "permanent/shared.png")).resolves.toBe(true);
        expect(mocks.postgresQuery).toHaveBeenLastCalledWith(expect.stringContaining("position($2 in COALESCE(asset_json::text, '')) > 0"), ["user-one", "permanent/shared.png"]);
    });
});

function textAsset(id: string, title: string, now = new Date().toISOString()): Asset {
    return { id, kind: "text", title, coverUrl: "", tags: [], data: { content: title }, createdAt: now, updatedAt: now };
}
