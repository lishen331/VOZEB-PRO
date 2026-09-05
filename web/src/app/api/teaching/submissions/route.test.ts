import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-course-service", () => ({ listOwnTeachingSubmissions: mocks.list }));

import { GET } from "./route";

describe("teaching submissions route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "student-user" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 12 });
    });

    it("lists only the current student's tenant-scoped submissions", async () => {
        const response = await GET(new Request("http://localhost/api/teaching/submissions?page=2&pageSize=12&assignmentId=task-a&assignmentId=task-b&schoolId=school-b"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("student-user", { page: 2, pageSize: 12, assignmentIds: ["task-a", "task-b"] });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/teaching/submissions"))).status).toBe(401);
        expect(mocks.list).not.toHaveBeenCalled();
    });
});
