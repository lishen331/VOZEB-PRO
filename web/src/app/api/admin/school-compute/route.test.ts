import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-compute-service", () => ({ listAdminSchoolComputePools: mocks.list }));

import { GET } from "./route";

describe("admin school compute list route", () => {
    beforeEach(() => vi.clearAllMocks());

    it("requires a school or billing administrator", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        const response = await GET(new Request("http://localhost/api/admin/school-compute"));
        expect(response.status).toBe(403);
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("passes page filters to the service", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
        const response = await GET(new Request("http://localhost/api/admin/school-compute?page=2&pageSize=10&keyword=A&status=frozen"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("admin-a", { page: 2, pageSize: 10, keyword: "A", status: "frozen" });
    });

    it("caps page size at one hundred", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
        await GET(new Request("http://localhost/api/admin/school-compute?pageSize=999"));
        expect(mocks.list).toHaveBeenCalledWith("admin-a", expect.objectContaining({ pageSize: 100 }));
    });
});
