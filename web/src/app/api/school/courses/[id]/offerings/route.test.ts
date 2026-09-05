import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readJsonBodyResult: vi.fn(),
    createCourseOffering: vi.fn(),
    listCourseOfferings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: mocks.readJsonBodyResult }));
vi.mock("@/lib/server/school-course-service", () => ({ createCourseOffering: mocks.createCourseOffering, listCourseOfferings: mocks.listCourseOfferings }));

import { POST } from "./route";

describe("school course offerings route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-user" });
        mocks.readJsonBodyResult.mockResolvedValue({ ok: true, data: { classId: "class-a", teacherMembershipId: "teacher-a" } });
    });

    it("returns the service conflict message instead of a generic 500", async () => {
        mocks.createCourseOffering.mockRejectedValue(Object.assign(new Error("该课程已为此班级和老师创建教学安排"), { status: 409 }));

        const response = await POST(new Request("http://localhost/api/school/courses/assignment-a/offerings", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "assignment-a" }) });

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({ code: 409, msg: "该课程已为此班级和老师创建教学安排" });
    });
});
