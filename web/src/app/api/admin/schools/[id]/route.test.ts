import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getSchoolByAdmin: vi.fn(), updateSchoolByAdmin: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-tenant-service", () => ({ getSchoolByAdmin: mocks.getSchoolByAdmin, updateSchoolByAdmin: mocks.updateSchoolByAdmin }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));

import { GET, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "school-b" }) };

describe("admin school detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
    });

    it("maps missing schools without exposing internal details", async () => {
        mocks.getSchoolByAdmin.mockRejectedValue(Object.assign(new Error("学校不存在"), { status: 404 }));
        const response = await GET(new Request("http://localhost/api/admin/schools/school-b"), context);
        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ code: 404, data: null, msg: "学校不存在" });
    });

    it("updates through the current administrator and audits fields only", async () => {
        mocks.updateSchoolByAdmin.mockResolvedValue({ id: "school-b", name: "乙学校", status: "disabled" });
        const response = await PATCH(new Request("http://localhost/api/admin/schools/school-b", { method: "PATCH", body: JSON.stringify({ status: "disabled" }) }), context);
        expect(mocks.updateSchoolByAdmin).toHaveBeenCalledWith("admin-a", "school-b", { status: "disabled" });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.school.update", metadata: { fields: ["status"] } }));
        expect(response.status).toBe(200);
    });
});
