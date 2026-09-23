import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    updateUserByAdmin: vi.fn(),
    deleteAdminUserWithMediaCleanup: vi.fn(),
    getSchoolContextForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({
    updateUserByAdmin: mocks.updateUserByAdmin,
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/server/school-access-service", () => ({ getSchoolContextForUser: mocks.getSchoolContextForUser }));
vi.mock("@/lib/server/admin-user-deletion-service", () => ({ deleteAdminUserWithMediaCleanup: mocks.deleteAdminUserWithMediaCleanup }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: vi.fn() }));

import { DELETE, PATCH } from "./route";

describe("admin user detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["users.manage", "billing.manage"] });
        mocks.getSchoolContextForUser.mockResolvedValue(null);
        mocks.updateUserByAdmin.mockResolvedValue({ id: "user-one", username: "creator", role: "user", status: "active" });
        mocks.deleteAdminUserWithMediaCleanup.mockResolvedValue({ ok: true });
    });

    it("updates ordinary-user account fields without accepting role changes", async () => {
        const response = await PATCH(request("PATCH", { displayName: "新昵称", password: "new-password" }), context());

        expect(response.status).toBe(200);
        expect(mocks.updateUserByAdmin).toHaveBeenCalledWith("admin-one", "user-one", { displayName: "新昵称", password: "new-password" });
    });

    it("rejects administrator role fields", async () => {
        expect((await PATCH(request("PATCH", { role: "admin" }), context())).status).toBe(400);
        expect(mocks.updateUserByAdmin).not.toHaveBeenCalled();
    });

    it("protects school-member status and deletion in user operations", async () => {
        mocks.getSchoolContextForUser.mockResolvedValue({ school: { id: "school-one" } });
        expect((await PATCH(request("PATCH", { status: "disabled" }), context())).status).toBe(400);
        expect((await DELETE(request("DELETE"), context())).status).toBe(400);
        expect(mocks.deleteAdminUserWithMediaCleanup).not.toHaveBeenCalled();
    });

    it("deletes an ordinary user", async () => {
        const response = await DELETE(request("DELETE"), context());

        expect(response.status).toBe(200);
        expect(mocks.deleteAdminUserWithMediaCleanup).toHaveBeenCalledWith("admin-one", "user-one");
    });
});

function request(method: string, body?: unknown) {
    return new Request("http://localhost/api/admin/users/user-one", {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
}

function context() {
    return { params: Promise.resolve({ id: "user-one" }) };
}
