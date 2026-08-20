import { describe, expect, it } from "vitest";

import { POSTGRESQL_SCHOOL_COMPUTE_SCHEMA_SQL } from "./schema-school-compute";

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
});
