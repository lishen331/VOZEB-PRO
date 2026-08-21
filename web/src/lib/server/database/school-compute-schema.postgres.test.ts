import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { POSTGRESQL_SCHOOL_COMPUTE_SCHEMA_SQL } from "./schema-school-compute";
import { initializePostgresSchema, postgresQuery } from "./postgres";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const ids = {
    schoolA: `school-compute-schema-a-${suffix}`,
    schoolB: `school-compute-schema-b-${suffix}`,
    userA: `school-compute-schema-user-a-${suffix}`,
    userB: `school-compute-schema-user-b-${suffix}`,
    membershipA: `school-compute-schema-membership-a-${suffix}`,
    membershipB: `school-compute-schema-membership-b-${suffix}`,
    groupA: `school-compute-schema-group-a-${suffix}`,
    orderA: `school-compute-schema-order-a-${suffix}`,
};

describe("PostgreSQL school compute schema", () => {
    it("defines the nine school compute tables and cross-school safeguards", () => {
        const sql = POSTGRESQL_SCHOOL_COMPUTE_SCHEMA_SQL;
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_pools");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_ledger_entries");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_production_groups");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_production_group_members");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_allocation_requests");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_group_projects");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_personal_advances");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_settlements");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS school_compute_consumptions");
        expect(sql).toContain("numeric(18, 2)");
        expect(sql).toContain("CHECK (available_points >= 0)");
        expect(sql).toContain("FOREIGN KEY (school_id, group_id)");
        expect(sql).toContain("CHECK (consumed_points + remaining_points + returned_points = original_points)");
        expect(sql).toContain("order_id text NOT NULL");
        expect(sql).toContain("school_compute_group_projects_active_project_idx");
        expect(sql).toContain("ALTER TABLE commercial_orders ADD COLUMN IF NOT EXISTS production_group_id text");
        expect(sql).toContain("commercial_orders_school_group_fk");
    });

    postgresIt("enforces school-scoped balances, relationships, and required orders", async () => {
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
        await postgresQuery("INSERT INTO users (id, username, display_name, password_hash) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)", [
            ids.userA,
            `school_compute_schema_a_${suffix.replaceAll("-", "").slice(0, 12)}`,
            "算力 Schema 用户 A",
            "integration-test-only",
            ids.userB,
            `school_compute_schema_b_${suffix.replaceAll("-", "").slice(0, 12)}`,
            "算力 Schema 用户 B",
            "integration-test-only",
        ]);
        await postgresQuery("INSERT INTO schools (id, name) VALUES ($1, $2), ($3, $4)", [ids.schoolA, "算力 Schema 学校 A", ids.schoolB, "算力 Schema 学校 B"]);
        await postgresQuery("INSERT INTO school_memberships (id, school_id, user_id, role) VALUES ($1, $2, $3, 'teacher'), ($4, $5, $6, 'student')", [ids.membershipA, ids.schoolA, ids.userA, ids.membershipB, ids.schoolB, ids.userB]);
        await postgresQuery("INSERT INTO commercial_orders (id, title, assigned_school_id, status) VALUES ($1, $2, $3, 'assigned')", [ids.orderA, "算力 Schema 商单", ids.schoolA]);
        await postgresQuery("INSERT INTO school_production_groups (id, school_id, name, leader_membership_id) VALUES ($1, $2, $3, $4)", [ids.groupA, ids.schoolA, "算力 Schema 小组", ids.membershipA]);

        const tables = await postgresQuery<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'vozeb_pro_school_compute_%' ORDER BY table_name");
        expect(tables.rows.map((row) => row.table_name)).toEqual(
            expect.arrayContaining([
                "vozeb_pro_school_compute_pools",
                "vozeb_pro_school_compute_ledger_entries",
                "vozeb_pro_school_compute_allocation_requests",
                "vozeb_pro_school_compute_group_projects",
                "vozeb_pro_school_compute_personal_advances",
                "vozeb_pro_school_compute_settlements",
                "vozeb_pro_school_compute_consumptions",
            ]),
        );
        await expect(postgresQuery("INSERT INTO school_compute_pools (school_id, available_points) VALUES ($1, $2)", [ids.schoolA, -1])).rejects.toMatchObject({ code: "23514" });
        await postgresQuery("INSERT INTO school_compute_pools (school_id, available_points) VALUES ($1, $2)", [ids.schoolA, 12.5]);
        await expect(
            postgresQuery("INSERT INTO commercial_orders (id, title, assigned_school_id, production_group_id, status) VALUES ($1, $2, $3, $4, 'assigned')", [`cross-school-order-${suffix}`, "跨校绑定", ids.schoolB, ids.groupA]),
        ).rejects.toMatchObject({ code: "23503" });
        await expect(postgresQuery("INSERT INTO school_production_groups (id, school_id, name, leader_membership_id) VALUES ($1, $2, $3, $4)", [`cross-school-group-${suffix}`, ids.schoolA, "跨校组长", ids.membershipB])).rejects.toMatchObject({
            code: "23503",
        });

        await postgresQuery("DELETE FROM school_compute_pools WHERE school_id = $1", [ids.schoolA]);
        await postgresQuery("DELETE FROM school_production_groups WHERE id = $1", [ids.groupA]);
        await postgresQuery("DELETE FROM commercial_orders WHERE id = $1", [ids.orderA]);
        await postgresQuery("DELETE FROM school_memberships WHERE id IN ($1, $2)", [ids.membershipA, ids.membershipB]);
        await postgresQuery("DELETE FROM schools WHERE id IN ($1, $2)", [ids.schoolA, ids.schoolB]);
        await postgresQuery("DELETE FROM users WHERE id IN ($1, $2)", [ids.userA, ids.userB]);
    });
});
