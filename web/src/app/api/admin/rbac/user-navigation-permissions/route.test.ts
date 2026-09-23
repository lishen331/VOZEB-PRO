import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listPlatformRbacRoles: vi.fn(),
    updatePlatformRbacRole: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/platform-rbac-service", () => ({
    listPlatformRbacRoles: mocks.listPlatformRbacRoles,
    updatePlatformRbacRole: mocks.updatePlatformRbacRole,
}));

import { GET, PATCH } from "./route";

describe("admin user navigation permissions route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.listPlatformRbacRoles.mockResolvedValue([
            { key: "teacher", name: "老师", permissions: ["community"] },
            { key: "student", name: "学生", permissions: ["assets"] },
            { key: "normal-user", name: "普通用户", permissions: ["creative-agent"] },
            { key: "platform-admin", name: "平台管理员", permissions: ["users.read"] },
        ]);
        mocks.updatePlatformRbacRole.mockResolvedValue({ key: "teacher", name: "老师", permissions: ["community"] });
    });

    it("allows the plugin-market administrator permission and returns only the three foreground roles", async () => {
        await expect((await GET()).json()).resolves.toEqual({
            items: [
                { key: "teacher", name: "老师", permissions: ["community"] },
                { key: "student", name: "学生", permissions: ["assets"] },
                { key: "normal-user", name: "普通用户", permissions: ["creative-agent"] },
            ],
        });
    });

    it("rejects administrators without plugin or administrator governance permission", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-two", role: "admin", status: "active", adminPermissions: ["users.read"] });
        expect((await GET()).status).toBe(403);
        expect(mocks.listPlatformRbacRoles).not.toHaveBeenCalled();
    });

    it("updates only a supported foreground role", async () => {
        const permissions = ["community", "help-center"];
        const response = await PATCH(
            new Request("http://localhost/api/admin/rbac/user-navigation-permissions", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ roleKey: "teacher", permissions }),
            }),
        );
        expect(response.status).toBe(200);
        expect(mocks.updatePlatformRbacRole).toHaveBeenCalledWith("teacher", { permissions });
    });
});
