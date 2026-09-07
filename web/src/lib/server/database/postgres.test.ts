import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    query: vi.fn(),
    connect: vi.fn(),
    pool: vi.fn(),
}));

vi.mock("pg", () => ({
    Pool: mocks.pool,
}));

import { ensurePostgresSchema, initializePostgresSchema, postgresQuery, withPostgresTransaction } from "./postgres";

describe("PostgreSQL schema lifecycle", () => {
    beforeEach(() => {
        delete (globalThis as Record<string, unknown>).__vozebProPostgresPool;
        delete (globalThis as Record<string, unknown>).__vozebProPostgresSchemaReady;
        process.env.DATABASE_URL = "postgres://vozeb:test@localhost:5432/vozeb";
        delete process.env.VOZEB_PRO_DATABASE_SSL;
        delete process.env.VOZEB_PRO_DATABASE_SSL_CA;
        delete process.env.VOZEB_PRO_DATABASE_SSL_REJECT_UNAUTHORIZED;
        mocks.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
        mocks.connect.mockReset().mockResolvedValue({ query: mocks.query, release: vi.fn() });
        mocks.pool.mockReset().mockImplementation(function PoolMock() {
            return { query: mocks.query, connect: mocks.connect };
        });
    });

    it("verifies PostgreSQL TLS certificates by default and accepts an explicit CA", async () => {
        process.env.VOZEB_PRO_DATABASE_SSL = "1";
        process.env.VOZEB_PRO_DATABASE_SSL_CA = "-----BEGIN CERTIFICATE-----\\ncertificate\\n-----END CERTIFICATE-----";
        mocks.query.mockResolvedValueOnce({ rows: [{ table_name: null }] });

        await expect(ensurePostgresSchema()).rejects.toThrow("PostgreSQL schema has not been initialized");

        expect(mocks.pool).toHaveBeenCalledWith(
            expect.objectContaining({
                ssl: {
                    rejectUnauthorized: true,
                    ca: "-----BEGIN CERTIFICATE-----\ncertificate\n-----END CERTIFICATE-----",
                },
            }),
        );
    });

    it("only disables PostgreSQL certificate verification through an explicit override", async () => {
        process.env.VOZEB_PRO_DATABASE_SSL = "1";
        process.env.VOZEB_PRO_DATABASE_SSL_REJECT_UNAUTHORIZED = "0";
        mocks.query.mockResolvedValueOnce({ rows: [{ table_name: null }] });

        await expect(ensurePostgresSchema()).rejects.toThrow("PostgreSQL schema has not been initialized");

        expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: { rejectUnauthorized: false } }));
    });

    it("serializes concurrent repository queries on one transaction client", async () => {
        let active = false;
        const statements: string[] = [];
        const release = vi.fn();
        const clientQuery = vi.fn(async (statement: string) => {
            statements.push(statement);
            if (statement === "BEGIN" || statement === "COMMIT" || statement === "ROLLBACK") return { rows: [], rowCount: 0 };
            if (active) throw new Error("transaction client received concurrent queries");
            active = true;
            await new Promise((resolve) => setTimeout(resolve, 0));
            active = false;
            return { rows: [], rowCount: 0 };
        });
        mocks.connect.mockResolvedValue({ query: clientQuery, release });

        await withPostgresTransaction(async (client) => {
            await Promise.all([client.query("SELECT 1"), client.query("SELECT 2"), client.query("SELECT 3")]);
        });

        expect(statements).toEqual(["BEGIN", "SELECT 1", "SELECT 2", "SELECT 3", "COMMIT"]);
        expect(release).toHaveBeenCalledOnce();
    });

    it("does not execute schema DDL when an ordinary caller reaches an empty database", async () => {
        mocks.query.mockResolvedValueOnce({ rows: [{ table_name: null }] });

        await expect(ensurePostgresSchema()).rejects.toThrow("PostgreSQL schema has not been initialized");

        expect(mocks.query).toHaveBeenCalledTimes(1);
        expect(mocks.query.mock.calls[0]?.[0]).toContain("to_regclass");
        expect(mocks.query.mock.calls[0]?.[0]).not.toContain("CREATE TABLE");
    });

    it("prefixes SQL identifiers without rewriting ordinary string literals", async () => {
        await postgresQuery("SELECT 'users' AS target_type, $$users.read$$ AS permission FROM users WHERE action = 'users.read'");

        expect(mocks.query).toHaveBeenCalledWith("SELECT 'users' AS target_type, $$users.read$$ AS permission FROM vozeb_pro_users WHERE action = 'users.read'", undefined);
    });

    it("executes schema DDL only through explicit initialization", async () => {
        await initializePostgresSchema();

        expect(mocks.query).toHaveBeenCalledTimes(4);
        expect(mocks.query.mock.calls[0]?.[0]).toBe("BEGIN");
        expect(mocks.query.mock.calls[1]).toEqual(["SELECT pg_advisory_xact_lock(hashtext($1))", ["vozeb-pro:schema"]]);
        const ddl = String(mocks.query.mock.calls[2]?.[0]);
        expect(mocks.query.mock.calls[3]?.[0]).toBe("COMMIT");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_schema_migrations");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_generation_worker_heartbeats");
        expect(ddl).toContain("ALTER TABLE vozeb_pro_practice_sessions ADD COLUMN IF NOT EXISTS workflow_code text");
        expect(ddl).toContain("ALTER TABLE vozeb_pro_practice_sessions ADD COLUMN IF NOT EXISTS workflow_version integer");
        expect(ddl).toContain("ALTER TABLE vozeb_pro_practice_sessions ADD COLUMN IF NOT EXISTS workflow_config_fingerprint text");
        expect(ddl).toContain("ALTER TABLE vozeb_pro_practice_sessions ADD COLUMN IF NOT EXISTS workflow_adapter_version integer");
        expect(ddl).toContain("practice_sessions_module");
        expect(ddl.indexOf("ALTER TABLE vozeb_pro_practice_sessions ADD COLUMN IF NOT EXISTS workflow_code text")).toBeLessThan(ddl.indexOf("CREATE INDEX IF NOT EXISTS vozeb_pro_practice_sessions_user_updated_idx"));
        expect(ddl).toContain("CREATE SEQUENCE IF NOT EXISTS vozeb_pro_user_account_id_seq");
        expect(ddl).toContain("account_id bigint NOT NULL DEFAULT nextval('vozeb_pro_user_account_id_seq')");
        expect(ddl).toMatch(/SELECT setval\(\s*'vozeb_pro_user_account_id_seq'/);
        expect(ddl).toContain("users.read");
        expect(ddl).toContain("users.manage");
        expect(ddl).not.toContain("vozeb_pro_users.read");
        expect(ddl).not.toContain("vozeb_pro_users.manage");
        expect(ddl).toContain("terms_version text");
        expect(ddl).toContain("policy_accepted_at timestamptz");
        expect(ddl).toContain("mfa_secret_ciphertext text");
        expect(ddl).toContain("CONSTRAINT users_mfa_enabled_secret CHECK");
        expect(ddl).toContain("CONSTRAINT users_registration_consent_complete CHECK");
        expect(ddl).toContain("ALTER TABLE vozeb_pro_users ADD CONSTRAINT users_admin_permissions_array");
        expect(ddl).toContain("conname = 'vozeb_pro_local_media_assets_storage_provider_check'");
        expect(ddl).toContain("ADD CONSTRAINT vozeb_pro_local_media_assets_storage_provider_check CHECK");
        expect(ddl).toContain("conname = 'vozeb_pro_platform_courses_deleted_by_user_id_fkey'");
        expect(ddl).toContain("ADD CONSTRAINT vozeb_pro_platform_courses_deleted_by_user_id_fkey");
        expect(ddl).toContain("CREATE UNIQUE INDEX IF NOT EXISTS vozeb_pro_users_account_id_idx ON vozeb_pro_users (account_id)");
        expect(ddl).toContain("CREATE INDEX IF NOT EXISTS vozeb_pro_billing_orders_provider_payment_idx ON vozeb_pro_billing_orders (provider, provider_payment_id)");
        expect(ddl).toContain("webhook_secret_ciphertext text NOT NULL DEFAULT ''");
        expect(ddl).toContain("CREATE UNIQUE INDEX IF NOT EXISTS vozeb_pro_generation_tasks_channel_upstream_idx ON vozeb_pro_generation_tasks (channel_id, upstream_task_id)");
        expect(ddl).toContain("signature_timestamp timestamptz NOT NULL");
        expect(ddl).toContain("conflict_count integer NOT NULL DEFAULT 0");
        expect(ddl).toContain("user_id text NOT NULL REFERENCES vozeb_pro_users(id) ON DELETE CASCADE");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_account_deletion_requests");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_ip_content_files");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_ip_sub_ips");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_ip_file_cleanup_queue");
        expect(ddl).toContain("20260906_ip_library_sub_ip_reset");
        expect(ddl).toContain("20260907_ip_library_file_integrity");
        expect(ddl).toContain("DROP TABLE IF EXISTS vozeb_pro_ip_versions CASCADE");
        expect(ddl).toContain("'processing', 'ready', 'failed', 'deleting'");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_ip_download_records");
        expect(ddl).toContain("ADD CONSTRAINT vozeb_pro_ip_sub_ips_cover_file_fk FOREIGN KEY (cover_file_id) REFERENCES vozeb_pro_ip_content_files(id)");
        expect(ddl).toContain("file_id text NOT NULL REFERENCES vozeb_pro_ip_content_files(id) ON DELETE RESTRICT");
        expect(ddl).toContain("sub_ip_id text NOT NULL REFERENCES vozeb_pro_ip_sub_ips(id) ON DELETE CASCADE");
        expect(ddl).toContain("ip_content_files_sub_ip_ip_fk FOREIGN KEY (sub_ip_id, ip_id) REFERENCES vozeb_pro_ip_sub_ips(id, ip_id) ON DELETE CASCADE");
        expect(ddl).toContain("ip_items_file_sub_ip_fk FOREIGN KEY (file_id, sub_ip_id) REFERENCES vozeb_pro_ip_content_files(id, sub_ip_id) ON DELETE RESTRICT");
        expect(ddl).not.toContain("member_access_enabled");
        expect(ddl).not.toContain("vozeb_pro_ip_school_grants_sub_ip_ip_unique");
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_ip_usage_records");
        expect(ddl).toContain("'reference', 'download_item', 'download_package'");
        expect(ddl).toContain("'review_pending', 'reviewing', 'review_unavailable'");
        expect(ddl).toContain("task_type = 'agent' AND status = 'success' AND execution_phase IN ('review_pending', 'reviewing')");

        const tableNames = [...ddl.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z][a-z0-9_]*)/gi)].map((match) => match[1]).sort();
        expect(tableNames.length).toBeGreaterThanOrEqual(95);
        expect(tableNames.every((name) => name.startsWith("vozeb_pro_"))).toBe(true);
        expect(tableNames).not.toContain("vozeb_pro_check_ins");
        expect(tableNames).toEqual(
            expect.arrayContaining([
                "vozeb_pro_schools",
                "vozeb_pro_school_memberships",
                "vozeb_pro_school_invite_codes",
                "vozeb_pro_school_classes",
                "vozeb_pro_school_class_members",
                "vozeb_pro_platform_courses",
                "vozeb_pro_platform_course_chapters",
                "vozeb_pro_platform_course_lessons",
                "vozeb_pro_course_materials",
                "vozeb_pro_school_course_assignments",
                "vozeb_pro_school_course_offerings",
                "vozeb_pro_teaching_assignments",
                "vozeb_pro_teaching_submissions",
                "vozeb_pro_commercial_orders",
                "vozeb_pro_commercial_order_participants",
                "vozeb_pro_commercial_order_deliveries",
                "vozeb_pro_school_compute_pools",
                "vozeb_pro_school_compute_ledger_entries",
                "vozeb_pro_school_production_groups",
                "vozeb_pro_school_production_group_members",
                "vozeb_pro_school_compute_allocation_requests",
                "vozeb_pro_school_compute_group_projects",
                "vozeb_pro_school_compute_personal_advances",
                "vozeb_pro_school_compute_settlements",
                "vozeb_pro_school_compute_consumptions",
                "vozeb_pro_practice_sessions",
                "vozeb_pro_practice_copy_requests",
                "vozeb_pro_ip_packages",
                "vozeb_pro_ip_sub_ips",
                "vozeb_pro_ip_content_files",
                "vozeb_pro_ip_items",
                "vozeb_pro_ip_school_grants",
                "vozeb_pro_ip_usage_records",
                "vozeb_pro_ip_download_records",
            ]),
        );
        expect(ddl).toContain("production_group_id text");
        expect(ddl).toContain("commercial_orders_school_group_fk");
        expect(ddl).toContain("school_compute_group_projects_active_project_idx");
        expect(ddl).toContain("DROP TABLE IF EXISTS vozeb_pro_check_ins");
        expect(ddl).not.toContain("20260731_generation_task_recovery");

        const indexNames = [...ddl.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z][a-z0-9_]*)/gi)].map((match) => match[1]);
        expect(indexNames.length).toBeGreaterThan(0);
        expect(indexNames.every((name) => name.startsWith("vozeb_pro_"))).toBe(true);

        const uniqueConstraintNames = [...ddl.matchAll(/CONSTRAINT\s+([a-z][a-z0-9_]*)\s+UNIQUE\b/gi)].map((match) => match[1]);
        expect(uniqueConstraintNames.length).toBeGreaterThan(0);
        expect(uniqueConstraintNames.every((name) => name.startsWith("vozeb_pro_"))).toBe(true);
    });

    it("continues applying additive schema updates after the sentinel table exists", async () => {
        mocks.query.mockResolvedValueOnce({ rows: [{ table_name: "vozeb_pro_users" }] });

        await ensurePostgresSchema();

        expect(mocks.query).toHaveBeenCalledTimes(5);
        expect(mocks.query.mock.calls[0]?.[0]).toContain("to_regclass");
        expect(mocks.query.mock.calls[2]).toEqual(["SELECT pg_advisory_xact_lock(hashtext($1))", ["vozeb-pro:schema"]]);
        expect(mocks.query.mock.calls[3]?.[0]).toContain("CREATE TABLE IF NOT EXISTS vozeb_pro_schema_migrations");
    });
});
