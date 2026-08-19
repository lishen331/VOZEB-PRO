import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listSchoolsByAdmin: vi.fn(), createSchoolByAdmin: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-tenant-service", () => ({ listSchoolsByAdmin: mocks.listSchoolsByAdmin, createSchoolByAdmin: mocks.createSchoolByAdmin }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

describe("admin schools route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        mocks.listSchoolsByAdmin.mockResolvedValue({ items: [{ id: "school-a", name: "甲学校" }], total: 1, page: 2, pageSize: 10 });
        mocks.createSchoolByAdmin.mockResolvedValue({ id: "school-a", name: "甲学校" });
    });

    it("returns the shared envelope and passes pagination filters", async () => {
        const response = await GET(new Request("http://localhost/api/admin/schools?page=2&pageSize=10&keyword=%E7%94%B2&status=active"));

        expect(response.status).toBe(200);
        expect(mocks.listSchoolsByAdmin).toHaveBeenCalledWith("admin-a", { page: 2, pageSize: 10, keyword: "甲", status: "active" });
        await expect(response.json()).resolves.toEqual({ code: 0, data: { items: [{ id: "school-a", name: "甲学校" }], total: 1, page: 2, pageSize: 10 }, msg: "ok" });
    });

    it("requires login and the education duty", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        expect((await GET(new Request("http://localhost/api/admin/schools"))).status).toBe(401);

        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        expect((await GET(new Request("http://localhost/api/admin/schools"))).status).toBe(403);
        expect(mocks.listSchoolsByAdmin).not.toHaveBeenCalled();
    });

    it("creates a school and records a redacted audit event", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/schools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "甲学校", administrator: { username: "teacher_a", password: "secret-password" } }) }),
        );

        expect(response.status).toBe(200);
        expect(mocks.createSchoolByAdmin).toHaveBeenCalledWith("admin-a", expect.objectContaining({ name: "甲学校" }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.school.create", metadata: expect.not.objectContaining({ password: expect.anything() }) }));
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { id: "school-a" }, msg: "ok" });
    });

    it("does not persist raw failure messages in audit metadata", async () => {
        mocks.createSchoolByAdmin.mockRejectedValue(new Error("password=secret-password"));
        const response = await POST(
            new Request("http://localhost/api/admin/schools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "甲学校", administrator: { username: "teacher_a", password: "secret-password" } }) }),
        );

        expect(response.status).toBe(500);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ status: "failure", metadata: { errorStatus: 500 } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("password=secret-password");
    });
});
