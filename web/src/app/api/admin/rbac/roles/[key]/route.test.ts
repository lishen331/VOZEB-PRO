import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), update: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/platform-rbac-service", () => ({ updatePlatformRbacRole: mocks.update, deletePlatformRbacRole: mocks.remove }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ key: "platform-custom-a" }) };

describe("admin RBAC role detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["administrators.manage"] });
        mocks.update.mockResolvedValue({ key: "platform-custom-a", name: "运营管理员" });
        mocks.remove.mockResolvedValue({ ok: true });
    });

    it("rejects direct mutation without the administrator governance permission", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        expect((await PATCH(new Request("http://localhost/api/admin/rbac/roles/platform-custom-a", { method: "PATCH", body: "{}" }), context)).status).toBe(403);
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("updates and deletes the requested role with audit targets", async () => {
        const patch = { name: "运营管理员", permissions: ["users.read"] };
        expect((await PATCH(new Request("http://localhost/api/admin/rbac/roles/platform-custom-a", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }), context)).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("platform-custom-a", patch);
        expect((await DELETE(new Request("http://localhost/api/admin/rbac/roles/platform-custom-a", { method: "DELETE" }), context)).status).toBe(200);
        expect(mocks.remove).toHaveBeenCalledWith("platform-custom-a");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.rbac.role.delete", target: { type: "role", id: "platform-custom-a" } }));
    });
});
