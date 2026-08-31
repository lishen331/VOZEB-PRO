import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getConfig: vi.fn(),
    putObjectBytes: vi.fn(),
    getObjectBytes: vi.fn(),
    signObjectRead: vi.fn(),
    deleteObjects: vi.fn(),
    createImagePreviewUrl: vi.fn(),
}));

vi.mock("@/lib/server/object-storage-config", () => ({
    getObjectStorageRuntimeConfig: mocks.getConfig,
    assertObjectStorageConfigured: vi.fn(),
}));
vi.mock("@/lib/server/object-storage-client", () => ({
    putObjectBytes: mocks.putObjectBytes,
    getObjectBytes: mocks.getObjectBytes,
    signObjectRead: mocks.signObjectRead,
    deleteObjects: mocks.deleteObjects,
}));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalStorageImagePreviewUrl: mocks.createImagePreviewUrl }));

import { deleteStoredIpContentFile, readIpContentFile, writeIpContentFile } from "./ip-library-file-storage";

describe("IP library source file storage", () => {
    let dataDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        dataDir = await mkdtemp(join(tmpdir(), "vozeb-ip-files-"));
        process.env.VOZEB_PRO_DATA_DIR = dataDir;
        mocks.getConfig.mockResolvedValue({ enabled: false, prefix: "vozeb-pro", id: "default" });
    });

    afterEach(async () => {
        delete process.env.VOZEB_PRO_DATA_DIR;
        await rm(dataDir, { recursive: true, force: true });
    });

    it("stores strict UTF-8 text and exposes extracted text", async () => {
        const record = await writeIpContentFile({ ipId: "ip-one", fileId: "file-text", kind: "text", originalName: "设定.md", bytes: Buffer.from("# 世界观\n星海", "utf8"), uploadedByUserId: "admin-one" });
        expect(record).toMatchObject({ kind: "text", extension: ".md", mimeType: "text/markdown; charset=utf-8", extractedText: "# 世界观\n星海", storageProvider: "local", status: "ready" });
        expect(await readFile(join(dataDir, "ip-library-files", record.storageKey), "utf8")).toBe("# 世界观\n星海");

        await expect(writeIpContentFile({ ipId: "ip-one", fileId: "bad-text", kind: "text", originalName: "坏编码.txt", bytes: Buffer.from([0xc3, 0x28]), uploadedByUserId: "admin-one" })).rejects.toMatchObject({ status: 415 });
    });

    it("detects real image bytes, rejects extension mismatches and extracts dimensions", async () => {
        const png = await sharp({ create: { width: 37, height: 23, channels: 3, background: "#336699" } }).png().toBuffer();
        const record = await writeIpContentFile({ ipId: "ip-one", fileId: "file-image", kind: "image", originalName: "角色.png", bytes: png, uploadedByUserId: "admin-one" });
        expect(record).toMatchObject({ kind: "image", extension: ".png", mimeType: "image/png", byteSize: png.length, metadata: { width: 37, height: 23 }, status: "ready" });

        await expect(writeIpContentFile({ ipId: "ip-one", fileId: "fake-image", kind: "image", originalName: "伪装.png", bytes: Buffer.from("not an image"), uploadedByUserId: "admin-one" })).rejects.toMatchObject({ status: 415 });
        await expect(writeIpContentFile({ ipId: "ip-one", fileId: "wrong-extension", kind: "image", originalName: "角色.jpg", bytes: png, uploadedByUserId: "admin-one" })).rejects.toMatchObject({ status: 415 });
    });

    it("serves and removes local files only through the independent record", async () => {
        const record = await writeIpContentFile({ ipId: "ip-one", fileId: "file-text", kind: "text", originalName: "story.txt", bytes: Buffer.from("正文"), uploadedByUserId: "admin-one" });
        const response = await readIpContentFile(new Request("http://localhost/file?download=original"), record);
        expect(response?.status).toBe(200);
        expect(response?.headers.get("content-disposition")).toContain("attachment");
        expect(await response?.text()).toBe("正文");
        await deleteStoredIpContentFile(record);
        await expect(readFile(join(dataDir, "ip-library-files", record.storageKey))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("uses a separate object prefix and controlled signed reads when object storage is enabled", async () => {
        mocks.getConfig.mockResolvedValue({ enabled: true, prefix: "tenant-data", id: "default", bucket: "bucket", accessKeyId: "key", secretAccessKey: "secret" });
        mocks.signObjectRead.mockResolvedValue("https://storage.example/signed");
        const record = await writeIpContentFile({ ipId: "ip-one", fileId: "file-text", kind: "text", originalName: "story.txt", bytes: Buffer.from("正文"), uploadedByUserId: "admin-one" });
        expect(record).toMatchObject({ storageProvider: "object", externalStorageId: "default", externalObjectKey: "tenant-data/ip-library/ip-one/file-text/original.txt" });
        expect(mocks.putObjectBytes).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: "tenant-data/ip-library/ip-one/file-text/original.txt" }));
        const response = await readIpContentFile(new Request("http://localhost/file"), record);
        expect(response).toMatchObject({ status: 302 });
        expect(response?.headers.get("location")).toBe("https://storage.example/signed");
        await deleteStoredIpContentFile(record);
        expect(mocks.deleteObjects).toHaveBeenCalledWith(expect.anything(), ["tenant-data/ip-library/ip-one/file-text/original.txt"]);
    });
});
