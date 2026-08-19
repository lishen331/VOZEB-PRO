import { afterEach, describe, expect, it, vi } from "vitest";

import { fileNameFromDisposition, ipLibraryApi } from "./ip-library";

describe("IP library API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("serializes list filters and reads the shared response envelope", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 12 }, msg: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(ipLibraryApi.list({ scope: "school", page: 2, pageSize: 12, keyword: "星海", kind: "image", category: "character" })).resolves.toMatchObject({ total: 0, page: 2 });
        expect(fetchMock.mock.calls[0][0]).toContain("scope=school");
        expect(fetchMock.mock.calls[0][0]).toContain("keyword=%E6%98%9F%E6%B5%B7");
    });

    it("returns a server-generated package blob and decoded file name", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("zip", { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=download; filename*=UTF-8''%E6%98%9F%E6%B5%B7-v2.zip" } })));
        const result = await ipLibraryApi.download("ip-one", { versionId: "version-two", package: true });
        expect(result).toMatchObject({ fileName: "星海-v2.zip", blob: expect.any(Blob) });
    });

    it("returns a short-lived URL without storing it in client state", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { url: "https://objects.example/signed", fileName: "角色.png" }, msg: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } })));
        await expect(ipLibraryApi.download("ip-one", { itemIds: ["item-one"], package: false })).resolves.toEqual({ url: "https://objects.example/signed", fileName: "角色.png" });
    });

    it("surfaces API error messages", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 404, data: null, msg: "IP 不存在或无权访问" }), { status: 404, headers: { "Content-Type": "application/json" } })));
        await expect(ipLibraryApi.get("other-school-ip")).rejects.toThrow("IP 不存在或无权访问");
    });

    it("sanitizes download file names", () => {
        expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E6%98%9F%2F%E6%B5%B7.zip")).toBe("星-海.zip");
    });
});
