import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    detect: vi.fn(),
    write: vi.fn(),
    list: vi.fn(),
    registrations: vi.fn(),
    remove: vi.fn(),
}));
vi.mock("file-type", () => ({ fileTypeFromBuffer: mocks.detect }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.write }));
vi.mock("@/lib/server/local-media-registry", () => ({ listLocalMediaRegistrationPage: mocks.list, getLocalMediaRegistrations: mocks.registrations }));
vi.mock("@/lib/server/local-media-storage", () => ({ deleteUserLocalMediaAssets: mocks.remove }));

import { deleteOfficialWorkMedia, listOfficialWorkMedia, uploadOfficialWorkMedia } from "./official-work-media-service";

describe("official work media service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.detect.mockResolvedValue({ mime: "image/png", ext: "png" });
        mocks.write.mockResolvedValue({ token: "permanent/2026/09/08/images/asset.png", mimeType: "image/png", bytes: 4 });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.registrations.mockResolvedValue([]);
        mocks.remove.mockResolvedValue({ deletedFiles: 0, deletedBytes: 0, blocked: [] });
    });

    it("detects the real media type and assigns permanent media to the administrator", async () => {
        const file = new File([new Uint8Array([1, 2, 3, 4])], "cover.png", { type: "image/png" });
        await expect(uploadOfficialWorkMedia("admin-one", file)).resolves.toMatchObject({ mediaType: "image", mimeType: "image/png", originalName: "cover.png", previewUrl: expect.stringContaining("/api/reference-assets/") });
        expect(mocks.write).toHaveBeenCalledWith(
            expect.stringMatching(/^data:image\/png;base64,/),
            "image",
            expect.objectContaining({ ownerUserId: "admin-one", source: "admin-official-work-upload", originalName: "cover.png", maxBytes: 20 * 1024 * 1024 }),
        );
    });

    it("rejects a declared type that differs from the real file type", async () => {
        mocks.detect.mockResolvedValue({ mime: "audio/mpeg", ext: "mp3" });
        const file = new File([new Uint8Array([1, 2, 3, 4])], "fake.png", { type: "image/png" });
        await expect(uploadOfficialWorkMedia("admin-one", file)).rejects.toMatchObject({ status: 415 });
        expect(mocks.write).not.toHaveBeenCalled();
    });

    it("uses the established image, video, and audio byte limits", async () => {
        const cases = [
            ["image/png", "image", 20 * 1024 * 1024],
            ["video/mp4", "video", 200 * 1024 * 1024],
            ["audio/mpeg", "audio", 30 * 1024 * 1024],
        ] as const;
        for (const [mime, type, maxBytes] of cases) {
            mocks.detect.mockResolvedValueOnce({ mime, ext: "bin" });
            mocks.write.mockResolvedValueOnce({ token: `permanent/2026/09/08/${type}/asset`, mimeType: mime, bytes: 4 });
            await uploadOfficialWorkMedia("admin-one", new File([new Uint8Array([1, 2, 3, 4])], `asset-${type}`, { type: mime }));
            expect(mocks.write).toHaveBeenLastCalledWith(expect.any(String), type, expect.objectContaining({ maxBytes }));
        }
    });

    it("queries only the administrator's permanent image, video, or audio registrations", async () => {
        await listOfficialWorkMedia("admin-one", { page: 2, pageSize: 15, type: "audio", keyword: "voice" });
        expect(mocks.list).toHaveBeenCalledWith({ ownerUserIds: ["admin-one"], storageClass: "permanent", type: "audio", search: "voice", page: 2, pageSize: 15 });
    });

    it("deletes only administrator-owned media and preserves referenced assets", async () => {
        mocks.registrations.mockResolvedValue([
            { storageKey: "permanent/own.png", ownerUserId: "admin-one", storageClass: "permanent", source: "admin-official-work-upload" },
            { storageKey: "permanent/other.png", ownerUserId: "admin-two", storageClass: "permanent", source: "admin-official-work-upload" },
        ]);
        mocks.remove.mockResolvedValue({ deletedFiles: 0, deletedBytes: 0, blocked: [{ storageKey: "permanent/own.png", referenceCount: 1 }] });
        const result = await deleteOfficialWorkMedia("admin-one", ["permanent/own.png", "permanent/other.png"]);
        expect(mocks.remove).toHaveBeenCalledWith("admin-one", ["permanent/own.png"]);
        expect(result.blocked).toEqual([expect.objectContaining({ storageKey: "permanent/own.png", referenceCount: 1 })]);
    });
});
