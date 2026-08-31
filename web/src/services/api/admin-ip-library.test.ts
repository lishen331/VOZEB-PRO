import { afterEach, describe, expect, it, vi } from "vitest";

import { adminIpLibraryApi, isConfirmedAdminIpLibraryFailure } from "./admin-ip-library";

describe("admin IP library API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("serializes management filters and uses typed version actions", async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 12 }, msg: "ok" }), { status: 200, headers: { "content-type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await adminIpLibraryApi.list({ page: 2, pageSize: 12, keyword: "星海", visibility: "school" });
        expect(fetchMock.mock.calls[0][0]).toContain("keyword=%E6%98%9F%E6%B5%B7");
        await adminIpLibraryApi.publishVersion("ip-a", "version-a");
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "publish", versionId: "version-a" });
    });

    it("creates and updates school grants through scoped paths", async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { id: "grant-a" }, msg: "ok" }), { status: 200, headers: { "content-type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await adminIpLibraryApi.createGrant("ip-a", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z" });
        await adminIpLibraryApi.updateGrant("ip-a", "grant-a", { status: "revoked" });
        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/admin/ip-library/ip-a/schools", "/api/admin/ip-library/ip-a/schools/grant-a"]);
    });

    it("distinguishes confirmed API rejection from an unknown response outcome", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(new Response(JSON.stringify({ code: 400, msg: "slug 已存在" }), { status: 400 }))
                .mockRejectedValueOnce(new Error("网络中断")),
        );

        const confirmed = await adminIpLibraryApi.create({ title: "测试", slug: "test", visibility: "public", authorizationMode: "multi_school" }).catch((error) => error);
        const unknown = await adminIpLibraryApi.create({ title: "测试", slug: "test-2", visibility: "public", authorizationMode: "multi_school" }).catch((error) => error);

        expect(isConfirmedAdminIpLibraryFailure(confirmed)).toBe(true);
        expect(isConfirmedAdminIpLibraryFailure(unknown)).toBe(false);
    });
});
