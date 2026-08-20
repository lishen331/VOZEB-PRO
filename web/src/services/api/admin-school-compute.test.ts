import { afterEach, describe, expect, it, vi } from "vitest";

import { adminSchoolComputeApi } from "./admin-school-compute";

describe("adminSchoolComputeApi", () => {
    afterEach(() => vi.restoreAllMocks());

    it("serializes list filters and unwraps the standard response", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "ok" }), { status: 200 }));
        await adminSchoolComputeApi.listPools({ page: 2, pageSize: 10, keyword: "学校", status: "active" });
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/admin/school-compute?"), expect.objectContaining({ cache: "no-store" }));
        expect(fetchMock.mock.calls[0][0]).toContain("page=2");
        expect(fetchMock.mock.calls[0][0]).toContain("status=active");
    });

    it("sends credit and status requests", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { schoolId: "school-a" }, msg: "ok" }), { status: 200 }));
        await adminSchoolComputeApi.credit("school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" });
        await adminSchoolComputeApi.setStatus("school-a", "frozen");
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" });
        expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PATCH" });
    });
});
