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

    it("previews an invitation with GET and only joins after POST confirmation", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { school: { id: "school-a", name: "甲学校" }, role: "student" }, msg: "ok" }), { status: 200 }));

        await expect(schoolApi.previewInvite("SCHOOL CODE")).resolves.toMatchObject({ school: { name: "甲学校" }, role: "student" });
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/invitations/join?code=SCHOOL+CODE", expect.objectContaining({ cache: "no-store" }));

        await schoolApi.joinByInvite("SCHOOL CODE");
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/invitations/join", expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "SCHOOL CODE" }) }));
    });

    it("uses bounded server-side class search for offering candidates", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "ok" }), { status: 200 }));

        await schoolApi.listClasses({ page: 1, pageSize: 20, keyword: "视觉", status: "active" });

        expect(fetchMock).toHaveBeenCalledWith("/api/school/classes?page=1&pageSize=20&keyword=%E8%A7%86%E8%A7%89&status=active", expect.objectContaining({ cache: "no-store" }));
    });
});
