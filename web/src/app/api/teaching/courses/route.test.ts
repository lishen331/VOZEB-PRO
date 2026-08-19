import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-course-service", () => ({ listTeachingCourses: mocks.list }));

import { GET } from "./route";

describe("teaching courses route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "student-user" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("derives visible courses from the current school identity", async () => {
        const response = await GET(new Request("http://localhost/api/teaching/courses?schoolId=school-b&page=1"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("student-user", { page: 1, pageSize: 20 });
    });
});
