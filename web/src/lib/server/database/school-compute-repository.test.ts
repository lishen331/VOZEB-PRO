import { describe, expect, it } from "vitest";

import type { SchoolComputeLedgerRecord, SchoolComputePoolRecord, ProductionGroupRecord } from "../school-compute-repository";

const now = "2026-08-20T00:00:00.000Z";

const pool = (schoolId: string): SchoolComputePoolRecord => ({ schoolId, availablePoints: 0, status: "active", createdAt: now, updatedAt: now });
const group = (schoolId: string, id: string): ProductionGroupRecord => ({ id, schoolId, name: id, description: "", leaderMembershipId: `${id}-leader`, status: "active", schoolPointsBalance: 0, createdAt: now, updatedAt: now });
const ledger = (id: string, key: string, amount: number): SchoolComputeLedgerRecord => ({ id, schoolId: "school-a", type: "credit", amount, balanceAfter: amount, idempotencyKey: key, createdAt: now });

describe("school compute repository contract", () => {
    it("updates decimal balances without integer inference", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const rows: Record<string, unknown>[] = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text, values) => {
                if (text.includes("INSERT INTO school_compute_pools")) return { rows: [pool(String(values?.[0]))], rowCount: 1 } as never;
                if (text.includes("INSERT INTO school_production_groups")) return { rows: [group(String(values?.[1]), String(values?.[0]))], rowCount: 1 } as never;
                if (text.includes("UPDATE school_compute_pools") && text.includes("available_points = available_points +")) return { rows: [{ ...pool("school-a"), available_points: "12.50" }], rowCount: 1 } as never;
                if (text.includes("UPDATE school_compute_pools") && text.includes("available_points = available_points -")) return { rows: [{ ...pool("school-a"), available_points: "10.25" }], rowCount: 1 } as never;
                if (text.includes("UPDATE school_production_groups") && text.includes("school_points_balance =")) return { rows: [{ ...group("school-a", "group-a"), school_points_balance: "2.25" }], rowCount: 1 } as never;
                rows.push({ text, values });
                return { rows: [], rowCount: 0 } as never;
            },
        });
        await repository.upsertPool(pool("school-a"));
        await expect(repository.creditPool("school-a", 12.5, ledger("credit-a", "credit-a", 12.5))).resolves.toMatchObject({ availablePoints: 12.5 });
        await repository.insertGroup(group("school-a", "group-a"));
        await expect(repository.allocateToGroup("school-a", "group-a", 2.25, ledger("allocate-a", "allocate-a", -2.25))).resolves.toMatchObject({ group: { schoolPointsBalance: 2.25 } });
        expect(rows.some((entry) => String(entry.text).includes("::numeric"))).toBe(true);
    });

    it("requires explicit school scope for cross-tenant group lookup", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const repository = createPostgresSchoolComputeRepository({ query: async () => ({ rows: [], rowCount: 0 }) as never });
        await expect(repository.getGroup("school-b", "group-a")).resolves.toBeNull();
    });
});
