import { readFile, stat } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteUserLocalMediaAssets: vi.fn(),
    deleteLocalMediaAssetsByStorageKeys: vi.fn(),
    writePersistentAttachmentFile: vi.fn(),
}));

vi.mock("@/lib/server/local-media-storage", () => ({ deleteUserLocalMediaAssets: mocks.deleteUserLocalMediaAssets, deleteLocalMediaAssetsByStorageKeys: mocks.deleteLocalMediaAssetsByStorageKeys }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentAttachmentFile: mocks.writePersistentAttachmentFile }));

import { cleanupDeletedCourseMaterials, deleteCourseAttachments, storeCourseAttachment } from "./course-attachment-service";

describe("course attachment service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.writePersistentAttachmentFile.mockImplementation(async (sourcePath: string, fileName: string, mimeType: string) => ({
            token: `permanent/2026/08/25/attachments/file.${fileName.split(".").at(-1)}`,
            bytes: (await stat(sourcePath)).size,
            mimeType,
            storage: "local",
        }));
    });

    it.each([
        ["lesson.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        ["slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        ["shots.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        ["frame.png", "image/png"],
        ["photo.jpg", "image/jpeg"],
        ["photo.jpeg", "image/jpeg"],
        ["reference.webp", "image/webp"],
        ["preview.mp4", "video/mp4"],
        ["source.mov", "video/quicktime"],
        ["course.ZIP", "application/zip"],
    ])("streams %s and maps its standard MIME type", async (fileName, mimeType) => {
        const bytes = new TextEncoder().encode("course-file");
        mocks.writePersistentAttachmentFile.mockImplementationOnce(async (sourcePath: string, storedName: string, storedMimeType: string) => {
            expect(new Uint8Array(await readFile(sourcePath))).toEqual(bytes);
            expect(storedName).toBe(fileName);
            expect(storedMimeType).toBe(mimeType);
            return { token: `permanent/2026/08/25/attachments/file.${fileName.split(".").at(-1)?.toLowerCase()}`, bytes: bytes.length, mimeType, storage: "local" };
        });

        await expect(
            storeCourseAttachment({
                ownerUserId: "admin-one",
                fileName,
                declaredMimeType: "",
                body: new Blob([bytes]).stream(),
                contentLength: bytes.length,
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                title: fileName,
                fileName,
                mimeType,
                bytes: bytes.length,
                storageKey: expect.stringContaining("/attachments/"),
                url: expect.stringContaining("/api/reference-assets/"),
            }),
        );
    });

    it("rejects unsupported and empty files before persistence", async () => {
        await expect(storeCourseAttachment({ ownerUserId: "admin-one", fileName: "notes.txt", declaredMimeType: "text/plain", body: new Blob(["notes"]).stream(), contentLength: 5 })).rejects.toMatchObject({ status: 400 });
        await expect(storeCourseAttachment({ ownerUserId: "admin-one", fileName: "notes.zip", declaredMimeType: "image/png", body: new Blob(["notes"]).stream(), contentLength: 5 })).rejects.toMatchObject({ status: 400 });
        await expect(storeCourseAttachment({ ownerUserId: "admin-one", fileName: "empty.zip", declaredMimeType: "application/zip", body: new Blob([]).stream(), contentLength: 0 })).rejects.toMatchObject({ status: 400 });
        expect(mocks.writePersistentAttachmentFile).not.toHaveBeenCalled();
    });

    it("removes its temporary file when permanent persistence fails", async () => {
        let temporaryPath = "";
        mocks.writePersistentAttachmentFile.mockImplementationOnce(async (sourcePath: string) => {
            temporaryPath = sourcePath;
            throw new Error("storage unavailable");
        });

        await expect(storeCourseAttachment({ ownerUserId: "admin-one", fileName: "course.zip", declaredMimeType: "application/zip", body: new Blob(["zip"]).stream(), contentLength: 3 })).rejects.toThrow("storage unavailable");
        await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("deletes only the current administrator's unreferenced attachment keys", async () => {
        mocks.deleteUserLocalMediaAssets.mockResolvedValue({ deletedFiles: 1, deletedBytes: 3, blocked: [] });

        await expect(deleteCourseAttachments("admin-one", [" permanent/file.zip ", "permanent/file.zip"])).resolves.toEqual({ deletedFiles: 1, deletedBytes: 3, blocked: [] });
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("admin-one", ["permanent/file.zip"]);
    });

    it("cleans only unreferenced course files after commit", async () => {
        mocks.deleteLocalMediaAssetsByStorageKeys.mockResolvedValue({ deletedFiles: 1, deletedBytes: 3, blocked: [{ storageKey: "permanent/shared.zip" }] });
        await expect(cleanupDeletedCourseMaterials(["permanent/file.zip", "permanent/file.zip", "permanent/shared.zip"])).resolves.toEqual({ deletedFiles: 1, deletedBytes: 3, skippedShared: 1, failed: ["permanent/shared.zip"] });
        expect(mocks.deleteLocalMediaAssetsByStorageKeys).toHaveBeenCalledWith(["permanent/file.zip", "permanent/shared.zip"], "reference");
    });
});
