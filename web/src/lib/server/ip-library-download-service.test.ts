import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { downloadIpForUser } from "./ip-library-download-service";

const item = { id: "item-one", subIpId: "child-one", kind: "text" as const, category: "story_summary" as const, title: "故事梗概", summary: "", fileId: "file-one", sortOrder: 0, createdAt: "2026-09-07T00:00:00.000Z" };

describe("IP library download service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireVisibleIp.mockResolvedValue({ detail: { id: "ip-one", title: "星海计划" }, subIp: { id: "child-one", ipId: "ip-one", title: "第一子 IP", summary: "", tags: [], sourceNote: "", items: [item] }, schoolId: "school-a" });
        mocks.getIpContentFile.mockResolvedValue({ id: "file-one", ipId: "ip-one", subIpId: "child-one", kind: "text", status: "ready", originalName: "故事.md" });
        mocks.readIpContentFile.mockResolvedValue(new Response("故事正文", { headers: { "content-type": "text/markdown" } }));
        mocks.recordIpDownload.mockResolvedValue(undefined);
    });

    it("downloads one item from the selected child and records that child", async () => {
        const result = await downloadIpForUser("student-one", new Request("https://example.test/ip-library/ip-one/download"), "ip-one", { subIpId: "child-one", itemIds: ["item-one"], package: false });

        expect(mocks.requireVisibleIp).toHaveBeenCalledWith("student-one", "ip-one", "child-one", ["item-one"]);
        expect(mocks.getIpContentFile).toHaveBeenCalledWith("ip-one", "file-one", "child-one");
        expect(mocks.recordIpDownload).toHaveBeenCalledWith(expect.objectContaining({ ipId: "ip-one", subIpId: "child-one", itemId: "item-one", schoolId: "school-a", downloadType: "item", result: "succeeded" }));
        expect(result).toMatchObject({ kind: "response", fileName: "故事.md" });
    });

    it("does not allow a single-item request without exactly one child item", async () => {
        await expect(downloadIpForUser("student-one", new Request("https://example.test/ip-library/ip-one/download"), "ip-one", { subIpId: "child-one", itemIds: [], package: false })).rejects.toMatchObject({ status: 400 });
        expect(mocks.recordIpDownload).not.toHaveBeenCalled();
    });
});
