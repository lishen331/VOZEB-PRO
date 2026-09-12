import { describe, expect, it, vi } from "vitest";

import { PRACTICE_CLEANUP_TABLES, buildPracticeCleanupStatements } from "./practice-tenant-cleanup";

describe("practice tenant cleanup contract", () => {
    it("limits cleanup to practice projects, sessions, tasks, logs, scripts and IP usage", () => {
        const statements = buildPracticeCleanupStatements();
        const sql = statements.join("\n");

        expect(PRACTICE_CLEANUP_TABLES).toEqual(expect.arrayContaining(["canvas_projects", "drama_projects", "practice_sessions", "practice_script_projects", "generation_tasks", "generation_logs", "ip_usage_records"]));
        expect(sql).toContain("execution_profile = 'open-source-practice'");
        expect(sql).toContain("target_type = 'practice'");
        expect(sql).not.toMatch(/DELETE FROM (canvas_projects|drama_projects|generation_tasks|generation_logs)\s*;/i);
        expect(sql).not.toMatch(/WHERE\s+user_id\s*=\s*\$1\s*;/i);
    });

    it("deletes log assets before practice logs and leaves local media for reference-aware cleanup", () => {
        const statements = buildPracticeCleanupStatements();
        const assetsIndex = statements.findIndex((statement) => statement.includes("DELETE FROM generation_log_assets"));
        const logsIndex = statements.findIndex((statement) => statement.includes("DELETE FROM generation_logs"));

        expect(assetsIndex).toBeGreaterThanOrEqual(0);
        expect(logsIndex).toBeGreaterThan(assetsIndex);
        expect(statements.join("\n")).not.toContain("DELETE FROM local_media_assets");
    });
});
