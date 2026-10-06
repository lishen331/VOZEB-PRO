import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
    postgresQuery: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    postgresQuery: mocks.postgresQuery,
}));

import { getUserNavigationMenuPermissions } from "./user-navigation-permissions";

describe("user navigation permissions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
    });

    it("prefers the active school teacher or student role over normal-user", async () => {
        mocks.postgresQuery.mockResolvedValue({ rows: [{ permissions: ["community", "creative-agent"] }] });

        await expect(getUserNavigationMenuPermissions("user-one", "school-one")).resolves.toEqual(["creative-agent", "community"]);
        expect(mocks.postgresQuery).toHaveBeenCalledWith(expect.stringContaining("role.role_key = ANY"), ["user-one", "school-one", ["teacher", "student"], expect.any(String)]);
    });

    it("uses the normal-user role when no school identity is active", async () => {
        mocks.postgresQuery.mockResolvedValue({ rows: [{ permissions: ["assets"] }] });

        await expect(getUserNavigationMenuPermissions("user-one")).resolves.toEqual(["assets"]);
        expect(mocks.postgresQuery).toHaveBeenCalledWith(expect.stringContaining("role.role_key = 'normal-user'"), ["user-one", null, ["teacher", "student"], expect.any(String)]);
    });

    it("uses the default user menu for a platform administrator without a user role binding", async () => {
        mocks.postgresQuery.mockResolvedValue({ rows: [{ permissions: undefined }] });

        await expect(getUserNavigationMenuPermissions("admin-one")).resolves.toContain("creative-agent");
        expect(mocks.postgresQuery).toHaveBeenCalledWith(expect.stringContaining("user_record.role = 'admin'"), ["admin-one", null, ["teacher", "student"], expect.any(String)]);
    });

    it("fails closed when the user does not have a role binding", async () => {
        mocks.postgresQuery.mockResolvedValue({ rows: [] });

        await expect(getUserNavigationMenuPermissions("user-one")).resolves.toEqual([]);
    });
});
