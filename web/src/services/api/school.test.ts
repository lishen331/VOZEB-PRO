import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminEducationApi } from "./admin-education";
import { schoolApi } from "./school";

describe("school API clients", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("serializes list filters and unwraps the shared envelope", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" }), { status: 200 }));
        await expect(adminEducationApi.listSchools({ page: 2, pageSize: 10, keyword: "甲学校", status: "active" })).resolves.toMatchObject({ total: 0, page: 2 });
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/schools?page=2&pageSize=10&keyword=%E7%94%B2%E5%AD%A6%E6%A0%A1&status=active", expect.objectContaining({ cache: "no-store" }));
    });

    it("uses one request for batch import and surfaces server messages", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: [], msg: "ok" }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 409, data: null, msg: "用户名已存在" }), { status: 409 }));
        const rows = [{ username: "student_a", password: "password123", role: "student" as const }];
        await schoolApi.importMembers(rows);
        expect(fetchMock).toHaveBeenCalledWith("/api/school/members/import", expect.objectContaining({ method: "POST", body: JSON.stringify({ rows }) }));
        await expect(schoolApi.getContext()).rejects.toThrow("用户名已存在");
    });
});
