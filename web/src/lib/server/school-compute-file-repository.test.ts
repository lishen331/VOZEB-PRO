import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, unknown>();

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(files.has(name) ? files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => files.set(name, structuredClone(value))),
    withJsonDataFileLock: vi.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
}));

import { createFileSchoolComputeRepository } from "./school-compute-file-repository";

const now = "2026-08-20T00:00:00.000Z";
const pool = (schoolId: string) => ({ schoolId, availablePoints: 0, status: "active" as const, createdAt: now, updatedAt: now });
const group = (schoolId: string, id: string) => ({ id, schoolId, name: id, description: "", leaderMembershipId: `${id}-leader`, status: "active" as const, schoolPointsBalance: 0, createdAt: now, updatedAt: now });
const entry = (id: string, key: string, amount: number) => ({ id, schoolId: "school-a", type: "credit", amount, balanceAfter: amount, idempotencyKey: key, createdAt: now });

describe("file school compute repository", () => {
    beforeEach(() => files.clear());

    it("keeps decimal balances, idempotency and tenant pagination", async () => {
        const repository = createFileSchoolComputeRepository();
        await repository.upsertPool(pool("school-a"));
        await repository.upsertPool(pool("school-b"));
        await repository.insertGroup(group("school-a", "group-a"));
        await repository.creditPool("school-a", 12.5, entry("credit-a", "same-key", 12.5));
        await repository.creditPool("school-a", 12.5, entry("credit-duplicate", "same-key", 12.5));
        await repository.allocateToGroup("school-a", "group-a", 2.25, entry("allocate-a", "allocate-a", -2.25));

        await expect(repository.getPool("school-a")).resolves.toMatchObject({ availablePoints: 10.25 });
        await expect(repository.getGroup("school-b", "group-a")).resolves.toBeNull();
        await expect(repository.listPools({ page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 2, pageSize: 1 });
        await expect(repository.listLedger("school-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 2 });
    });

    it("returns spendable personal advances in FIFO order", async () => {
        const repository = createFileSchoolComputeRepository();
        await repository.insertPersonalAdvance({
            id: "advance-2",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            membershipId: "member-a",
            userId: "user-a",
            originalPoints: 5,
            consumedPoints: 0,
            remainingPoints: 5,
            returnedPoints: 0,
            status: "active",
            pointRecordId: "point-2",
            createdAt: "2026-08-20T00:00:02.000Z",
            updatedAt: now,
        });
        await repository.insertPersonalAdvance({
            id: "advance-1",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            membershipId: "member-a",
            userId: "user-a",
            originalPoints: 4,
            consumedPoints: 0,
            remainingPoints: 4,
            returnedPoints: 0,
            status: "active",
            pointRecordId: "point-1",
            createdAt: "2026-08-20T00:00:01.000Z",
            updatedAt: now,
        });
        await expect(repository.listSpendableAdvances("school-a", "group-a", "order-a")).resolves.toMatchObject([{ id: "advance-1" }, { id: "advance-2" }]);
        await expect(repository.getPersonalAdvanceByPointRecordId("point-1")).resolves.toMatchObject({ id: "advance-1" });
    });

    it("finds one member inside the current school and group", async () => {
        const repository = createFileSchoolComputeRepository();
        await repository.insertGroup(group("school-a", "group-a"));
        await repository.replaceGroupMembers("school-a", "group-a", [{ id: "member-a", schoolId: "school-a", groupId: "group-a", membershipId: "membership-a", role: "member", createdAt: now, updatedAt: now }]);
        await expect(repository.getGroupMember("school-a", "group-a", "membership-a")).resolves.toMatchObject({ id: "member-a" });
        await expect(repository.getGroupMember("school-b", "group-a", "membership-a")).resolves.toBeNull();
    });

    it("targets settlement advances and settlement ids in file mode", async () => {
        const repository = createFileSchoolComputeRepository();
        await repository.insertPersonalAdvance({
            id: "advance-a",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            membershipId: "member-a",
            userId: "user-a",
            originalPoints: 5,
            consumedPoints: 2,
            remainingPoints: 3,
            returnedPoints: 0,
            status: "partially_consumed",
            pointRecordId: "point-a",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertSettlement({
            id: "settlement-a",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            status: "open",
            unusedPersonalPointsReturned: 0,
            consumedPersonalPointsPending: 0,
            confirmedPersonalPointsReturned: 0,
            createdAt: now,
            updatedAt: now,
        });
        await expect(repository.listPersonalAdvancesForOrders("school-a", ["order-a"])).resolves.toMatchObject([{ id: "advance-a" }]);
        await expect(repository.getSettlementById("school-a", "settlement-a")).resolves.toMatchObject({ id: "settlement-a" });
    });

    it("scopes project link lookup and deletion to the school and group", async () => {
        const repository = createFileSchoolComputeRepository();
        await repository.insertGroupProject({
            id: "link-a",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            projectType: "canvas",
            projectId: "canvas-a",
            createdByMembershipId: "membership-a",
            createdAt: now,
            updatedAt: now,
        });

        await expect(repository.getGroupProject("school-b", "group-a", "link-a")).resolves.toBeNull();
        await expect(repository.deleteGroupProject("school-b", "group-a", "link-a")).resolves.toBe(false);
        await expect(repository.getGroupProject("school-a", "group-a", "link-a")).resolves.toMatchObject({ id: "link-a" });
        await expect(repository.deleteGroupProject("school-a", "group-a", "link-a")).resolves.toBe(true);
        await expect(repository.getGroupProject("school-a", "group-a", "link-a")).resolves.toBeNull();
    });

    it("aggregates current pool, group and non-refunded school consumption balances", async () => {
        const repository = createFileSchoolComputeRepository();
        await repository.upsertPool(pool("school-a"));
        await repository.insertGroup(group("school-a", "group-a"));
        await repository.creditPool("school-a", 12.5, entry("credit-a", "credit-a", 12.5));
        await repository.allocateToGroup("school-a", "group-a", 2.25, entry("allocate-a", "allocate-a", -2.25));
        await repository.consumeGroupSchoolPoints("school-a", "group-a", 1, entry("consume-a", "consume-a", -1));
        await repository.insertConsumption({
            id: "consumption-a",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            generationTaskId: "task-a",
            requestFingerprint: "fingerprint-a",
            userId: "user-a",
            sourceType: "group_school_points",
            sourceId: "group-a",
            amount: 1,
            status: "charged",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertConsumption({
            id: "consumption-refunded",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            generationTaskId: "task-refunded",
            requestFingerprint: "fingerprint-refunded",
            userId: "user-a",
            sourceType: "group_school_points",
            sourceId: "group-a",
            amount: 5,
            status: "refunded",
            createdAt: now,
            updatedAt: now,
        });

        await expect(repository.getPoolMetrics("school-a")).resolves.toMatchObject({ schoolId: "school-a", totalPoints: 12.5, availablePoints: 10.25, allocatedPoints: 1.25, consumedPoints: 1 });
    });

    it("filters and pages missing pools as active using the school domain", async () => {
        files.set("school-domain.json", {
            version: 1,
            schools: [
                { id: "school-a", name: "学校 A", status: "active", updatedAt: now },
                { id: "school-b", name: "学校 B", status: "active", updatedAt: now },
            ],
        });
        const repository = createFileSchoolComputeRepository();
        await expect(repository.listPoolMetricsPage({ status: "active", keyword: "学校 B", page: 1, pageSize: 100 })).resolves.toMatchObject({ total: 1, items: [{ schoolId: "school-b", totalPoints: 0, status: "active" }] });
    });
});
