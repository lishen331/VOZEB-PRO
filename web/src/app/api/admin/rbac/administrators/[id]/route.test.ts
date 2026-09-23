import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), update: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/platform-rbac-service", () => ({ updatePlatformAdministrator: mocks.update, deletePlatformAdministrator: mocks.remove }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "admin-b" }) };

describe("admin RBAC administrator detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["administrators.manage"] });
        mocks.update.mockResolvedValue({ id: "admin-b", username: "operator" });
        mocks.remove.mockResolvedValue({ ok: true });
    });

    it("rejects direct mutation without the administrator governance permission", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        expect((await PATCH(new Request("http://localhost/api/admin/rbac/administrators/admin-b", { method: "PATCH", body: "{}" }), context)).status).toBe(403);
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        expect((await DELETE(new Request("http://localhost/api/admin/rbac/administrators/admin-b", { method: "DELETE" }), context)).status).toBe(401);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("updates and deletes the requested administrator with auditable targets", async () => {
        const patch = { displayName: "运营", password: "" };
        expect((await PATCH(new Request("http://localhost/api/admin/rbac/administrators/admin-b", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }), context)).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("admin-a", "admin-b", patch);
        expect((await DELETE(new Request("http://localhost/api/admin/rbac/administrators/admin-b", { method: "DELETE" }), context)).status).toBe(200);
        expect(mocks.remove).toHaveBeenCalledWith("admin-a", "admin-b");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.rbac.administrator.delete", target: { type: "user", id: "admin-b" } }));
    });
});