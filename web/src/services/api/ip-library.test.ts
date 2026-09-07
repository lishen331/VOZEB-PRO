import { afterEach, describe, expect, it, vi } from "vitest";

import { fileNameFromDisposition, ipLibraryApi } from "./ip-library";

describe("IP library API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("serializes list filters and a selected child download", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 12 }, msg: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }))
            .mockResolvedValueOnce(new Response("zip", { status: 200, headers: { "Content-Type": "application/zip" } }));
        vi.stubGlobal("fetch", fetchMock);
        await ipLibraryApi.list({ scope: "school", page: 2, pageSize: 12, keyword: "星海", tags: ["教学"] });
        await ipLibraryApi.download("ip-one", { subIpId: "child-one", package: true });
        expect(fetchMock.mock.calls[0][0]).toContain("scope=school");
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ subIpId: "child-one", package: true });
    });

    it("decodes a server file name", () => expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E6%98%9F%2F%E6%B5%B7.zip")).toBe("星-海.zip"));
});
