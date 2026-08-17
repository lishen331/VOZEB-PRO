import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-tenant-service", () => ({ listSchoolClasses: mocks.list, createSchoolClass: mocks.create }));

import { GET } from "./route";

describe("school classes route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-user" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("passes bounded keyword and active-status filters to the tenant service", async () => {
        const response = await GET(new Request("http://localhost/api/school/classes?page=1&pageSize=20&keyword=%E8%A7%86%E8%A7%89&status=active"));

        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("manager-user", { page: 1, pageSize: 20, keyword: "视觉", status: "active" });
    });
});
