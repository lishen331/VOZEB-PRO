import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/platform-rbac-service", () => ({ listPlatformAdministrators: mocks.list, createPlatformAdministrator: mocks.create }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

describe("admin RBAC administrators route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["administrators.manage"] });
        mocks.list.mockResolvedValue([{ id: "admin-a", username: "admin", roleName: "平台超管" }]);
        mocks.create.mockResolvedValue({ id: "admin-b", username: "operator" });
    });

    it("requires authentication and permission before listing or creating administrators", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        expect((await GET()).status).toBe(401);
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        expect((await POST(new Request("http://localhost/api/admin/rbac/administrators", { method: "POST", body: "{}" }))).status).toBe(403);
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("lists and creates a platform administrator without auditing the password", async () => {
        await expect((await GET()).json()).resolves.toEqual({ items: [{ id: "admin-a", username: "admin", roleName: "平台超管" }] });
        const input = { username: "operator", displayName: "运营管理员", password: "12345678", roleKey: "platform-admin" };
        const response = await POST(new Request("http://localhost/api/admin/rbac/administrators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
        expect(response.status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith("admin-a", input);
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("12345678");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.rbac.administrator.create", target: { type: "user", id: "admin-b", label: "operator" } }));
    });
});