import { afterEach, describe, expect, it, vi } from "vitest";

import { adminIpLibraryApi, isConfirmedAdminIpLibraryFailure } from "./admin-ip-library";

describe("admin IP library API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uses child scoped content and grant routes", async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { id: "child-a" }, msg: "ok" }), { status: 200, headers: { "content-type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);
        await adminIpLibraryApi.createSubIp("ip-a", { title: "子 IP" });
        await adminIpLibraryApi.createGrant("ip-a", { subIpId: "child-a", schoolId: "school-a", mode: "exclusive", startsAt: "2026-09-07T00:00:00.000Z" });
        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/admin/ip-library/ip-a/sub-ips", "/api/admin/ip-library/ip-a/schools"]);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ subIpId: "child-a" });
    });

    it("distinguishes confirmed API rejection", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 400, msg: "slug 已存在" }), { status: 400 })));
        const error = await adminIpLibraryApi.create({ title: "测试", slug: "test", visibility: "public" }).catch((value) => value);
        expect(isConfirmedAdminIpLibraryFailure(error)).toBe(true);
    });
});
