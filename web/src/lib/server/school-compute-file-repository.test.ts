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
    });
});
