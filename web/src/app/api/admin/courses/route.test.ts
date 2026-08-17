import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-course-service", () => ({ listPlatformCourses: mocks.list, createPlatformCourse: mocks.create }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

describe("admin courses route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
    });

    it("requires education.manage", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: [] });
        expect((await GET(new Request("http://localhost/api/admin/courses"))).status).toBe(403);
    });

    it("creates and audits course identity/status without course body", async () => {
        mocks.create.mockResolvedValue({ id: "course-a", title: "视觉课程", status: "draft" });
        const request = new Request("http://localhost/api/admin/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "视觉课程", content: { secret: "正文" } }) });
        expect((await POST(request)).status).toBe(200);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.course.create", target: expect.objectContaining({ id: "course-a" }), metadata: { status: "draft" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("正文");
    });
});
