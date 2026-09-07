import { describe, expect, it, vi } from "vitest";
import { schoolIpLibraryApi } from "./school-ip-library";

describe("school IP library API", () => {
    it("only reads the platform child-IP grants", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" }), { status: 200 }));
        await schoolIpLibraryApi.list({ page: 2, pageSize: 10 });
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/ip-library?page=2&pageSize=10", expect.objectContaining({ cache: "no-store" }));
        fetchMock.mockRestore();
    });
});
