import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requirePlatformAdmin: vi.fn(),
    createSchoolDomainRepository: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    toPublicUser: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => false),
    createPostgresRepositories: vi.fn(),
    mutateFileSchoolDomainInsideLock: vi.fn(),
    withJsonDataFileLocks: vi.fn(),
    readJsonDataFile: vi.fn(),
    writeJsonDataFile: vi.fn(),
    mutateAuthDb: vi.fn(),
    writeAuthDb: vi.fn(),
    normalizeDb: vi.fn((value: unknown) => value),
    emptyDb: vi.fn(() => ({ users: [], pointRecords: [], dailyPlanPointWallets: [], settings: {} })),
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
vi.mock("@/lib/auth/store-user-projection", () => ({ toPublicUser: mocks.toPublicUser, publicUserFromAuthenticatedRecord: mocks.toPublicUser }));
vi.mock("@/lib/auth/store-normalizers", () => ({ MAX_POINT_AMOUNT: 1_000_000, normalizeDb: mocks.normalizeDb, emptyDb: mocks.emptyDb }));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: mocks.createPostgresRepositories,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    withPostgresTransaction: mocks.withPostgresTransaction,
}));
vi.mock("@/lib/server/school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: mocks.mutateFileSchoolDomainInsideLock }));
vi.mock("@/lib/server/data-adapter", () => ({ readJsonDataFile: mocks.readJsonDataFile, writeJsonDataFile: mocks.writeJsonDataFile, withJsonDataFileLocks: mocks.withJsonDataFileLocks }));
vi.mock("@/lib/auth/store-repository", () => ({ mutateAuthDb: mocks.mutateAuthDb, writeAuthDb: mocks.writeAuthDb }));
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
        mocks.isPostgresDatabaseEnabled.mockReturnValue(false);
        mocks.requirePlatformAdmin.mockResolvedValue(user("admin-1", { role: "admin", adminPermissions: [] }));
        mocks.getPublicUsersByIds.mockResolvedValue([user()]);
        mocks.createSchoolDomainRepository.mockReturnValue({
            getSchool: vi.fn().mockResolvedValue({ id: "school-1", name: "甲学校", status: "disabled" }),
            listMembers: vi.fn().mockResolvedValue({ items: [membership], total: 1, page: 1, pageSize: 20 }),
            getMembership: vi.fn().mockResolvedValue(membership),
        });
        mocks.withJsonDataFileLocks.mockImplementation(async (_files: string[], callback: () => unknown) => callback());
        mocks.readJsonDataFile.mockImplementation(async (_name: string, fallback: unknown) => fallback);
        mocks.toPublicUser.mockReturnValue(user());
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
        mocks.adjustPermanentPointsInAuthDb.mockReturnValue({ record, snapshot: { permanentPoints: 32.5, dailyPoints: 5, totalPoints: 37.5 }, applied: true });
        mocks.readJsonDataFile.mockResolvedValue({ users: [user("user-1")], pointRecords: [], dailyPlanPointWallets: [], settings: {} });
        mocks.normalizeDb.mockImplementation((value: unknown) => value);
        const result = await adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-1" });
        expect(mocks.withJsonDataFileLocks).toHaveBeenCalledWith(["auth.json", "school-domain.json"], expect.any(Function));
        expect(mocks.mutateAuthDb).not.toHaveBeenCalled();
        expect(mocks.adjustPermanentPointsInAuthDb).toHaveBeenCalledWith(
            expect.objectContaining({ users: expect.any(Array) }),
            expect.objectContaining({ amount: 12.5, requireActive: false, minimumBalance: 0, requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        );
        expect(result.adjustment).toMatchObject({ amount: 12.5, balanceBefore: 20, balanceAfter: 32.5, operation: "credit" });
        expect(result.member.dailyPoints).toBe(5);
    });

    it("rejects malformed adjustment input before touching persistence", async () => {
        await expect(adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 1.234, reason: "", idempotencyKey: "" })).rejects.toMatchObject({ status: 400 });
        expect(mocks.createSchoolDomainRepository).not.toHaveBeenCalled();
    });

    it("rejects an adjustment above the wallet limit before touching persistence", async () => {
        await expect(adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 1_000_001, reason: "超限", idempotencyKey: "adjust-over-limit" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.withJsonDataFileLocks).not.toHaveBeenCalled();
        expect(mocks.withPostgresTransaction).not.toHaveBeenCalled();
    });

    it("builds the PostgreSQL response before the transaction commits", async () => {
        let committed = false;
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.createPostgresRepositories.mockReturnValue({
            users: {
                getById: vi.fn().mockResolvedValue({ id: "user-1", status: "active" }),
                getPublicDetails: vi.fn().mockImplementation(async () => {
                    expect(committed).toBe(false);
                    return [{ user: { id: "user-1" }, planId: "free", planName: "Free", hasActivePlan: false, permanentPoints: 32.5, dailyPoints: 5 }];
                }),
            },
        });
        mocks.adjustPermanentPointsInPostgresTransaction.mockResolvedValue({
            record: { id: "record-1", type: "admin-adjust", amount: 12.5, permanentAmount: 12.5, permanentBalanceAfter: 32.5, description: "合同额度修正", createdAt: "2026-09-01T00:00:00.000Z" },
            snapshot: { permanentPoints: 32.5, dailyPoints: 5, totalPoints: 37.5, dailyDate: "2026-09-01", dailyExpiresAt: "2026-09-01T15:59:59.000Z" },
            applied: true,
        });
        mocks.withPostgresTransaction.mockImplementation(async (callback: (client: unknown) => unknown) => {
            const result = await callback({});
            committed = true;
            return result;
        });
        mocks.createSchoolDomainRepository.mockReturnValue({ getSchool: vi.fn().mockResolvedValue({ id: "school-1", name: "甲学校" }), getMembership: vi.fn().mockResolvedValue(membership) });
        mocks.toPublicUser.mockReturnValue(user("user-1", { permanentPointsBalance: 32.5, pointsBalance: 37.5 }));

        const result = await adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-pg-1" });

        expect(committed).toBe(true);
        expect(result.member.permanentPoints).toBe(32.5);
        expect(mocks.getPublicUsersByIds).not.toHaveBeenCalled();
    });

    it("rolls back the PostgreSQL transaction when the response member cannot be loaded", async () => {
        const committed = false;
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.createPostgresRepositories.mockReturnValue({
            users: {
                getById: vi.fn().mockResolvedValue({ id: "user-1", status: "active" }),
                getPublicDetails: vi.fn().mockResolvedValue([]),
            },
        });
        mocks.adjustPermanentPointsInPostgresTransaction.mockResolvedValue({
            record: { id: "record-1", type: "admin-adjust", amount: 12.5, permanentAmount: 12.5, permanentBalanceAfter: 32.5, description: "合同额度修正", createdAt: "2026-09-01T00:00:00.000Z" },
            snapshot: { permanentPoints: 32.5, dailyPoints: 5, totalPoints: 37.5, dailyDate: "2026-09-01", dailyExpiresAt: "2026-09-01T15:59:59.000Z" },
            applied: true,
        });
        mocks.withPostgresTransaction.mockImplementation(async (callback: (client: unknown) => unknown) => {
            try {
                return await callback({});
            } catch (error) {
                expect(committed).toBe(false);
                throw error;
            }
        });
        mocks.createSchoolDomainRepository.mockReturnValue({ getSchool: vi.fn().mockResolvedValue({ id: "school-1", name: "甲学校" }), getMembership: vi.fn().mockResolvedValue(membership) });

        await expect(adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-pg-missing" })).rejects.toMatchObject({ status: 404 });
        expect(committed).toBe(false);
    });

    it("restores both file snapshots if persisting the wallet fails", async () => {
        const authBefore = { users: [user("user-1")], pointRecords: [], dailyPlanPointWallets: [], settings: {} };
        const schoolBefore = { version: 1, schools: [{ id: "school-1" }] };
        mocks.readJsonDataFile.mockImplementation(async (name: string) => (name === "auth.json" ? authBefore : schoolBefore));
        mocks.mutateFileSchoolDomainInsideLock.mockImplementation(async (callback: (repository: unknown) => unknown) => callback(mocks.createSchoolDomainRepository()));
        mocks.adjustPermanentPointsInAuthDb.mockReturnValue({
            record: { id: "record-1", type: "admin-adjust", amount: 12.5, permanentAmount: 12.5, permanentBalanceAfter: 32.5, description: "合同额度修正", createdAt: "2026-09-01T00:00:00.000Z" },
            snapshot: { permanentPoints: 32.5, dailyPoints: 5, totalPoints: 37.5 },
            applied: true,
        });
        mocks.writeAuthDb.mockRejectedValueOnce(new Error("persist failed"));

        await expect(adjustSchoolMemberPointsByAdmin("admin-1", "school-1", "membership-1", { operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-file-rollback" })).rejects.toThrow("persist failed");
        expect(mocks.writeJsonDataFile).toHaveBeenCalledWith("auth.json", authBefore);
        expect(mocks.writeJsonDataFile).toHaveBeenCalledWith("school-domain.json", schoolBefore);
    });
});
