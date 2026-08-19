import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-course-service", () => ({ listTeachingAssignments: mocks.list, createTeachingAssignment: mocks.create }));

import { GET, POST } from "./route";

describe("teaching assignments route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "teacher-user" });
    });

    it("lists only through the current school identity", async () => {
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        expect((await GET(new Request("http://localhost/api/teaching/assignments?schoolId=school-b"))).status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("teacher-user", { page: 1, pageSize: 20 });
    });

    it("passes assignment creation to the role-aware service", async () => {
        mocks.create.mockResolvedValue({ id: "task-a", offeringId: "offering-a", status: "draft" });
        const request = new Request("http://localhost/api/teaching/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offeringId: "offering-a", title: "作业", kind: "homework" }) });
        expect((await POST(request)).status).toBe(200);
        expect(mocks.create).toHaveBeenCalledWith("teacher-user", "offering-a", expect.objectContaining({ title: "作业" }));
    });
});
