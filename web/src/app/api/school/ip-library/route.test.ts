import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listSchoolIpAccess: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-ip-library-service", () => ({ listSchoolIpAccess: mocks.listSchoolIpAccess }));

import { GET } from "./route";

describe("school IP library route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.listSchoolIpAccess.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    });

    it("uses the current session and bounded pagination", async () => {
        const response = await GET(new Request("http://localhost/api/school/ip-library?page=2&pageSize=10&schoolId=school-b"));
        expect(mocks.listSchoolIpAccess).toHaveBeenCalledWith("manager-a", { page: 2, pageSize: 10 });
        expect(response.status).toBe(200);
    });

    it("requires login", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/school/ip-library"))).status).toBe(401);
    });
});
