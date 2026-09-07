import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<string, unknown>();
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(data.get(name) ?? fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => data.set(name, structuredClone(value))),
    withJsonDataFileLocks: vi.fn(async (_names: string[], operation: () => Promise<unknown>) => operation()),
}));

import { createFileIpLibraryRepository } from "./ip-library-file-repository";

const now = "2026-09-07T00:00:00.000Z";

describe("file IP library repository", () => {
    beforeEach(() => {
        data.clear();
        data.set("auth.json", {
            users: [
                { id: "admin", status: "active" },
                { id: "teacher", status: "active" },
            ],
        });
        data.set("school-domain.json", {
            schools: [
                { id: "school-a", status: "active" },
                { id: "school-b", status: "active" },
            ],
            memberships: [{ id: "member-a", userId: "teacher", schoolId: "school-a", status: "active" }],
        });
    });

    it("shows a saved public child immediately and keeps each item child scoped", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(packageInput("public-ip", "public"));
        await repository.createIpSubIp("public-ip", childInput("public-child", "public-ip"));
        await repository.createIpContentFile(fileInput("story-file", "public-ip", "public-child"));
        await repository.replaceIpSubIpItems("public-ip", "public-child", [{ id: "story-item", kind: "text", category: "story_summary", title: "故事梗概", summary: "", fileId: "story-file", sortOrder: 0 }]);

        await expect(repository.listVisibleIps({ userId: "teacher", scope: "public", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "public-ip", subIpCount: 1 }] });
        await expect(repository.getVisibleIp({ userId: "teacher", ipId: "public-ip", subIpId: "public-child", at: now })).resolves.toMatchObject({
            subIps: [{ id: "public-child", ipId: "public-ip", items: [{ id: "story-item", subIpId: "public-child" }] }],
        });
    });

    it("applies school grants directly to a child and blocks teachers after parent shutdown", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(packageInput("school-ip", "school"));
        await repository.createIpSubIp("school-ip", childInput("school-child", "school-ip"));
        await repository.createIpContentFile(fileInput("school-file", "school-ip", "school-child"));
        await repository.replaceIpSubIpItems("school-ip", "school-child", [{ id: "school-item", kind: "text", category: "worldbuilding", title: "世界观", summary: "", fileId: "school-file", sortOrder: 0 }]);
        await repository.createSchoolGrant({ id: "school-grant", ipId: "school-ip", subIpId: "school-child", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: now, note: "", createdByUserId: "admin" });
        await repository.createSchoolGrant({ id: "school-grant-b", ipId: "school-ip", subIpId: "school-child", schoolId: "school-b", mode: "multi_school", status: "active", startsAt: now, note: "", createdByUserId: "admin" });

        await expect(repository.listVisibleIps({ userId: "teacher", schoolId: "school-a", scope: "school", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "school-ip" }] });
        await expect(repository.listSchoolGrants({ subIpId: "school-child" })).resolves.toMatchObject({ total: 2 });
        await repository.updateIpPackage("school-ip", { status: "disabled" });
        await expect(repository.getVisibleIp({ userId: "teacher", schoolId: "school-a", ipId: "school-ip", at: now })).resolves.toBeNull();
        await expect(repository.listSchoolGrants({ schoolId: "school-a" })).resolves.toMatchObject({ items: [{ subIpId: "school-child" }] });
    });

    it("queues files when a parent is deleted and resets legacy version data", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(packageInput("delete-ip", "public"));
        await repository.createIpSubIp("delete-ip", childInput("delete-child", "delete-ip"));
        await repository.createIpContentFile(fileInput("delete-file", "delete-ip", "delete-child"));
        await repository.deleteIpPackage("delete-ip");
        await expect(repository.listIpFileCleanupQueue()).resolves.toMatchObject([{ id: "delete-file" }]);

        data.set("ip-library.json", { version: 2, files: [fileInput("legacy-file", "legacy-ip", "legacy-child")] });
        await expect(repository.listIpFileCleanupQueue()).resolves.toMatchObject([{ id: "legacy-file" }]);
        await expect(repository.listIpPackages()).resolves.toMatchObject({ total: 0 });
    });

    it("keeps the final child even when deletion reaches the repository lock", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(packageInput("single-child-ip", "public"));
        await repository.createIpSubIp("single-child-ip", childInput("only-child", "single-child-ip"));

        await expect(repository.deleteIpSubIp("single-child-ip", "only-child")).resolves.toBe("last-sub-ip");
        await expect(repository.getIpDetail("single-child-ip")).resolves.toMatchObject({ subIps: [{ id: "only-child" }] });
    });

    it("requires every file to belong to an existing child IP", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(packageInput("file-owner-ip", "public"));

        await expect(repository.createIpContentFile(fileInput("orphan-file", "file-owner-ip", ""))).rejects.toThrow("IP 或子 IP 不存在");
    });
});

function packageInput(id: string, visibility: "public" | "school") {
    return { id, title: id, slug: id, summary: "", visibility, status: "enabled" as const, createdByUserId: "admin" };
}
function childInput(id: string, ipId: string) {
    return { id, ipId, title: id, summary: "", tags: [], sourceNote: "", createdByUserId: "admin" };
}
function fileInput(id: string, ipId: string, subIpId: string) {
    return {
        id,
        ipId,
        subIpId,
        kind: "text" as const,
        originalName: `${id}.txt`,
        extension: ".txt",
        mimeType: "text/plain",
        byteSize: 4,
        sha256: `hash-${id}`,
        storageProvider: "local" as const,
        storageKey: `${ipId}/${id}/original.txt`,
        extractedText: "正文",
        metadata: {},
        status: "ready" as const,
        uploadedByUserId: "admin",
    };
}
