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

    it("stores independent files, freezes published snapshots, and records downloads separately", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(ipPackage("file-ip", "public"));
        await repository.createIpContentFile({
            id: "file-text",
            ipId: "file-ip",
            kind: "text",
            originalName: "story.md",
            extension: ".md",
            mimeType: "text/markdown",
            byteSize: 12,
            sha256: "hash-text",
            storageProvider: "local",
            storageKey: "file-ip/file-text/original.md",
            extractedText: "# 故事",
            metadata: {},
            status: "ready",
            uploadedByUserId: "admin-a",
        });
        const draftVersion = await repository.createIpDraftVersion("file-ip", {
            id: "file-version",
            title: "第一版",
            summary: "版本简介",
            coverFileId: "file-text",
            tags: ["科幻"],
            sourceNote: "线下审核",
            changeNote: "初版",
            createdByUserId: "admin-a",
            items: [{ id: "file-item", kind: "text", category: "story_summary", title: "梗概", summary: "", fileId: "file-text", sortOrder: 0 }],
        });
        const updatedDraft = await repository.updateIpDraftVersion("file-ip", draftVersion.id, {
            id: draftVersion.id,
            title: "第一版修订",
            summary: "修订简介",
            coverFileId: "file-text",
            tags: ["科幻", "教学"],
            sourceNote: "线下审核",
            changeNote: "补充教学说明",
            createdByUserId: "admin-a",
            items: [{ id: "file-item-updated", kind: "text", category: "worldbuilding", title: "世界观", summary: "", fileId: "file-text", sortOrder: 0 }],
        });
        expect(updatedDraft).toMatchObject({ id: draftVersion.id, title: "第一版修订", tags: ["科幻", "教学"], items: [{ id: "file-item-updated", fileId: "file-text" }] });
        const published = await repository.publishIpVersion("file-ip", draftVersion.id);
        expect(published).toMatchObject({ coverFileId: "file-text", tags: ["科幻", "教学"], sourceNote: "线下审核", items: [{ fileId: "file-text" }] });
        await expect(repository.updateIpDraftVersion("file-ip", draftVersion.id, { ...updatedDraft, title: "覆盖发布版本" })).rejects.toThrow("草稿");
        await expect(repository.updateIpContentFile("file-ip", "file-text", { status: "failed", errorMessage: "不可覆盖" })).rejects.toThrow("已发布");

        const download = await repository.recordIpDownload({
            id: "download-a",
            ipId: "file-ip",
            versionId: "file-version",
            itemId: published.items[0]!.id,
            userId: "user-a",
            downloadType: "item",
            result: "succeeded",
        });
        expect(download).toMatchObject({ id: "download-a", itemId: published.items[0]!.id, downloadType: "item" });
        await expect(repository.listIpDownloads({ ipId: "file-ip", page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 1, items: [{ id: "download-a" }] });
    });

    it("keeps new school grants closed until member access is explicitly enabled", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(ipPackage("closed-ip", "school"));
        await repository.createIpContentFile({
            id: "closed-file",
            ipId: "closed-ip",
            kind: "text",
            originalName: "story.txt",
            extension: ".txt",
            mimeType: "text/plain",
            byteSize: 4,
            sha256: "hash-closed",
            storageProvider: "local",
            storageKey: "closed-ip/closed-file/original.txt",
            extractedText: "内容",
            metadata: {},
            status: "ready",
            uploadedByUserId: "admin-a",
        });
        await repository.createIpDraftVersion("closed-ip", {
            id: "closed-version",
            title: "第一版",
            summary: "",
            tags: [],
            sourceNote: "",
            changeNote: "",
            createdByUserId: "admin-a",
            items: [{ id: "closed-item", kind: "text", category: "story_summary", title: "梗概", summary: "", fileId: "closed-file", sortOrder: 0 }],
        });
        await repository.publishIpVersion("closed-ip", "closed-version");
        const grant = await repository.createSchoolGrant({ id: "closed-grant", ipId: "closed-ip", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" });

        expect(grant.memberAccessEnabled).toBe(false);
        await expect(repository.listVisibleIps({ userId: "user-a", schoolId: "school-a", scope: "school", at: now })).resolves.toMatchObject({ total: 0 });
        await repository.updateSchoolGrant("closed-ip", "closed-grant", { memberAccessEnabled: true, memberAccessUpdatedByUserId: "admin-a", memberAccessUpdatedAt: now, updatedAt: now });
        await expect(repository.listVisibleIps({ userId: "user-a", schoolId: "school-a", scope: "school", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "closed-ip" }] });
    });

    it("mirrors public and school visibility, immutable versions, and usage pagination", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(ipPackage("public-ip", "public"));
        await createReadyTextFile(repository, "public-ip", "public-file");
        await repository.createIpDraftVersion("public-ip", draft("public-version", "public-file"));
        await repository.publishIpVersion("public-ip", "public-version");
        await repository.createIpPackage(ipPackage("school-ip", "school"));
        await createReadyTextFile(repository, "school-ip", "school-file");
        await repository.createIpDraftVersion("school-ip", draft("school-version", "school-file"));
        await repository.publishIpVersion("school-ip", "school-version");
        await repository.createSchoolGrant({ id: "grant-a", ipId: "school-ip", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" });
        await repository.updateSchoolGrant("school-ip", "grant-a", { memberAccessEnabled: true, memberAccessUpdatedByUserId: "admin-a", memberAccessUpdatedAt: now, updatedAt: now });

        await expect(repository.listVisibleIps({ userId: "user-a", scope: "public", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "public-ip" }] });
        await expect(repository.listVisibleIps({ userId: "user-a", schoolId: "school-a", scope: "school", at: now })).resolves.toMatchObject({ total: 1, items: [{ id: "school-ip" }] });
        await expect(repository.getVisibleIp({ userId: "admin-a", schoolId: "school-b", ipId: "school-ip", at: now })).resolves.toBeNull();
        await expect(repository.createIpDraftVersion("school-ip", { ...draft("school-version", "school-file"), title: "重复版本" })).rejects.toThrow();

        const usage = { id: "usage-a", ipId: "school-ip", versionId: "school-version", itemIds: ["school-version-item"], schoolId: "school-a", userId: "user-a", action: "reference" as const, targetType: "practice" as const, targetId: "practice-a" };
        await repository.recordIpUsage(usage);
        await expect(repository.recordIpUsage(usage)).resolves.toMatchObject({ id: "usage-a" });
        await expect(repository.listIpUsage({ schoolId: "school-a", page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: "usage-a" }] });

        await expect(
            repository.recordIpUsages([
                { id: "usage-b", ipId: "school-ip", versionId: "school-version", itemIds: [], schoolId: "school-a", userId: "user-a", action: "reference", targetType: "canvas", targetId: "canvas-a" },
                { id: "usage-invalid", ipId: "school-ip", versionId: "missing-version", itemIds: [], schoolId: "school-a", userId: "user-a", action: "reference", targetType: "canvas", targetId: "canvas-a" },
            ]),
        ).rejects.toThrow("IP 内容项不存在");
        await expect(repository.listIpUsage({ schoolId: "school-a", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "usage-a" }] });
    });

    it("rejects overlapping exclusive or multi-school grants and stops access after revocation", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage(ipPackage("exclusive-ip", "school"));
        await createReadyTextFile(repository, "exclusive-ip", "exclusive-file");
        await repository.createIpDraftVersion("exclusive-ip", draft("exclusive-version", "exclusive-file"));
        await repository.publishIpVersion("exclusive-ip", "exclusive-version");
        await repository.createSchoolGrant({ id: "grant-exclusive", ipId: "exclusive-ip", schoolId: "school-a", mode: "exclusive", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" });

        await expect(repository.createSchoolGrant({ id: "grant-conflict", ipId: "exclusive-ip", schoolId: "school-b", mode: "exclusive", status: "active", startsAt: now, note: "", createdByUserId: "admin-a" })).rejects.toThrow("授权冲突");
        await repository.updateSchoolGrant("exclusive-ip", "grant-exclusive", { status: "revoked", updatedAt: "2026-08-19T01:00:00.000Z" });
        await expect(repository.getVisibleIp({ userId: "user-a", schoolId: "school-a", ipId: "exclusive-ip", at: "2026-08-19T02:00:00.000Z" })).resolves.toBeNull();
    });

    it("pages management records and protects grant-bound authorization settings", async () => {
        const repository = createFileIpLibraryRepository();
        await repository.createIpPackage({ ...ipPackage("managed-ip", "school"), coverAssetId: "cover-before" });
        await createReadyTextFile(repository, "managed-ip", "managed-file");
        await repository.createIpDraftVersion("managed-ip", draft("managed-version", "managed-file"));
        await repository.publishIpVersion("managed-ip", "managed-version");
        await repository.createSchoolGrant({ id: "managed-grant", ipId: "managed-ip", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: now, note: "管理端授权", createdByUserId: "admin-a" });

        await expect(repository.listIpPackages({ keyword: "managed", page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: "managed-ip", versionNumber: 1, itemCount: 1 }] });
        await expect(repository.listIpVersions("managed-ip", { page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: "managed-version", items: [{}] }] });
        await expect(repository.listSchoolGrants({ ipId: "managed-ip", page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ id: "managed-grant", schoolId: "school-a" }] });
        await expect(repository.listSchoolGrants({ schoolId: "school-a", grantId: "managed-grant", page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 1, items: [{ ipId: "managed-ip" }] });
        const updated = await repository.updateIpPackage("managed-ip", { title: "新名称", coverAssetId: null });
        expect(updated).toMatchObject({ title: "新名称" });
        expect(updated).toHaveProperty("coverAssetId", undefined);
        await expect(repository.updateIpPackage("managed-ip", { authorizationMode: "exclusive" })).resolves.toBeNull();
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

function draft(id: string, fileId: string) {
    return {
        id,
        title: id,
        summary: "",
        createdByUserId: "admin-a",
        tags: [],
        sourceNote: "",
        changeNote: "",
        items: [{ id: `${id}-item`, kind: "text" as const, category: "story_summary" as const, title: "梗概", summary: "", fileId, sortOrder: 0 }],
    };
}

async function createReadyTextFile(repository: ReturnType<typeof createFileIpLibraryRepository>, ipId: string, fileId: string) {
    await repository.createIpContentFile({
        id: fileId,
        ipId,
        kind: "text",
        originalName: `${fileId}.txt`,
        extension: ".txt",
        mimeType: "text/plain",
        byteSize: 4,
        sha256: `hash-${fileId}`,
        storageProvider: "local",
        storageKey: `${ipId}/${fileId}/original.txt`,
        extractedText: "内容",
        metadata: {},
        status: "ready",
        uploadedByUserId: "admin-a",
    });
}
