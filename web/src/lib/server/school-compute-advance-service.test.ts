import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const domain = { getMembership: vi.fn(), getCommercialOrder: vi.fn() };
    const compute = { getGroup: vi.fn(), getGroupMember: vi.fn(), getPersonalAdvanceByPointRecordId: vi.fn(), insertPersonalAdvance: vi.fn(), listPersonalAdvances: vi.fn() };
    return { domain, compute, requireContext: vi.fn(), mutatePostgres: vi.fn(), withPostgres: vi.fn(), provider: "postgres" };
});

vi.mock("./school-access-service", () => ({
    requireActiveSchoolContext: mocks.requireContext,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.domain }));
vi.mock("./school-compute-repository", () => ({ createSchoolComputeRepository: () => mocks.compute }));
vi.mock("./points-wallet-service", () => ({ mutatePermanentPointsInPostgresTransaction: mocks.mutatePostgres, mutatePermanentPointsInAuthDb: vi.fn() }));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => mocks.provider, withPostgresTransaction: mocks.withPostgres }));
vi.mock("./data-adapter", () => ({ readJsonDataFile: vi.fn(), writeJsonDataFile: vi.fn(), withJsonDataFileLocks: vi.fn() }));
vi.mock("@/lib/auth/store-foundation", () => ({ AUTH_DATA_FILE: "auth.json" }));
vi.mock("@/lib/auth/store-normalizers", () => ({ emptyDb: vi.fn(), normalizeDb: vi.fn() }));
vi.mock("@/lib/auth/store-repository", () => ({ writeAuthDb: vi.fn() }));
vi.mock("./school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: vi.fn() }));
vi.mock("./school-compute-file-repository", () => ({ SCHOOL_COMPUTE_DATA_FILE: "school-compute.json", mutateFileSchoolComputeInsideLock: vi.fn() }));

import { createPersonalAdvance, listOwnPersonalAdvances } from "./school-compute-advance-service";

const context = { school: { id: "school-a", name: "甲校", status: "active" }, membership: { id: "membership-a", role: "student", permissions: [], status: "active" }, canManageSchool: false };
const group = { id: "group-a", schoolId: "school-a", name: "短剧组", description: "", leaderMembershipId: "leader-a", status: "active", schoolPointsBalance: 0, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" };

describe("school compute personal advances", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "postgres";
        mocks.requireContext.mockResolvedValue(context);
        mocks.withPostgres.mockImplementation((operation: (executor: object) => unknown) => operation({}));
        mocks.domain.getMembership.mockResolvedValue({ id: "membership-a", schoolId: "school-a", userId: "user-a", status: "active" });
        mocks.domain.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "in_progress" });
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.compute.getGroupMember.mockResolvedValue({ id: "group-member-a", schoolId: "school-a", groupId: "group-a", membershipId: "membership-a", role: "member" });
        mocks.compute.getPersonalAdvanceByPointRecordId.mockResolvedValue(null);
        mocks.mutatePostgres.mockResolvedValue({ applied: true, record: { id: "point-record-a" }, snapshot: { permanentPoints: 7.5, dailyPoints: 100 } });
        mocks.compute.insertPersonalAdvance.mockImplementation(async (record) => record);
        mocks.compute.listPersonalAdvances.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("creates a 12.5 permanent-point advance for a valid group order", async () => {
        const result = await createPersonalAdvance("user-a", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-a" });
        expect(mocks.mutatePostgres).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "user-a", amount: -12.5, recordType: "consume", model: "school-compute", idempotencyKey: "school-compute-advance:advance-a" }));
        expect(result).toMatchObject({ groupId: "group-a", orderId: "order-a", membershipId: "membership-a", originalPoints: 12.5, remainingPoints: 12.5, consumedPoints: 0 });
    });

    it("returns the existing advance for a repeated idempotency key", async () => {
        const existing = {
            id: "advance-existing",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            membershipId: "membership-a",
            userId: "user-a",
            originalPoints: 12.5,
            consumedPoints: 0,
            remainingPoints: 12.5,
            returnedPoints: 0,
            status: "active",
            pointRecordId: "point-record-a",
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
        };
        mocks.mutatePostgres.mockResolvedValue({ applied: false, record: { id: "point-record-a" }, snapshot: { permanentPoints: 7.5, dailyPoints: 100 } });
        mocks.compute.getPersonalAdvanceByPointRecordId.mockResolvedValue(existing);
        await expect(createPersonalAdvance("user-a", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-a" })).resolves.toMatchObject({ id: "advance-existing" });
        expect(mocks.compute.insertPersonalAdvance).not.toHaveBeenCalled();
    });

    it("rejects a non-member and a mismatched order", async () => {
        mocks.compute.getGroupMember.mockResolvedValueOnce(null);
        await expect(createPersonalAdvance("user-a", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-member" })).rejects.toThrow("制作小组成员");
        mocks.compute.getGroupMember.mockResolvedValue({ id: "member-a", membershipId: "membership-a" });
        mocks.domain.getCommercialOrder.mockResolvedValueOnce({ id: "order-b", assignedSchoolId: "school-a", productionGroupId: "group-b", status: "in_progress" });
        await expect(createPersonalAdvance("user-a", "group-a", { orderId: "order-b", amount: 12.5, idempotencyKey: "advance-order" })).rejects.toThrow("商单");
    });

    it("hides groups and orders outside the current school", async () => {
        mocks.compute.getGroup.mockResolvedValueOnce(null);
        await expect(createPersonalAdvance("user-a", "group-b", { orderId: "order-b", amount: 12.5, idempotencyKey: "advance-school" })).rejects.toThrow("制作小组不存在");
        mocks.domain.getCommercialOrder.mockResolvedValueOnce({ id: "order-b", assignedSchoolId: "school-b", productionGroupId: "group-a", status: "in_progress" });
        await expect(createPersonalAdvance("user-a", "group-a", { orderId: "order-b", amount: 12.5, idempotencyKey: "advance-order-school" })).rejects.toThrow("商单");
    });

    it("lists only the current membership advances", async () => {
        await listOwnPersonalAdvances("user-a", "group-a", { page: 2, pageSize: 10 });
        expect(mocks.compute.listPersonalAdvances).toHaveBeenCalledWith("school-a", "group-a", { page: 2, pageSize: 10, membershipId: "membership-a" });
    });
});
