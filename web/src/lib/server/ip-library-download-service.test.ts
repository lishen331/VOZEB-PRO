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

    it("downloads every visible child as one IP package and records IP scope", async () => {
        mocks.requireVisibleIp.mockResolvedValue({
            detail: {
                id: "ip-one",
                title: "星海计划",
                summary: "教学素材",
                subIps: [
                    { id: "child-one", ipId: "ip-one", title: "第一子 IP", summary: "", tags: [], sourceNote: "", items: [item] },
                    { id: "child-two", ipId: "ip-one", title: "第二子 IP", summary: "", tags: [], sourceNote: "", items: [itemTwo] },
                ],
            },
            subIp: { id: "child-one", ipId: "ip-one", title: "第一子 IP", summary: "", tags: [], sourceNote: "", items: [item] },
            schoolId: "school-a",
        });
        mocks.getIpContentFile.mockImplementation(async (_ipId: string, fileId: string) => ({
            id: fileId,
            ipId: "ip-one",
            subIpId: fileId === "file-two" ? "child-two" : "child-one",
            kind: "text",
            status: "ready",
            originalName: `${fileId}.md`,
            extension: ".md",
            mimeType: "text/markdown",
        }));
        mocks.readIpContentFileBytes.mockResolvedValue(Buffer.from("正文"));

        const result = await downloadIpForUser("student-one", new Request("https://example.test/ip-library/ip-one/download"), "ip-one", { package: true, packageScope: "ip" });

        expect(mocks.requireVisibleIp).toHaveBeenCalledWith("student-one", "ip-one", undefined, []);
        const [record] = mocks.recordIpDownload.mock.calls[0];
        expect(record).toMatchObject({ ipId: "ip-one", packageScope: "ip", downloadType: "package", result: "succeeded" });
        expect(record).not.toHaveProperty("subIpId");
        expect(result).toMatchObject({ kind: "file", fileName: "星海计划.zip" });
        if (result.kind !== "file") throw new Error("expected local archive");
        expect(Object.keys(unzipSync(result.bytes))).toEqual(expect.arrayContaining(["第一子 IP.zip", "第二子 IP.zip", "manifest.json", "README.md"]));
    });
});

const itemTwo = { ...item, id: "item-two", subIpId: "child-two", fileId: "file-two", title: "第二故事梗概" };
