import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { initializePostgresSchema, postgresQuery } from "@/lib/server/database/postgres";
import { createOrdinaryUsersForSchool } from "./store";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const id = (value: string) => `school-user-${value}-${suffix}`;
const username = `school_user_${suffix.replaceAll("-", "").slice(0, 12)}`;
const now = "2026-08-17T00:00:00.000Z";

describe("PostgreSQL controlled school user provisioning", () => {
    beforeAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
    });

    afterAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        await postgresQuery("DELETE FROM schools WHERE id IN ($1, $2)", [id("school"), id("rolled-back-school")]);
        await postgresQuery("DELETE FROM users WHERE username = $1", [username]);
    });

    postgresIt("commits user and membership together and rolls both back on conflict", async () => {
        const school = { id: id("school"), name: "甲学校", profile: {}, status: "active" as const, createdAt: now, updatedAt: now };
        await expect(createOrdinaryUsersForSchool(school.id, [{ username, displayName: "老师", password: "password123", role: "teacher" }], { school, firstManager: true })).resolves.toEqual([
            expect.objectContaining({ username, role: "teacher", permissions: ["school.manage"] }),
        ]);

        const rolledBackSchool = { ...school, id: id("rolled-back-school"), name: "回滚学校" };
        await expect(createOrdinaryUsersForSchool(rolledBackSchool.id, [{ username, displayName: "重复老师", password: "password123", role: "teacher" }], { school: rolledBackSchool, firstManager: true })).rejects.toThrow("用户名已存在");
        await expect(postgresQuery<{ total: number }>("SELECT COUNT(*)::int AS total FROM schools WHERE id = $1", [rolledBackSchool.id])).resolves.toMatchObject({ rows: [{ total: 0 }] });
    });
});
