import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/admin-school-member-points-service", () => ({ listSchoolMembersByAdmin: mocks.list }));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "school-a" }) };

describe("admin school members route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: [] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("requires an authenticated active platform admin", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members"), context)).status).toBe(401);
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a", role: "user", status: "active", adminPermissions: [] });
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members"), context)).status).toBe(403);
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "disabled", adminPermissions: [] });
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members"), context)).status).toBe(403);
    });

    it("passes school-scoped pagination and filters and returns the envelope", async () => {
        const response = await GET(new Request("http://localhost/api/admin/schools/school-a/members?page=2&pageSize=10&keyword=1001&role=student&status=disabled"), context);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { items: [] }, msg: "ok" });
        expect(mocks.list).toHaveBeenCalledWith("admin-a", "school-a", { page: 2, pageSize: 10, keyword: "1001", role: "student", status: "disabled" });
    });

    it("rejects unknown role and status", async () => {
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members?role=admin"), context)).status).toBe(400);
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members?status=archived"), context)).status).toBe(400);
        expect(mocks.list).not.toHaveBeenCalled();
    });
});
