import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({ files: new Map<string, unknown>(), failNextSchoolWrite: false }));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => false),
    withPostgresTransaction: vi.fn(),
}));

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (fileName: string, fallback: unknown) => structuredClone(memory.files.has(fileName) ? memory.files.get(fileName) : fallback)),
    writeJsonDataFile: vi.fn(async (fileName: string, value: unknown) => {
        if (fileName === "school-domain.json" && memory.failNextSchoolWrite) {
            memory.failNextSchoolWrite = false;
            throw new Error("school write failed");
        }
        memory.files.set(fileName, structuredClone(value));
    }),
    withJsonDataFileLock: vi.fn(async (_fileName: string, operation: () => Promise<unknown>) => operation()),
    withJsonDataFileLocks: vi.fn(async (_fileNames: string[], operation: () => Promise<unknown>) => operation()),
}));

import { createOrdinaryUsersForSchool } from "./store";

const school = { id: "school-a", name: "甲学校", profile: {}, status: "active" as const, createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" };

describe("controlled school user provisioning", () => {
    beforeEach(() => {
        memory.files.clear();
        memory.failNextSchoolWrite = false;
    });

    it("creates an ordinary user and first manager membership together", async () => {
        const members = await createOrdinaryUsersForSchool("school-a", [{ username: "teacher_a", displayName: "老师", password: "password123", role: "teacher" }], { school, firstManager: true });

        expect(members).toEqual([expect.objectContaining({ accountId: "0001", username: "teacher_a", role: "teacher", permissions: ["school.manage"] })]);
        const auth = memory.files.get("auth.json") as { users: Array<{ role: string; passwordHash: string }> };
        const domain = memory.files.get("school-domain.json") as { schools: unknown[]; memberships: Array<{ userId: string; schoolId: string }> };
        expect(auth.users).toHaveLength(1);
        expect(auth.users[0]).toMatchObject({ role: "user", passwordHash: expect.not.stringContaining("password123") });
        expect(domain.schools).toHaveLength(1);
        expect(domain.memberships).toEqual([expect.objectContaining({ schoolId: "school-a" })]);
    });

    it("restores auth when the school file write fails", async () => {
        const authSnapshot = { version: 1, users: [], nextUserAccountId: 1 };
        memory.files.set("auth.json", authSnapshot);
        memory.failNextSchoolWrite = true;

        await expect(createOrdinaryUsersForSchool("school-a", [{ username: "teacher_a", displayName: "老师", password: "password123", role: "teacher" }], { school, firstManager: true })).rejects.toThrow("school write failed");
        expect(memory.files.get("auth.json")).toEqual(authSnapshot);
        expect(memory.files.get("school-domain.json")).toEqual({ version: 1 });
    });

    it("rejects duplicate identities before writing either file", async () => {
        await expect(
            createOrdinaryUsersForSchool(
                "school-a",
                [
                    { username: "teacher_a", email: "same@example.com", displayName: "老师", password: "password123", role: "teacher" },
                    { username: "TEACHER_A", email: "other@example.com", displayName: "重复", password: "password123", role: "student" },
                ],
                { school, firstManager: true },
            ),
        ).rejects.toThrow("重复");
        expect(memory.files.size).toBe(0);
    });
});
