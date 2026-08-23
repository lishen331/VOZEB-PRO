import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "postgres",
    executor: { query: vi.fn() },
    requireManager: vi.fn(),
    withPostgres: vi.fn(),
    mutatePoints: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    domain: { getPlatformCommercialOrder: vi.fn() },
    compute: {
        lockOperation: vi.fn(),
        getGroup: vi.fn(),
        getSettlement: vi.fn(),
        getSettlementById: vi.fn(),
        insertSettlement: vi.fn(),
        updateSettlement: vi.fn(),
        listSettlements: vi.fn(),
        listPersonalAdvancesForOrders: vi.fn(),
        listConsumptionsForOrderRecords: vi.fn(),
        updatePersonalAdvance: vi.fn(),
        updateConsumption: vi.fn(),
        updateGroup: vi.fn(),
    },
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./school-access-service", () => ({
    requireSchoolManager: mocks.requireManager,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => mocks.provider, withPostgresTransaction: mocks.withPostgres }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.domain }));
vi.mock("./school-compute-repository", () => ({ createSchoolComputeRepository: () => mocks.compute }));
vi.mock("./points-wallet-service", () => ({ mutatePermanentPointsInPostgresTransaction: mocks.mutatePoints, mutatePermanentPointsInAuthDb: vi.fn() }));
vi.mock("./data-adapter", () => ({ readJsonDataFile: vi.fn(), writeJsonDataFile: vi.fn(), withJsonDataFileLocks: vi.fn() }));
vi.mock("@/lib/auth/store-foundation", () => ({ AUTH_DATA_FILE: "auth.json" }));
vi.mock("@/lib/auth/store-normalizers", () => ({ emptyDb: vi.fn(), normalizeDb: vi.fn() }));
vi.mock("@/lib/auth/store-repository", () => ({ writeAuthDb: vi.fn() }));
vi.mock("./school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: vi.fn() }));
vi.mock("./school-compute-file-repository", () => ({ SCHOOL_COMPUTE_DATA_FILE: "school-compute.json", mutateFileSchoolComputeInsideLock: vi.fn() }));

import { confirmConsumedAdvanceReturns, listGroupSettlements, openCommercialOrderSettlement } from "./school-compute-settlement-service";

const now = "2026-08-21T00:00:00.000Z";
const settlement = {
    id: "settlement-a",
    schoolId: "school-a",
    groupId: "group-a",
    orderId: "order-a",
    status: "pending_school_confirmation",
    unusedPersonalPointsReturned: 7,
    consumedPersonalPointsPending: 6,
    confirmedPersonalPointsReturned: 0,
    createdAt: now,
    updatedAt: now,
};
const advances = [
    {
        id: "advance-a",
        schoolId: "school-a",
        groupId: "group-a",
        orderId: "order-a",
        membershipId: "membership-a",
        userId: "user-a",
        originalPoints: 10,
        consumedPoints: 6,
        remainingPoints: 4,
        returnedPoints: 0,
        status: "partially_consumed",
        pointRecordId: "point-a",
        createdAt: now,
        updatedAt: now,
    },
    {
        id: "advance-b",
        schoolId: "school-a",
        groupId: "group-a",
        orderId: "order-a",
        membershipId: "membership-b",
        userId: "user-b",
        originalPoints: 3,
        consumedPoints: 0,
        remainingPoints: 3,
        returnedPoints: 0,
        status: "active",
        pointRecordId: "point-b",
        createdAt: now,
        updatedAt: now,
    },
];

describe("school compute settlement service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "postgres";
        mocks.withPostgres.mockImplementation((operation: (executor: typeof mocks.executor) => unknown) => operation(mocks.executor));
        mocks.requireManager.mockResolvedValue({ school: { id: "school-a" }, membership: { id: "manager-a" }, canManageSchool: true });
        mocks.domain.getPlatformCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "accepted" });
        mocks.compute.getGroup.mockResolvedValue({ id: "group-a", schoolId: "school-a", status: "active", schoolPointsBalance: 20 });
        mocks.compute.getSettlement.mockResolvedValue(null);
        mocks.compute.getSettlementById.mockResolvedValue(settlement);
        mocks.compute.listPersonalAdvancesForOrders.mockResolvedValue(advances.map((item) => ({ ...item })));
        mocks.compute.listConsumptionsForOrderRecords.mockResolvedValue([{ id: "consumption-a", status: "charged" }]);
        mocks.compute.insertSettlement.mockImplementation(async (record) => record);
        mocks.compute.updateSettlement.mockImplementation(async (_schoolId, _orderId, patch) => ({ ...settlement, ...patch }));
        mocks.compute.updatePersonalAdvance.mockImplementation(async (id, patch) => ({ ...advances.find((item) => item.id === id), ...patch }));
        mocks.compute.updateConsumption.mockResolvedValue({ id: "consumption-a", status: "settled" });
        mocks.mutatePoints.mockResolvedValue({ applied: true, record: { id: "credit-a" } });
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id, accountId: id === "user-a" ? "0007" : "0012", displayName: id === "user-a" ? "学生甲" : "学生乙" })));
    });

    it("returns unused points immediately and leaves consumed points pending", async () => {
        const result = await openCommercialOrderSettlement("order-a");
        expect(result).toMatchObject({ unusedPersonalPointsReturned: 7, consumedPersonalPointsPending: 6, confirmedPersonalPointsReturned: 0, status: "pending_school_confirmation" });
        expect(mocks.mutatePoints).toHaveBeenCalledWith(mocks.executor, expect.objectContaining({ userId: "user-a", amount: 4, recordType: "credit", idempotencyKey: expect.stringMatching(/^school-compute:settlement:.*:unused:advance-a$/) }));
        expect(mocks.mutatePoints).toHaveBeenCalledWith(mocks.executor, expect.objectContaining({ userId: "user-b", amount: 3, recordType: "credit", idempotencyKey: expect.stringMatching(/^school-compute:settlement:.*:unused:advance-b$/) }));
        expect(mocks.compute.updateConsumption).toHaveBeenCalledWith("consumption-a", "settled", expect.any(String));
        expect(mocks.compute.updateGroup).not.toHaveBeenCalled();
    });

    it("credits consumed points only after school confirmation and stays idempotent", async () => {
        mocks.compute.listPersonalAdvancesForOrders.mockResolvedValue([
            { ...advances[0], remainingPoints: 0, returnedPoints: 4, status: "pending_school_confirmation" },
            { ...advances[1], remainingPoints: 0, returnedPoints: 3, status: "returned" },
        ]);
        const result = await confirmConsumedAdvanceReturns("manager-user", "group-a", "settlement-a", { advanceIds: ["advance-a"] });
        expect(mocks.mutatePoints).toHaveBeenCalledWith(mocks.executor, expect.objectContaining({ userId: "user-a", amount: 6, recordType: "credit", idempotencyKey: "school-compute:settlement:settlement-a:consumed:advance-a" }));
        expect(result).toMatchObject({ status: "completed", consumedPersonalPointsPending: 0, confirmedPersonalPointsReturned: 6 });

        vi.clearAllMocks();
        mocks.requireManager.mockResolvedValue({ school: { id: "school-a" }, membership: { id: "manager-a" }, canManageSchool: true });
        mocks.withPostgres.mockImplementation((operation: (executor: typeof mocks.executor) => unknown) => operation(mocks.executor));
        mocks.compute.getSettlementById.mockResolvedValue({ ...settlement, status: "completed", consumedPersonalPointsPending: 0, confirmedPersonalPointsReturned: 6 });
        mocks.compute.listPersonalAdvancesForOrders.mockResolvedValue([{ ...advances[0], remainingPoints: 0, returnedPoints: 10, status: "returned" }]);
        mocks.compute.updateSettlement.mockImplementation(async (_schoolId, _orderId, patch) => ({ ...settlement, ...patch }));
        await confirmConsumedAdvanceReturns("manager-user", "group-a", "settlement-a", { advanceIds: ["advance-a"] });
        expect(mocks.mutatePoints).not.toHaveBeenCalled();
    });

    it("lists settlements with batched public account identities", async () => {
        mocks.compute.getGroup.mockResolvedValue({ id: "group-a", schoolId: "school-a" });
        mocks.compute.listSettlements.mockResolvedValue({ items: [settlement], total: 1, page: 1, pageSize: 20 });
        mocks.compute.listPersonalAdvancesForOrders.mockResolvedValue(advances);
        const result = await listGroupSettlements("manager-user", "group-a", { page: 1, pageSize: 20 });
        expect(result.items[0]).toMatchObject({
            advances: [
                { accountId: "0007", displayName: "学生甲" },
                { accountId: "0012", displayName: "学生乙" },
            ],
        });
        expect(mocks.compute.listPersonalAdvancesForOrders).toHaveBeenCalledOnce();
        expect(mocks.getPublicUsersByIds).toHaveBeenCalledWith(["user-a", "user-b"]);
    });

    it("rejects settlement unless the order is accepted", async () => {
        mocks.domain.getPlatformCommercialOrder.mockResolvedValueOnce({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "submitted" });
        await expect(openCommercialOrderSettlement("order-a")).rejects.toThrow("验收");
    });
});
