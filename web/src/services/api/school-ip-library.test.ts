import { beforeEach, describe, expect, it, vi } from "vitest";
import { schoolIpLibraryApi } from "./school-ip-library";

describe("school IP library API", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("lists grants and updates the whole-package member switch", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" }), { status: 200 }));
        await schoolIpLibraryApi.list({ page: 2, pageSize: 10 });
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/ip-library?page=2&pageSize=10", expect.objectContaining({ cache: "no-store" }));
        await schoolIpLibraryApi.updateMemberAccess("grant/a", true);
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/ip-library/grant%2Fa/access", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: true }) }));
    });
});
