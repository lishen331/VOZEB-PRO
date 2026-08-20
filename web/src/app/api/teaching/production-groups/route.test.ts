import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-production-group-service", () => ({ listTeachingProductionGroups: mocks.list }));
import { GET } from "./route";

describe("teaching production groups route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    });
    it("uses current membership and ignores tenant selectors", async () => {
        const response = await GET(new Request("http://localhost/api/teaching/production-groups?schoolId=school-b&page=2&pageSize=10"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("student-a", { page: 2, pageSize: 10 });
    });
});
