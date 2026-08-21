import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    authBefore: { version: 1, marker: "auth-before" },
    schoolBefore: { version: 1, marker: "school-before" },
    computeBefore: { version: 1, marker: "compute-before" },
    authDb: {} as Record<string, unknown>,
    domain: { getMembership: vi.fn(), getCommercialOrder: vi.fn() },
    compute: { getGroup: vi.fn(), getGroupMember: vi.fn(), getPersonalAdvanceByPointRecordId: vi.fn(), insertPersonalAdvance: vi.fn() },
    readFile: vi.fn(),
    writeFile: vi.fn(),
    writeAuth: vi.fn(),
    withLocks: vi.fn(),
    mutateDomain: vi.fn(),
    mutateCompute: vi.fn(),
}));

vi.mock("./school-access-service", () => ({
    requireActiveSchoolContext: vi.fn().mockResolvedValue({ school: { id: "school-a", name: "甲校", status: "active" }, membership: { id: "membership-a", role: "student", permissions: [], status: "active" }, canManageSchool: false }),
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => "file", withPostgresTransaction: vi.fn() }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: vi.fn() }));
vi.mock("./school-compute-repository", () => ({ createSchoolComputeRepository: vi.fn() }));
vi.mock("./data-adapter", () => ({ readJsonDataFile: mocks.readFile, writeJsonDataFile: mocks.writeFile, withJsonDataFileLocks: mocks.withLocks }));
vi.mock("@/lib/auth/store-foundation", () => ({ AUTH_DATA_FILE: "auth.json", AuthInputError: class AuthInputError extends Error {}, QuotaExceededError: class QuotaExceededError extends Error {} }));
vi.mock("@/lib/auth/store-normalizers", () => ({
    emptyDb: vi.fn(() => ({})),
    normalizeDb: vi.fn(() => mocks.authDb),
    normalizePointAmount: (value: unknown, fallback: number) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : fallback),
    resolveDefaultPlan: vi.fn(),
    resolveUserPlan: vi.fn(),
}));
vi.mock("@/lib/auth/store-repository", () => ({ mutateAuthDb: vi.fn(), writeAuthDb: mocks.writeAuth }));
vi.mock("./school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: mocks.mutateDomain }));
vi.mock("./school-compute-file-repository", () => ({ SCHOOL_COMPUTE_DATA_FILE: "school-compute.json", mutateFileSchoolComputeInsideLock: mocks.mutateCompute }));

import { createPersonalAdvance } from "./school-compute-advance-service";

describe("file personal advance transaction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.authDb = {
            users: [{ id: "user-a", status: "active", planId: "free", pointsBalance: 20, updatedAt: "2026-08-20T00:00:00.000Z" }],
            dailyPlanPointWallets: [{ userId: "user-a", date: "2026-08-20", planId: "free", grantedPoints: 100, remainingPoints: 100, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" }],
            pointRecords: [],
            quotaUsage: [],
        };
        mocks.readFile.mockImplementation(async (name: string) => structuredClone(name === "auth.json" ? mocks.authBefore : name === "school-domain.json" ? mocks.schoolBefore : mocks.computeBefore));
        mocks.withLocks.mockImplementation(async (_names: string[], operation: () => Promise<unknown>) => operation());
        mocks.mutateDomain.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => operation(mocks.domain));
        mocks.mutateCompute.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => {
            await operation(mocks.compute);
            throw new Error("compute write failed");
        });
        mocks.domain.getMembership.mockResolvedValue({ id: "membership-a", schoolId: "school-a", userId: "user-a", status: "active" });
        mocks.domain.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "in_progress" });
        mocks.compute.getGroup.mockResolvedValue({ id: "group-a", schoolId: "school-a", status: "active" });
        mocks.compute.getGroupMember.mockResolvedValue({ id: "group-member-a", schoolId: "school-a", groupId: "group-a", membershipId: "membership-a", role: "member" });
        mocks.compute.getPersonalAdvanceByPointRecordId.mockResolvedValue(null);
        mocks.compute.insertPersonalAdvance.mockImplementation(async (record) => record);
        mocks.writeAuth.mockResolvedValue(undefined);
        mocks.writeFile.mockResolvedValue(undefined);
    });

    it("restores auth, school and compute snapshots when the compute write fails", async () => {
        await expect(createPersonalAdvance("user-a", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-file" })).rejects.toThrow("compute write failed");

        expect(mocks.writeAuth).toHaveBeenCalledOnce();
        expect((mocks.authDb.users as Array<{ pointsBalance: number }>)[0].pointsBalance).toBe(7.5);
        expect(mocks.writeFile).toHaveBeenCalledWith("auth.json", mocks.authBefore);
        expect(mocks.writeFile).toHaveBeenCalledWith("school-domain.json", mocks.schoolBefore);
        expect(mocks.writeFile).toHaveBeenCalledWith("school-compute.json", mocks.computeBefore);
    });

    it("matches the PostgreSQL behavior without changing the daily wallet", async () => {
        mocks.mutateCompute.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => operation(mocks.compute));
        const result = await createPersonalAdvance("user-a", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-file-success" });
        expect(result).toMatchObject({ originalPoints: 12.5, remainingPoints: 12.5, consumedPoints: 0 });
        expect((mocks.authDb.users as Array<{ pointsBalance: number }>)[0].pointsBalance).toBe(7.5);
        expect((mocks.authDb.dailyPlanPointWallets as Array<{ remainingPoints: number }>)[0].remainingPoints).toBe(100);
        expect((mocks.authDb.pointRecords as Array<{ permanentAmount: number; dailyAmount: number }>)[0]).toMatchObject({ permanentAmount: -12.5, dailyAmount: 0 });
    });
});
