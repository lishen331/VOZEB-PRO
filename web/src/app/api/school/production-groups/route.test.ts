import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-production-group-service", () => ({ listProductionGroupsForSchool: mocks.list, createProductionGroup: mocks.create }));
import { GET } from "./route";

describe("school production groups route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });
    it("forwards bounded filters without accepting a school selector", async () => {
        const response = await GET(new Request("http://localhost/api/school/production-groups?schoolId=school-b&page=1&pageSize=500&keyword=%E7%9F%AD%E5%89%A7&status=active"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("manager-a", { page: 1, pageSize: 100, keyword: "短剧", status: "active" });
    });
});
