import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
    postgresQuery: vi.fn(),
    withPostgresTransaction: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    postgresQuery: mocks.postgresQuery,
    withPostgresTransaction: mocks.withPostgresTransaction,
}));
vi.mock("@/lib/auth/store", () => ({
    AuthInputError: class AuthInputError extends Error {
        constructor(
            message: string,
            public status = 400,
        ) {
            super(message);
        }
    },
    createUserByAdmin: vi.fn(),
    deleteUserByAdmin: vi.fn(),
    updateUserByAdmin: vi.fn(),
}));

import { deletePlatformRbacRole, updatePlatformRbacRole } from "./platform-rbac-service";

const roleRow = (overrides: Record<string, unknown> = {}) => ({
    role_key: "platform-superadmin",
    name: "Platform Superadmin",
    scope: "platform",
    permissions: ["users.read"],
    status: "active",
    is_builtin: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    administrator_count: 0,
    ...overrides,
});

function mockRoleUpdate(current: Record<string, unknown>, bindings = 0) {
    const client = { query: vi.fn() };
    client.query.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM rbac_roles WHERE role_key")) return { rows: [current] };
        if (sql.includes("SELECT count(*)::int AS total")) return { rows: [{ total: bindings }] };
        if (sql.includes("UPDATE rbac_roles SET")) return { rows: [current] };
        return { rows: [] };
    });
    mocks.withPostgresTransaction.mockImplementation(async (callback: (executor: typeof client) => unknown) => callback(client));
    return client;
}

function mockRoleDelete(result: Record<string, unknown>) {
    const client = { query: vi.fn() };
    client.query.mockImplementation(async (sql: string) => {
        if (sql.includes("SELECT role.is_builtin")) return { rows: [result] };
        return { rows: [] };
    });
    mocks.withPostgresTransaction.mockImplementation(async (callback: (executor: typeof client) => unknown) => callback(client));
    return client;
}

describe("platform RBAC role invariants", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
    });

    it.each([
        ["platform-superadmin", "Platform Superadmin"],
        ["school-superadmin", "School Superadmin"],
        ["teacher", "Teacher"],
        ["student", "Student"],
        ["normal-user", "Normal User"],
    ])("does not allow renaming builtin role %s", async (key, name) => {
        const client = mockRoleUpdate(roleRow({ role_key: key, name, scope: key === "platform-superadmin" ? "platform" : "school", is_builtin: true }));
        await expect(updatePlatformRbacRole(key, { name: "Renamed Role" })).rejects.toMatchObject({ status: 409 });
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE rbac_roles SET"))).toBe(false);
    });

    it.each(["platform-superadmin", "school-superadmin", "teacher", "student", "normal-user"])("does not allow disabling builtin role %s", async (key) => {
        const client = mockRoleUpdate(roleRow({ role_key: key, is_builtin: true, scope: key === "platform-superadmin" ? "platform" : "school" }));
        await expect(updatePlatformRbacRole(key, { status: "disabled" })).rejects.toMatchObject({ status: 409 });
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE rbac_roles SET"))).toBe(false);
    });

    it.each(["platform-superadmin", "school-superadmin", "teacher", "student", "normal-user"])("does not allow deleting builtin role %s", async (key) => {
        const client = mockRoleDelete({ is_builtin: true, scope: key === "platform-superadmin" ? "platform" : "school", total: 0 });
        await expect(deletePlatformRbacRole(key)).rejects.toMatchObject({ status: 409 });
        expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith("DELETE FROM rbac_roles"))).toBe(false);
    });

    it("keeps builtin role names fixed while allowing permission changes", async () => {
        const current = roleRow({ permissions: ["users.read"] });
        const client = mockRoleUpdate(current);
        await expect(updatePlatformRbacRole("platform-superadmin", { permissions: ["users.manage"] })).resolves.toMatchObject({ key: "platform-superadmin" });
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE rbac_roles SET"))).toBe(true);
    });

    it("stores menu permissions on the role and legacy duties on users", async () => {
        const current = roleRow({ permissions: ["admin.menu.users"] });
        const client = mockRoleUpdate(current);
        await updatePlatformRbacRole("platform-superadmin", { permissions: ["admin.menu.users", "admin.menu.roleManagement"] });

        const roleUpdate = client.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE rbac_roles SET"));
        expect(roleUpdate?.[1]).toEqual([
            "platform-superadmin",
            "Platform Superadmin",
            JSON.stringify(["admin.menu.roleManagement", "admin.menu.users"]),
            "active",
            expect.any(String),
        ]);
        const userUpdate = client.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE users user_record SET"));
        expect(userUpdate?.[1]).toEqual([
            "platform-superadmin",
            JSON.stringify(["administrators.manage", "users.read", "users.manage"]),
            expect.any(String),
        ]);
    });

    it("treats the former platform-admin role as a normal editable role", async () => {
        const current = roleRow({ role_key: "platform-admin", name: "Platform Admin", is_builtin: false, permissions: ["users.read"] });
        const client = mockRoleUpdate(current);
        await expect(updatePlatformRbacRole("platform-admin", { name: "Operations", status: "disabled" })).resolves.toMatchObject({ key: "platform-admin" });
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE rbac_roles SET"))).toBe(true);

        const deleteClient = mockRoleDelete({ is_builtin: false, scope: "platform", total: 0 });
        await expect(deletePlatformRbacRole("platform-admin")).resolves.toEqual({ ok: true });
        expect(deleteClient.query.mock.calls.some(([sql]) => String(sql).startsWith("DELETE FROM rbac_roles"))).toBe(true);
    });
});
