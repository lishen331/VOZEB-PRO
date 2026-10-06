import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listRoles: vi.fn(), createRole: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/platform-rbac-service", () => ({ listPlatformRbacRoles: mocks.listRoles, createPlatformRbacRole: mocks.createRole }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

describe("admin RBAC roles route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["administrators.manage"] });
        mocks.listRoles.mockResolvedValue([{ key: "platform-admin", name: "平台管理员" }]);
        mocks.createRole.mockResolvedValue({ key: "platform-custom-a", name: "运营管理员" });
    });

    it("requires administrator governance permission before listing or creating roles", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        expect((await GET()).status).toBe(403);
        expect(mocks.listRoles).not.toHaveBeenCalled();

        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        expect((await POST(new Request("http://localhost/api/admin/rbac/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "运营管理员", permissions: ["users.read"] }) }))).status).toBe(403);
        expect(mocks.createRole).not.toHaveBeenCalled();
    });

    it("lists roles and creates a role without auditing request passwords", async () => {
        await expect((await GET()).json()).resolves.toEqual({ items: [{ key: "platform-admin", name: "平台管理员" }] });
        const response = await POST(new Request("http://localhost/api/admin/rbac/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "运营管理员", permissions: ["users.read"] }) }));
        expect(response.status).toBe(201);
        expect(mocks.createRole).toHaveBeenCalledWith({ name: "运营管理员", permissions: ["users.read"] });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.rbac.role.create", target: expect.objectContaining({ id: "platform-custom-a" }) }));
    });
});
