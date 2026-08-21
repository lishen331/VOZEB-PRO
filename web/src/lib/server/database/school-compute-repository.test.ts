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

    it("scopes project link lookup and deletion to the school and group", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const queries: Array<{ text: string; values?: unknown[] }> = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text, values) => {
                queries.push({ text, values });
                if (text.startsWith("SELECT * FROM school_compute_group_projects")) {
                    return {
                        rows: [
                            {
                                id: "link-a",
                                school_id: "school-a",
                                group_id: "group-a",
                                order_id: "order-a",
                                project_type: "canvas",
                                project_id: "canvas-a",
                                created_by_membership_id: "membership-a",
                                created_at: now,
                                updated_at: now,
                            },
                        ],
                        rowCount: 1,
                    } as never;
                }
                return { rows: [], rowCount: text.startsWith("DELETE") ? 1 : 0 } as never;
            },
        });

        await expect(repository.getGroupProject("school-a", "group-a", "link-a", true)).resolves.toMatchObject({ id: "link-a" });
        await expect(repository.deleteGroupProject("school-a", "group-a", "link-a")).resolves.toBe(true);

        expect(queries[0]).toMatchObject({ values: ["school-a", "group-a", "link-a"] });
        expect(queries[0]?.text).toContain("school_id = $1 AND group_id = $2 AND id = $3");
        expect(queries[0]?.text).toContain("FOR UPDATE");
        expect(queries[1]).toMatchObject({ values: ["school-a", "group-a", "link-a"] });
    });

    it("aggregates pool metrics with targeted SQL and serializes idempotent balance changes", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const queries: string[] = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text) => {
                queries.push(text);
                if (text.includes("AS total_points")) {
                    return {
                        rows: [{ school_id: "school-a", available_points: "7.25", allocated_points: "3.25", consumed_points: "2.00", total_points: "12.50", status: "active", updated_at: now }],
                        rowCount: 1,
                    } as never;
                }
                if (text.includes("UPDATE school_compute_pools")) return { rows: [{ school_id: "school-a", available_points: "12.50", status: "active", created_at: now, updated_at: now }], rowCount: 1 } as never;
                return { rows: [], rowCount: 0 } as never;
            },
        });

        await expect(repository.getPoolMetrics("school-a")).resolves.toMatchObject({ totalPoints: 12.5, availablePoints: 7.25, allocatedPoints: 3.25, consumedPoints: 2 });
        await repository.creditPool("school-a", 12.5, ledger("credit-a", "same-credit", 12.5));

        const metricSql = queries.find((query) => query.includes("AS total_points")) || "";
        expect(metricSql).toContain("school_production_groups");
        expect(metricSql).toContain("school_compute_consumptions");
        expect(metricSql).toContain("source_type = 'group_school_points'");
        const lockIndex = queries.findIndex((query) => query.includes("pg_advisory_xact_lock"));
        const updateIndex = queries.findIndex((query) => query.includes("UPDATE school_compute_pools"));
        expect(lockIndex).toBeGreaterThanOrEqual(0);
        expect(updateIndex).toBeGreaterThan(lockIndex);
    });

    it("locks every idempotent balance mutation before applying its update", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const queries: Array<{ text: string; values?: unknown[] }> = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text, values) => {
                queries.push({ text, values });
                if (text.includes("UPDATE school_compute_pools")) return { rows: [{ school_id: "school-a", available_points: "20", status: "active", created_at: now, updated_at: now }], rowCount: 1 } as never;
                if (text.includes("UPDATE school_production_groups")) {
                    return {
                        rows: [{ id: "group-a", school_id: "school-a", name: "group-a", description: "", leader_membership_id: "leader-a", status: "active", school_points_balance: "5", created_at: now, updated_at: now }],
                        rowCount: 1,
                    } as never;
                }
                return { rows: [], rowCount: 0 } as never;
            },
        });
        const mutationEntry = (key: string, amount: number) => ledger(key, key, amount);

        await repository.creditPool("school-a", 1, mutationEntry("credit", 1));
        await repository.adjustPool("school-a", 1, mutationEntry("adjust", 1));
        await repository.allocateToGroup("school-a", "group-a", 1, mutationEntry("allocate", -1));
        await repository.releaseGroupPoints("school-a", "group-a", 1, mutationEntry("release", 1));
        await repository.consumeGroupSchoolPoints("school-a", "group-a", 1, mutationEntry("consume", -1));
        await repository.refundGroupSchoolPoints("school-a", "group-a", 1, mutationEntry("refund", 1));

        expect(queries.filter(({ text }) => text.includes("pg_advisory_xact_lock")).map(({ values }) => values?.[0])).toEqual(["credit", "adjust", "allocate", "release", "consume", "refund"]);
    });

    it("filters and pages pool metrics in SQL instead of scanning schools in the service", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const queries: Array<{ text: string; values?: unknown[] }> = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text, values) => {
                queries.push({ text, values });
                if (text.startsWith("WITH target_schools")) return { rows: [{ school_id: "school-a", available_points: "0", allocated_points: "0", consumed_points: "0", total_points: "0", status: "active", updated_at: now }], rowCount: 1 } as never;
                if (text.startsWith("SELECT COUNT(*)::int AS total FROM schools")) return { rows: [{ total: 1 }], rowCount: 1 } as never;
                return { rows: [], rowCount: 0 } as never;
            },
        });

        await expect(repository.listPoolMetricsPage({ status: "active", keyword: "学校", page: 1, pageSize: 100 })).resolves.toMatchObject({ total: 1, items: [{ schoolId: "school-a", status: "active" }] });
        expect(queries[0]?.text).toContain("FROM schools s");
        expect(queries[0]?.text).toContain("COALESCE(p.status, 'active') = $1");
        expect(queries[0]?.text).toContain("LIMIT $3 OFFSET $4");
        expect(queries[1]?.text).toContain("COUNT(*)");
    });

    it("targets and locks one group member and one advance point record", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const queries: Array<{ text: string; values?: unknown[] }> = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text, values) => {
                queries.push({ text, values });
                if (text.includes("school_production_group_members")) return { rows: [{ id: "member-a", school_id: "school-a", group_id: "group-a", membership_id: "membership-a", role: "member", created_at: now, updated_at: now }], rowCount: 1 } as never;
                return {
                    rows: [
                        {
                            id: "advance-a",
                            school_id: "school-a",
                            group_id: "group-a",
                            order_id: "order-a",
                            membership_id: "membership-a",
                            user_id: "user-a",
                            original_points: "12.50",
                            consumed_points: "0",
                            remaining_points: "12.50",
                            returned_points: "0",
                            status: "active",
                            point_record_id: "point-a",
                            created_at: now,
                            updated_at: now,
                        },
                    ],
                    rowCount: 1,
                } as never;
            },
        });

        await expect(repository.getGroupMember("school-a", "group-a", "membership-a", true)).resolves.toMatchObject({ id: "member-a" });
        await expect(repository.getPersonalAdvanceByPointRecordId("point-a", true)).resolves.toMatchObject({ id: "advance-a", originalPoints: 12.5 });
        expect(queries[0]).toMatchObject({ values: ["school-a", "group-a", "membership-a"] });
        expect(queries[1]).toMatchObject({ values: ["point-a"] });
        expect(queries.every(({ text }) => text.includes("FOR UPDATE"))).toBe(true);
    });

    it("loads settlement advances and consumptions with targeted lock queries", async () => {
        const { createPostgresSchoolComputeRepository } = await import("./school-compute-repository");
        const queries: Array<{ text: string; values?: unknown[] }> = [];
        const repository = createPostgresSchoolComputeRepository({
            query: async (text, values) => {
                queries.push({ text, values });
                return { rows: [], rowCount: 0 } as never;
            },
        });
        await repository.listPersonalAdvancesForOrders("school-a", ["order-a", "order-b"], true);
        await repository.listConsumptionsForOrderRecords("school-a", "order-a", true);
        await repository.getSettlementById("school-a", "settlement-a", true);
        expect(queries[0]).toMatchObject({ values: ["school-a", ["order-a", "order-b"]] });
        expect(queries[0]?.text).toContain("order_id = ANY($2::text[])");
        expect(queries[1]).toMatchObject({ values: ["school-a", "order-a"] });
        expect(queries[2]).toMatchObject({ values: ["school-a", "settlement-a"] });
        expect(queries.every(({ text }) => text.includes("FOR UPDATE"))).toBe(true);
    });
});
