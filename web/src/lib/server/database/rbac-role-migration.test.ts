import { describe, expect, it } from "vitest";

import { POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL } from "./schema-school-domain";

describe("RBAC builtin role migration", () => {
    it("uses the school-superadmin role for school administrator migration", () => {
        const ddl = POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL;
        expect(ddl).toContain("'school-superadmin', '学校超管'");
        expect(ddl).toContain("role_key = 'school-superadmin'");
        expect(ddl).toMatch(/school-admin/);
    });

    it("does not add a second platform role to an administrator during schema initialization", () => {
        const ddl = POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL;
        expect(ddl).toContain("rbac_user_role_bindings_platform_user_unique_idx");
        expect(ddl).toContain("row_number() OVER");
        expect(ddl).toContain("CASE WHEN role_key = 'platform-admin' THEN 1 ELSE 0 END");
        expect(ddl).toContain("AND NOT EXISTS (");
        expect(ddl).toContain("existing_binding.school_id IS NULL");
    });
});
