import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    currentUser: vi.fn(),
    readBody: vi.fn(),
    setPullFilm: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readBody }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/public-work-process-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/public-work-process-service")>()),
    setPublishedWorkPullFilm: mocks.setPullFilm,
}));

import { PATCH } from "./route";

const context = { params: Promise.resolve({ id: "work-one" }) };

describe("PATCH /api/admin/works/[id]/pull-film", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readBody.mockResolvedValue({ enabled: true });
        mocks.setPullFilm.mockResolvedValue({ hasProcess: true, processVersionId: "version-one", updatedAt: "2026-08-19T00:00:00.000Z" });
    });

    it("rejects unauthenticated users and every role without content.manage", async () => {
        mocks.currentUser
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "ordinary-user", role: "user", status: "active" })
            .mockResolvedValueOnce({ id: "school-admin", role: "user", status: "active", schoolRole: "manager" })
            .mockResolvedValueOnce({ id: "teacher", role: "user", status: "active", schoolRole: "teacher" })
            .mockResolvedValueOnce({ id: "student", role: "user", status: "active", schoolRole: "student" });

        expect((await PATCH(new Request("http://localhost/api/admin/works/work-one/pull-film", { method: "PATCH" }), context)).status).toBe(401);
        for (let index = 0; index < 4; index += 1) {
            expect((await PATCH(new Request("http://localhost/api/admin/works/work-one/pull-film", { method: "PATCH" }), context)).status).toBe(403);
        }
        expect(mocks.setPullFilm).not.toHaveBeenCalled();
    });

    it("passes the authenticated content administrator and enabled state to the service", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });

        const response = await PATCH(new Request("http://localhost/api/admin/works/work-one/pull-film", { method: "PATCH" }), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { hasProcess: true, processVersionId: "version-one" } });
        expect(mocks.setPullFilm).toHaveBeenCalledWith("admin-one", "work-one", true);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.work.pull-film.enable" }));
    });

    it("supports disabling the current process and records a separate audit action", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.readBody.mockResolvedValue({ enabled: false });
        mocks.setPullFilm.mockResolvedValue({ hasProcess: false, updatedAt: "2026-08-19T00:00:00.000Z" });

        const response = await PATCH(new Request("http://localhost/api/admin/works/work-one/pull-film", { method: "PATCH" }), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { hasProcess: false } });
        expect(mocks.setPullFilm).toHaveBeenCalledWith("admin-one", "work-one", false);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.work.pull-film.disable" }));
    });

    it("maps a null JSON body to a structured input error", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.readBody.mockResolvedValue(null);

        const response = await PATCH(new Request("http://localhost/api/admin/works/work-one/pull-film", { method: "PATCH" }), context);

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: 400, data: null, msg: "拉片项目状态无效" });
        expect(mocks.setPullFilm).not.toHaveBeenCalled();
    });
});
