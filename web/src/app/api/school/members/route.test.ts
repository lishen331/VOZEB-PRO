import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listSchoolMembers: vi.fn(), createSchoolMembers: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-tenant-service", () => ({ listSchoolMembers: mocks.listSchoolMembers }));
vi.mock("@/lib/server/school-member-provisioning-service", () => ({ createSchoolMembers: mocks.createSchoolMembers }));

import { GET, POST } from "./route";

describe("school members route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.listSchoolMembers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.createSchoolMembers.mockResolvedValue([{ id: "member-a", accountId: "0007" }]);
    });

    it("does not accept a school id for authorization and returns a paged envelope", async () => {
        const response = await GET(new Request("http://localhost/api/school/members?schoolId=school-b&page=1&pageSize=20&role=teacher"));
        expect(mocks.listSchoolMembers).toHaveBeenCalledWith("manager-a", { page: 1, pageSize: 20, keyword: "", role: "teacher", status: undefined });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { items: [], total: 0 } });
    });

    it("maps invalid JSON and service errors", async () => {
        const invalid = await POST(new Request("http://localhost/api/school/members", { method: "POST", body: "{" }));
        expect(invalid.status).toBe(400);
        await expect(invalid.json()).resolves.toMatchObject({ code: 400, msg: "请求内容不是有效 JSON" });

        mocks.createSchoolMembers.mockRejectedValue(Object.assign(new Error("当前账号没有学校管理权限"), { status: 403 }));
        const forbidden = await POST(new Request("http://localhost/api/school/members", { method: "POST", body: JSON.stringify({ rows: [{ username: "a" }] }) }));
        expect(forbidden.status).toBe(403);
        await expect(forbidden.json()).resolves.toMatchObject({ code: 403, msg: "当前账号没有学校管理权限" });
    });

    it("rejects non-object JSON before calling the service", async () => {
        const response = await POST(new Request("http://localhost/api/school/members", { method: "POST", body: "null" }));
        expect(response.status).toBe(400);
        expect(mocks.createSchoolMembers).not.toHaveBeenCalled();
    });

    it("creates members through one batch service call", async () => {
        const rows = [{ username: "teacher_a", password: "password123", role: "teacher" }];
        const response = await POST(new Request("http://localhost/api/school/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) }));
        expect(mocks.createSchoolMembers).toHaveBeenCalledOnce();
        expect(mocks.createSchoolMembers).toHaveBeenCalledWith("manager-a", rows);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: [{ accountId: "0007" }] });
    });
});
