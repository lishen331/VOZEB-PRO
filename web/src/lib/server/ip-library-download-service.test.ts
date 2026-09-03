import { beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";

const mocks = vi.hoisted(() => ({
    requireVisibleIp: vi.fn(),
    getIpContentFile: vi.fn(),
    recordIpDownload: vi.fn(),
    readIpContentFile: vi.fn(),
    readIpContentFileBytes: vi.fn(),
}));

vi.mock("./ip-library-access-service", () => ({
    requireVisibleIp: mocks.requireVisibleIp,
    createIpLibraryRepository: () => ({ getIpContentFile: mocks.getIpContentFile, recordIpDownload: mocks.recordIpDownload }),
}));
vi.mock("./ip-library-file-storage", () => ({ readIpContentFile: mocks.readIpContentFile, readIpContentFileBytes: mocks.readIpContentFileBytes }));

import { downloadIpForUser, previewIpMediaForUser } from "./ip-library-download-service";

const files = {
    "file-text": file("file-text", "text", "故事梗概.txt", ".txt", "text/plain; charset=utf-8", "银河边缘的故事"),
    "file-md": file("file-md", "text", "创作说明.md", ".md", "text/markdown; charset=utf-8", "# 创作说明"),
    "file-image": file("file-image", "image", "hero-original.png", ".png", "image/png"),
    "file-cover": file("file-cover", "image", "cover-original.png", ".png", "image/png"),
};

const baseDetail = {
    id: "ip-one",
    title: "星海计划",
    summary: "IP 简介",
    version: {
        id: "version-one",
        versionNumber: 2,
        title: "星海计划第二版",
        summary: "版本简介",
        coverFileId: "file-cover",
        tags: ["科幻", "教学"],
        sourceNote: "平台线下审核",
        changeNote: "新增角色设定",
        items: [item("text-one", "text", "story_summary", "故事梗概", "file-text", 0), item("md-one", "text", "creation_notes", "创作说明", "file-md", 1), item("image-one", "image", "character", "主角", "file-image", 2)],
    },
};

describe("IP library downloads", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireVisibleIp.mockResolvedValue({ userId: "user-one", schoolId: "school-a", detail: structuredClone(baseDetail) });
        mocks.getIpContentFile.mockImplementation(async (_ipId: string, fileId: string) => structuredClone(files[fileId as keyof typeof files] || null));
        mocks.recordIpDownload.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T00:00:00.000Z" }));
        mocks.readIpContentFile.mockImplementation(
            async (_request: Request, record: (typeof files)[keyof typeof files]) =>
                new Response(record.extractedText || "image", { headers: { "Content-Type": record.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}` } }),
        );
        mocks.readIpContentFileBytes.mockImplementation(async (record: (typeof files)[keyof typeof files]) => Buffer.from(record.extractedText || record.id));
    });

    it("downloads TXT and Markdown as their original files and records independent events", async () => {
        const request = new Request("http://localhost/api/ip-library/ip-one/download");
        const txt = await downloadIpForUser("user-one", request, "ip-one", { package: false, versionId: "version-one", itemIds: ["text-one"] });
        const md = await downloadIpForUser("user-one", request, "ip-one", { package: false, versionId: "version-one", itemIds: ["md-one"] });

        expect(txt).toMatchObject({ kind: "response", fileName: "故事梗概.txt" });
        expect(md).toMatchObject({ kind: "response", fileName: "创作说明.md" });
        expect(mocks.requireVisibleIp).toHaveBeenCalledWith("user-one", "ip-one", "version-one", ["text-one"]);
        expect(mocks.recordIpDownload).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: "user-one", schoolId: "school-a", itemId: "text-one", downloadType: "item", result: "succeeded" }));
    });

    it("keeps the uploaded media file name and uses a short-lived object redirect", async () => {
        mocks.readIpContentFile.mockResolvedValue(Response.redirect("https://objects.example/signed", 302));
        const result = await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: false, itemIds: ["image-one"] });
        expect(result).toMatchObject({ kind: "redirect", url: "https://objects.example/signed", fileName: "hero-original.png" });
        expect(mocks.readIpContentFile.mock.calls[0][0].url).toContain("download=original");
        expect(JSON.stringify(mocks.recordIpDownload.mock.calls[0][0])).not.toContain("signed");
    });

    it("creates a complete ZIP with cover, source notes and no storage keys", async () => {
        const result = await downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: true });
        expect(result).toMatchObject({ kind: "file", mimeType: "application/zip", fileName: "星海计划-v2.zip" });
        const entries = unzipSync(new Uint8Array((result as { bytes: Buffer }).bytes));
        expect(Object.keys(entries)).toEqual(expect.arrayContaining(["README.md", "manifest.json", "封面/cover-original.png", "文本/故事梗概.txt", "文本/创作说明.md", "图片/角色/主角.png"]));
        const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
        expect(manifest).toMatchObject({ ipId: "ip-one", versionNumber: 2, sourceNote: "平台线下审核", changeNote: "新增角色设定", tags: ["科幻", "教学"] });
        expect(JSON.stringify(manifest)).not.toContain("storageKey");
        expect(mocks.recordIpDownload).toHaveBeenCalledWith(expect.objectContaining({ downloadType: "package", itemId: undefined, result: "succeeded" }));
    });

    it("fails the whole ZIP and records a failed event when any original is missing", async () => {
        mocks.readIpContentFileBytes.mockImplementation(async (record: (typeof files)[keyof typeof files]) => (record.id === "file-image" ? null : Buffer.from(record.id)));
        await expect(downloadIpForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/download"), "ip-one", { package: true })).rejects.toMatchObject({ status: 404 });
        expect(mocks.recordIpDownload).toHaveBeenCalledWith(expect.objectContaining({ downloadType: "package", result: "failed" }));
    });

    it("rechecks access for every inline preview without recording a download", async () => {
        const request = new Request("http://localhost/api/ip-library/ip-one/items/image-one/media?versionId=version-one");
        const result = await previewIpMediaForUser("user-one", request, "ip-one", { versionId: "version-one", itemId: "image-one" });
        expect(result).toMatchObject({ kind: "response", fileName: "hero-original.png" });
        expect(mocks.requireVisibleIp).toHaveBeenCalledWith("user-one", "ip-one", "version-one", ["image-one"]);
        expect(mocks.recordIpDownload).not.toHaveBeenCalled();

        mocks.requireVisibleIp.mockRejectedValue(Object.assign(new Error("IP 不存在或无权访问"), { status: 404 }));
        await expect(previewIpMediaForUser("user-one", request, "ip-one", { versionId: "version-one", itemId: "image-one" })).rejects.toMatchObject({ status: 404 });
    });

    it("reads the version cover file instead of a personal asset", async () => {
        const result = await previewIpMediaForUser("user-one", new Request("http://localhost/api/ip-library/ip-one/cover"), "ip-one", { cover: true });
        expect(result).toMatchObject({ kind: "response", fileName: "cover-original.png" });
        expect(mocks.getIpContentFile).toHaveBeenCalledWith("ip-one", "file-cover");
    });
});

function file(id: string, kind: "text" | "image", originalName: string, extension: string, mimeType: string, extractedText?: string) {
    return {
        id,
        ipId: "ip-one",
        kind,
        originalName,
        extension,
        mimeType,
        byteSize: 10,
        sha256: `hash-${id}`,
        storageProvider: "local" as const,
        storageKey: `ip-one/${id}/original${extension}`,
        extractedText,
        metadata: {},
        status: "ready" as const,
        createdAt: "2026-08-19T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z",
    };
}

function item(id: string, kind: "text" | "image", category: "story_summary" | "creation_notes" | "character", title: string, fileId: string, sortOrder: number) {
    return { id, versionId: "version-one", kind, category, title, summary: "", fileId, sortOrder, createdAt: "2026-08-19T00:00:00.000Z" };
}
