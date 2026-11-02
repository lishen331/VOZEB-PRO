import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
    postgresQuery: vi.fn(),
    getSchoolContextForUser: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    postgresQuery: mocks.postgresQuery,
}));

vi.mock("@/lib/server/school-access-service", () => ({ getSchoolContextForUser: mocks.getSchoolContextForUser }));

import { DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS } from "@/lib/feature-modules";
import { getUserNavigationMenuPermissions, resolvePracticeModelTestAccess } from "./user-navigation-permissions";

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

describe("practice model test access", () => {
    const canvas = { executionProfile: "open-source-practice", surface: "canvas" };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
        mocks.getSchoolContextForUser.mockResolvedValue({ school: { id: "school-one", status: "active" }, membership: { status: "active" } });
    });

    it("is never part of the default granted menu permissions", () => {
        expect(DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS).not.toContain("practice-model-test");
    });

    it("only checks the practice canvas and lets platform admins through", async () => {
        await expect(resolvePracticeModelTestAccess({ id: "user-one", role: "user" }, { executionProfile: "production", surface: "canvas" })).resolves.toBe(false);
        await expect(resolvePracticeModelTestAccess({ id: "user-one", role: "user" }, { executionProfile: "open-source-practice", surface: "drama" })).resolves.toBe(false);
        await expect(resolvePracticeModelTestAccess({ id: "admin-one", role: "admin" }, canvas)).resolves.toBe(true);
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("grants access only when the role explicitly selected the permission", async () => {
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ permissions: ["practice", "practice-model-test"] }] });
        await expect(resolvePracticeModelTestAccess({ id: "user-one", role: "user" }, canvas)).resolves.toBe(true);
        expect(mocks.postgresQuery).toHaveBeenLastCalledWith(expect.any(String), ["user-one", "school-one", ["teacher", "student"], expect.any(String)]);
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ permissions: ["practice"] }] });
        await expect(resolvePracticeModelTestAccess({ id: "user-one", role: "user" }, canvas)).resolves.toBe(false);
    });

    it("treats a failed lookup as no access instead of failing the generation", async () => {
        mocks.getSchoolContextForUser.mockRejectedValue(new Error("DATABASE_URL is required"));
        await expect(resolvePracticeModelTestAccess({ id: "user-one", role: "user" }, canvas)).resolves.toBe(false);
    });
});
