import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-course-service", () => ({ listSchoolCourses: mocks.list }));

import { GET } from "./route";

describe("school courses route", () => {
    beforeEach(() => vi.clearAllMocks());

    it("uses the session user and never accepts a school id", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        const response = await GET(new Request("http://localhost/api/school/courses?schoolId=school-b&page=1"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("manager-a", { page: 1, pageSize: 20 });
    });
});
