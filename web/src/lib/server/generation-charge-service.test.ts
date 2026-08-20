import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "postgres",
    consumeUserPoints: vi.fn(),
    getAuthSettings: vi.fn(),
    refundUserPoints: vi.fn(),
    withPostgresTransaction: vi.fn(),
    compute: {
        transact: vi.fn(),
        lockOperation: vi.fn(),
        listConsumptionsForGeneration: vi.fn(),
        getGroup: vi.fn(),
        getGroupMember: vi.fn(),
        getGroupProjectByProject: vi.fn(),
        listSpendableAdvances: vi.fn(),
        consumeGroupSchoolPoints: vi.fn(),
        updatePersonalAdvance: vi.fn(),
        insertConsumption: vi.fn(),
        refundGroupSchoolPoints: vi.fn(),
        getPersonalAdvance: vi.fn(),
        updateConsumption: vi.fn(),
    },
    school: { getCommercialOrder: vi.fn(), getSchoolContextByUserId: vi.fn() },
}));

vi.mock("@/lib/auth/store", () => ({ consumeUserPoints: mocks.consumeUserPoints, getAuthSettings: mocks.getAuthSettings, refundUserPoints: mocks.refundUserPoints }));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => mocks.provider, withPostgresTransaction: mocks.withPostgresTransaction }));
vi.mock("./school-compute-repository", () => ({ createSchoolComputeRepository: () => mocks.compute }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.school }));

import { chargeGeneration, refundGenerationCharge } from "./generation-charge-service";

const billingContext = { schoolId: "school-a", groupId: "group-a", orderId: "order-a", projectType: "canvas" as const, projectId: "canvas-a" };
const input = { userId: "student-a", amount: 5, units: 1, usageKind: "image" as const, model: "image-model", idempotencyKey: "generation-a", requestFingerprint: "fingerprint-a", billingContext };

describe("generation charge service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "postgres";
        mocks.withPostgresTransaction.mockImplementation((operation: (executor: object) => unknown) => operation({}));
        mocks.compute.transact.mockImplementation((operation: (repository: typeof mocks.compute) => unknown) => operation(mocks.compute));
        mocks.compute.listConsumptionsForGeneration.mockResolvedValue([]);
        mocks.compute.getGroup.mockResolvedValue({ id: "group-a", schoolId: "school-a", status: "active", schoolPointsBalance: 3 });
        mocks.compute.getGroupMember.mockResolvedValue({ membershipId: "membership-a" });
        mocks.compute.getGroupProjectByProject.mockResolvedValue({ schoolId: "school-a", groupId: "group-a", orderId: "order-a" });
        mocks.compute.listSpendableAdvances.mockResolvedValue([{ id: "advance-a", remainingPoints: 4, consumedPoints: 0, returnedPoints: 0 }]);
        mocks.compute.consumeGroupSchoolPoints.mockResolvedValue({ schoolPointsBalance: 0 });
        mocks.compute.updatePersonalAdvance.mockImplementation(async (_id, patch) => ({ id: "advance-a", ...patch }));
        mocks.compute.insertConsumption.mockImplementation(async (record) => record);
        mocks.school.getSchoolContextByUserId.mockResolvedValue({ school: { id: "school-a", status: "active" }, membership: { id: "membership-a", status: "active" } });
        mocks.school.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "in_progress" });
        mocks.consumeUserPoints.mockResolvedValue({ recordId: "point-a", cost: 5, permanentRemaining: 4, dailyRemaining: 1 });
        mocks.getAuthSettings.mockResolvedValue({ modelPointCosts: { default: 1 }, logicalModels: [] });
        mocks.refundUserPoints.mockResolvedValue({ pointsBalance: 10 });
    });

    it("keeps ordinary generation on personal points", async () => {
        await expect(chargeGeneration({ ...input, billingContext: undefined })).resolves.toEqual({ receiptId: "points:point-a", sources: ["personal_points"], cost: 5, personalPointsRemaining: 5 });
        expect(mocks.consumeUserPoints).toHaveBeenCalledWith("student-a", "image-model", 5, "image", "generation-a", "fingerprint-a");
    });

    it("splits school points and personal advances atomically", async () => {
        const result = await chargeGeneration(input);
        expect(result).toMatchObject({ receiptId: "school:generation-a", sources: ["group_school_points", "group_personal_advance"], cost: 5 });
        expect(mocks.compute.consumeGroupSchoolPoints).toHaveBeenCalledWith("school-a", "group-a", 3, expect.objectContaining({ idempotencyKey: "generation:generation-a:school" }));
        expect(mocks.compute.updatePersonalAdvance).toHaveBeenCalledWith("advance-a", expect.objectContaining({ consumedPoints: 2, remainingPoints: 2 }));
        expect(mocks.compute.insertConsumption).toHaveBeenCalledTimes(2);
    });

    it("does not mutate either source when the combined balance is insufficient", async () => {
        mocks.compute.listSpendableAdvances.mockResolvedValue([{ id: "advance-a", remainingPoints: 1, consumedPoints: 0, returnedPoints: 0 }]);
        await expect(chargeGeneration(input)).rejects.toThrow("余额不足");
        expect(mocks.compute.consumeGroupSchoolPoints).not.toHaveBeenCalled();
        expect(mocks.compute.updatePersonalAdvance).not.toHaveBeenCalled();
    });

    it("returns the existing school receipt for a repeated generation id", async () => {
        mocks.compute.listConsumptionsForGeneration.mockResolvedValue([{ sourceType: "group_school_points", amount: 5, userId: "student-a", schoolId: "school-a", groupId: "group-a", orderId: "order-a", requestFingerprint: "fingerprint-a" }]);
        await expect(chargeGeneration(input)).resolves.toMatchObject({ receiptId: "school:generation-a", sources: ["group_school_points"] });
        expect(mocks.compute.consumeGroupSchoolPoints).not.toHaveBeenCalled();
    });

    it("refunds each school receipt source", async () => {
        mocks.compute.listConsumptionsForGeneration.mockResolvedValue([
            { id: "consumption-school", schoolId: "school-a", groupId: "group-a", orderId: "order-a", userId: "student-a", sourceType: "group_school_points", sourceId: "group-a", amount: 3, status: "charged" },
            { id: "consumption-advance", schoolId: "school-a", groupId: "group-a", orderId: "order-a", userId: "student-a", sourceType: "group_personal_advance", sourceId: "advance-a", amount: 2, status: "charged" },
        ]);
        mocks.compute.getPersonalAdvance.mockResolvedValue({ id: "advance-a", consumedPoints: 2, remainingPoints: 2, returnedPoints: 0 });
        await expect(refundGenerationCharge({ userId: "student-a", receiptId: "school:generation-a", model: "image-model", usageKind: "image", units: 1, idempotencyKey: "refund-a" })).resolves.toEqual({ refunded: true });
        expect(mocks.compute.refundGroupSchoolPoints).toHaveBeenCalledWith("school-a", "group-a", 3, expect.anything());
        expect(mocks.compute.updatePersonalAdvance).toHaveBeenCalledWith("advance-a", expect.objectContaining({ consumedPoints: 0, remainingPoints: 4, status: "active" }));
        expect(mocks.compute.updateConsumption).toHaveBeenCalledTimes(2);
    });
});
