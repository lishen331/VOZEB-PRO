import { beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";

const mocks = vi.hoisted(() => ({
    requireVisibleIp: vi.fn(),
    createIpUsageForUser: vi.fn(),
    getLibraryAssetById: vi.fn(),
    getLocalMediaRegistration: vi.fn(),
    createExternalMediaReadUrl: vi.fn(),
    getObjectStorageRuntimeConfig: vi.fn(),
    getObjectBytes: vi.fn(),
}));

vi.mock("./ip-library-access-service", () => ({ requireVisibleIp: mocks.requireVisibleIp }));
vi.mock("./ip-library-service", () => ({ createIpUsageForUser: mocks.createIpUsageForUser }));
vi.mock("@/lib/server/library-asset-store", () => ({ getLibraryAssetById: mocks.getLibraryAssetById }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.getLocalMediaRegistration }));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalMediaReadUrl: mocks.createExternalMediaReadUrl }));
vi.mock("@/lib/server/object-storage-config", () => ({ getObjectStorageRuntimeConfig: mocks.getObjectStorageRuntimeConfig, assertObjectStorageConfigured: vi.fn() }));
vi.mock("@/lib/server/object-storage-client", () => ({ getObjectBytes: mocks.getObjectBytes }));
vi.mock("@/lib/server/data-dir", () => ({ resolveServerDataPath: (name: string) => `C:/missing/${name}` }));

import { downloadIpForUser } from "./ip-library-download-service";

const baseDetail = {
    id: "ip-one",
    title: "星海计划",
    summary: "IP 简介",
    version: {
        id: "version-one",
        versionNumber: 2,
        title: "星海计划第二版",
        summary: "版本简介",
        items: [
            { id: "text-one", versionId: "version-one", kind: "text" as const, category: "story_summary" as const, title: "故事梗概", summary: "摘要", textContent: "银河边缘的故事", sortOrder: 0, createdAt: "2026-08-19T00:00:00.000Z" },
            { id: "image-one", versionId: "version-one", kind: "image" as const, category: "character" as const, title: "主角", summary: "角色图", assetId: "asset-one", sortOrder: 1, createdAt: "2026-08-19T00:00:00.000Z" },
        ],
    },
};

describe("IP library downloads", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireVisibleIp.mockResolvedValue({ userId: "user-one", schoolId: "school-a", detail: structuredClone(baseDetail) });
        mocks.createIpUsageForUser.mockImplementation(async (_userId: string, input: unknown) => input);
        mocks.getLibraryAssetById.mockResolvedValue({
            id: "asset-one",
            kind: "image",
            title: "主角",
            coverUrl: "",
            tags: [],
            data: { dataUrl: "data:image/png;base64,aW1hZ2U=" },
            createdAt: "2026-08-19T00:00:00.000Z",
            updatedAt: "2026-08-19T00:00:00.000Z",
        });
        mocks.getLocalMediaRegistration.mockResolvedValue(null);
    });

    it("downloads one text item only after visible-version authorization", async () => {
        const result = await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: false, versionId: "version-one", itemIds: ["text-one"] });

        expect(result).toMatchObject({ kind: "file", mimeType: "text/markdown; charset=utf-8", fileName: "故事梗概.md" });
        expect(Buffer.from((result as { bytes: Buffer }).bytes).toString("utf8")).toBe("银河边缘的故事");
        expect(mocks.requireVisibleIp).toHaveBeenCalledWith("user-one", "ip-one", "version-one", ["text-one"]);
        expect(mocks.createIpUsageForUser).toHaveBeenCalledWith("user-one", expect.objectContaining({ action: "download_item", itemIds: ["text-one"], targetType: "download" }));
    });

    it("creates a complete zip with manifest and attribution without storage keys", async () => {
        const result = await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: true });
        expect(result).toMatchObject({ kind: "file", mimeType: "application/zip", fileName: "星海计划-v2.zip" });
        const entries = unzipSync(new Uint8Array((result as { bytes: Buffer }).bytes));
        expect(Object.keys(entries)).toEqual(expect.arrayContaining(["README.md", "manifest.json", "text/story-summary/故事梗概.md", "images/character/主角.png"]));
        const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
        expect(manifest).toMatchObject({ ipId: "ip-one", versionNumber: 2, source: expect.any(String), attribution: expect.any(String) });
        expect(JSON.stringify(manifest)).not.toContain("storageKey");
        expect(mocks.createIpUsageForUser).toHaveBeenCalledWith("user-one", expect.objectContaining({ action: "download_package", itemIds: ["text-one", "image-one"] }));
    });

    it("returns a short-lived object-storage redirect for one media item", async () => {
        mocks.getLibraryAssetById.mockResolvedValue({
            id: "asset-one",
            kind: "image",
            title: "主角",
            coverUrl: "",
            tags: [],
            data: { storageKey: "permanent/2026/08/19/images/hero.png" },
            createdAt: "2026-08-19T00:00:00.000Z",
            updatedAt: "2026-08-19T00:00:00.000Z",
        });
        mocks.getLocalMediaRegistration.mockResolvedValue({
            storageKey: "permanent/2026/08/19/images/hero.png",
            scope: "reference",
            storageClass: "permanent",
            type: "image",
            ownerUserId: "admin-one",
            source: "ip",
            mimeType: "image/png",
            bytes: 4,
            storageProvider: "object",
            externalObjectKey: "objects/hero.png",
            createdAt: "2026-08-19T00:00:00.000Z",
        });
        mocks.createExternalMediaReadUrl.mockResolvedValue("https://objects.example/signed");

        const result = await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: false, itemIds: ["image-one"] });

        expect(result).toMatchObject({ kind: "redirect", url: "https://objects.example/signed" });
        expect(mocks.createExternalMediaReadUrl.mock.calls[0][0].url).toContain("download=original");
        expect(JSON.stringify(mocks.createIpUsageForUser.mock.calls[0][1])).not.toContain("signed");
    });

    it("does not record a usage when access rejects a cross-school IP", async () => {
        mocks.requireVisibleIp.mockRejectedValue(Object.assign(new Error("IP 不存在或无权访问"), { status: 404 }));
        await expect(downloadIpForUser("user-two", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: true })).rejects.toMatchObject({ status: 404 });
        expect(mocks.createIpUsageForUser).not.toHaveBeenCalled();
    });

    it("records every explicit download with a fresh target identity", async () => {
        await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: false, itemIds: ["text-one"] });
        await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: false, itemIds: ["text-one"] });
        const ids = mocks.createIpUsageForUser.mock.calls.map((call) => call[1].targetId);
        expect(ids).toHaveLength(2);
        expect(ids[0]).not.toBe(ids[1]);
    });
});
