import { afterEach, describe, expect, it, vi } from "vitest";

import { adminEducationApi } from "./admin-education";

describe("admin education member API", () => {
    afterEach(() => vi.restoreAllMocks());

    it("serializes scoped member filters and uses no-store", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
        await adminEducationApi.listSchoolMembers("school/a", { page: 2, pageSize: 10, keyword: "1001", role: "student", status: "disabled" });
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/schools/school%2Fa/members?page=2&pageSize=10&keyword=1001&role=student&status=disabled", { cache: "no-store" });
    });

    it("posts the adjustment envelope and surfaces Chinese errors", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { adjustment: { recordId: "record-a" } }, msg: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
        await adminEducationApi.adjustSchoolMemberPoints("school-a", "membership/a", { operation: "debit", amount: 2.25, reason: "修正", idempotencyKey: "key-a" });
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/schools/school-a/members/membership%2Fa/points-adjustments", { cache: "no-store", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "debit", amount: 2.25, reason: "修正", idempotencyKey: "key-a" }) });
        vi.restoreAllMocks();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 409, data: null, msg: "个人永久积分不足" }), { status: 409, headers: { "Content-Type": "application/json" } }));
        await expect(adminEducationApi.adjustSchoolMemberPoints("school-a", "membership-a", { operation: "debit", amount: 99, reason: "修正", idempotencyKey: "key-b" })).rejects.toThrow("个人永久积分不足");
    });
});
