import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requirePlatformAdmin: vi.fn(),
    createSchoolDomainRepository: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => false),
    mutateFileSchoolDomainInsideLock: vi.fn(),
    mutateAuthDb: vi.fn(),
    adjustPermanentPointsInAuthDb: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    withPostgresTransaction: vi.fn(),
    adjustPermanentPointsInPostgresTransaction: vi.fn(),
}));

vi.mock("@/lib/server/school-access-service", () => ({
    requirePlatformAdmin: mocks.requirePlatformAdmin,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: mocks.createSchoolDomainRepository }));
vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("@/lib/server/database", () => ({ isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled, ensurePostgresSchema: mocks.ensurePostgresSchema, withPostgresTransaction: mocks.withPostgresTransaction }));
vi.mock("@/lib/server/school-domain-file-repository", () => ({ mutateFileSchoolDomainInsideLock: mocks.mutateFileSchoolDomainInsideLock }));
vi.mock("@/lib/auth/store-repository", () => ({ mutateAuthDb: mocks.mutateAuthDb }));
vi.mock("@/lib/server/points-wallet-service", () => ({ adjustPermanentPointsInAuthDb: mocks.adjustPermanentPointsInAuthDb, adjustPermanentPointsInPostgresTransaction: mocks.adjustPermanentPointsInPostgresTransaction }));

import { adjustSchoolMemberPointsByAdmin, listSchoolMembersByAdmin } from "./admin-school-member-points-service";

const user = (id = "user-1", overrides = {}) => ({
    id,
    accountId: "1001",
    username: "student",
    displayName: "学生",
    email: "student@example.com",
    role: "user",
    status: "active",
    pointsBalance: 20,
    permanentPointsBalance: 20,
    dailyPointsBalance: 5,
    dailyPointsExpiresAt: "2026-09-01T15:59:59.000Z",
    adminPermissions: [],
    planId: "free",
    planName: "Free",
    hasActivePlan: false,
    bio: "",
    mfaEnabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
});
const membership = {
    id: "membership-1",
    schoolId: "school-1",
    userId: "user-1",
    role: "student" as const,
    permissions: [],
    status: "active" as const,
    joinSource: "admin" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("admin school member points service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requirePlatformAdmin.mockResolvedValue(user("admin-1", { role: "admin", adminPermissions: [] }));
        mocks.getPublicUsersByIds.mockResolvedValue([user()]);
        mocks.createSchoolDomainRepository.mockReturnValue({
            getSchool: vi.fn().mockResolvedValue({ id: "school-1", name: "甲学校", status: "disabled" }),
            listMembers: vi.fn().mockResolvedValue({ items: [membership], total: 1, page: 1, pageSize: 20 }),
            getMembership: vi.fn().mockResolvedValue(membership),
        });
    });

    it("lists school-scoped members with public account and wallet balances", async () => {
        const result = await listSchoolMembersByAdmin("admin-1", "school-1", { page: 1, pageSize: 20, keyword: "1001", role: "student", status: "active" });
        expect(mocks.createSchoolDomainRepository().listMembers).toHaveBeenCalledWith("school-1", { page: 1, pageSize: 20, keyword: "1001", role: "student", status: "active" });
        expect(result.items[0]).toMatchObject({ id: "membership-1", userId: "user-1", accountId: "1001", permanentPoints: 20, dailyPoints: 5, totalPoints: 25, accountStatus: "active" });
    });

    it("adjusts a disabled member with decimal credit and preserves daily points", async () => {
        const record = { id: "record-1", type: "admin-adjust", amount: 12.5, permanentAmount: 12.5, permanentBalanceAfter: 32.5, description: "合同额度修正", createdAt: "2026-09-01T00:00:00.000Z" };
        mocks.createSchoolDomainRepository.mockReturnValue({ getSchool: vi.fn().mockResolvedValue({ id: "school-1", name: "甲学校", status: "disabled" }), getMembership: vi.fn().mockResolvedValue({ ...membership, status: "disabled" }) });
        mocks.getPublicUsersByIds.mockResolvedValue([user("user-1", { status: "disabled", permanentPointsBalance: 32.5, pointsBalance: 37.5 })]);
        mocks.mutateFileSchoolDomainInsideLock.mockImplementation(async (callback: (repository: unknown) => unknown) => callback(mocks.createSchoolDomainRepository()));
        mocks.mutateAuthDb.mockImplementation(async (callback: (db: unknown) => unknown) => callback({}));
        mocks.adjustPermanentPointsInAuthDb.mockReturnValue({ record, snapshot: { permanentPoints: 32.5, dailyPoints: 5, totalPoints: 37.5 }, applied: true });
        const result = await adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-1" });
        expect(mocks.adjustPermanentPointsInAuthDb).toHaveBeenCalledWith({}, expect.objectContaining({ amount: 12.5, requireActive: false, minimumBalance: 0, requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }));
        expect(result.adjustment).toMatchObject({ amount: 12.5, balanceBefore: 20, balanceAfter: 32.5, operation: "credit" });
        expect(result.member.dailyPoints).toBe(5);
    });

    it("rejects malformed adjustment input before touching persistence", async () => {
        await expect(adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 1.234, reason: "", idempotencyKey: "" })).rejects.toMatchObject({ status: 400 });
        expect(mocks.createSchoolDomainRepository).not.toHaveBeenCalled();
    });
});
