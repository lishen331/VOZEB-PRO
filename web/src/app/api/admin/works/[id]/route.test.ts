import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    currentUser: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()), deleteWorkPublicationForAdmin: mocks.remove, updateOfficialWorkDraft: mocks.update }));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "work-one" }) };

describe("DELETE /api/admin/works/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.remove.mockResolvedValue({ id: "work-one", title: "作品" });
        mocks.update.mockResolvedValue({ id: "work-one", title: "更新" });
    });

    it("does not expose permanent deletion to ordinary users", async () => {
        mocks.currentUser.mockResolvedValue({ id: "user-one", username: "user", role: "user" });

        const response = await DELETE(new Request("http://localhost/api/admin/works/work-one", { method: "DELETE" }), context);

        expect(response.status).toBe(403);
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("passes the administrator identity to the deletion service and records the audit event", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin", status: "active", adminPermissions: ["content.manage"] });

        const response = await DELETE(new Request("http://localhost/api/admin/works/work-one", { method: "DELETE" }), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { deletedId: "work-one" } });
        expect(mocks.remove).toHaveBeenCalledWith("admin-one", "work-one");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.work.delete", target: expect.objectContaining({ id: "work-one" }) }));
    });
    it("updates only through the official work service and audits the action", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        const response = await PATCH(new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "更新", ownerUserId: "spoofed" }) }), context);
        expect(response.status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("admin-one", "work-one", expect.objectContaining({ title: "更新" }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.official-work.update" }));
    });
});
