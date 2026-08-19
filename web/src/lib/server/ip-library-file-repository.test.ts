import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, unknown>();

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(files.has(name) ? files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => files.set(name, structuredClone(value))),
    withJsonDataFileLock: vi.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
    withJsonDataFileLocks: vi.fn(async (_names: string[], operation: () => Promise<unknown>) => operation()),
}));

import { createFileIpLibraryRepository } from "./ip-library-file-repository";

const now = "2026-08-19T00:00:00.000Z";

describe("file IP library repository", () => {
    beforeEach(() => {
        files.clear();
        files.set("auth.json", {
            users: [
                { id: "user-a", status: "active" },
                { id: "admin-a", status: "active", role: "admin" },
            ],
        });
        files.set("school-domain.json", {
            schools: [
                { id: "school-a", status: "active" },
                { id: "school-b", status: "active" },
            ],
            memberships: [
                { id: "member-a", userId: "user-a", schoolId: "school-a", status: "active" },
                { id: "admin-member-b", userId: "admin-a", schoolId: "school-b", status: "disabled" },
            ],
        });
    });

    it("mirrors public and school visibility, immutable versions, and usage pagination", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(ipPackage("public-ip", "public"));
        await repository.createIpDraftVersion("public-ip", draft("public-version"));
        await repository.publishIpVersion("public-ip", "public-version");
        await repository.createIpPackage(ipPackage("school-ip", "school"));
        await repository.createIpDraftVersion("school-ip", draft("school-version"));
        await repository.publishIpVersion("school-ip", "school-version");
        await repository.createSchoolGrant({ id: "grant-a", ipId: "school-ip", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" });

        await expect(repository.listVisibleIps({ userId: "user-a", scope: "public", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "public-ip" }] });
        await expect(repository.listVisibleIps({ userId: "user-a", schoolId: "school-a", scope: "school", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "school-ip" }] });
        await expect(repository.getVisibleIp({ userId: "admin-a", schoolId: "school-b", ipId: "school-ip", at: now })).resolves.toBeNull();
        await expect(repository.createIpDraftVersion("school-ip", { ...draft("school-version"), title: "重复版本" })).rejects.toThrow();

        await repository.recordIpUsage({ id: "usage-a", ipId: "school-ip", versionId: "school-version", itemIds: ["school-version-item"], schoolId: "school-a", userId: "user-a", action: "reference", targetType: "practice", targetId: "practice-a" });
        await expect(repository.listIpUsage({ schoolId: "school-a", page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: "usage-a" }] });
    });

    it("rejects overlapping exclusive or multi-school grants and stops access after revocation", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage({ ...ipPackage("exclusive-ip", "school"), authorizationMode: "exclusive" });
        await repository.createIpDraftVersion("exclusive-ip", draft("exclusive-version"));
        await repository.publishIpVersion("exclusive-ip", "exclusive-version");
        await repository.createSchoolGrant({ id: "grant-exclusive", ipId: "exclusive-ip", schoolId: "school-a", mode: "exclusive", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" });

        await expect(repository.createSchoolGrant({ id: "grant-conflict", ipId: "exclusive-ip", schoolId: "school-b", mode: "exclusive", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" })).rejects.toThrow("授权冲突");
        await repository.updateSchoolGrant("exclusive-ip", "grant-exclusive", { status: "revoked", updatedAt: "2026-08-19T01:00:00.000Z" });
        await expect(repository.getVisibleIp({ userId: "user-a", schoolId: "school-a", ipId: "exclusive-ip", at: "2026-08-19T02:00:00.000Z" })).resolves.toBeNull();
    });
});

function ipPackage(id: string, visibility: "public" | "school") {
    return {
        id,
        title: id,
        slug: id,
        summary: "",
        visibility,
        authorizationMode: "multi_school" as const,
        status: "draft" as const,
        createdByUserId: "admin-a",
    };
}

function draft(id: string) {
    return {
        id,
        title: id,
        summary: "",
        createdByUserId: "admin-a",
        items: [{ id: `${id}-item`, kind: "text" as const, category: "story_summary" as const, title: "梗概", summary: "", textContent: "内容", sortOrder: 0 }],
    };
}
