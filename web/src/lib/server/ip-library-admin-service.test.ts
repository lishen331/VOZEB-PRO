import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    getIpPackage: vi.fn(),
    getIpPackageBySlug: vi.fn(),
    createIpPackage: vi.fn(),
    createIpSubIp: vi.fn(),
    createIpContentFile: vi.fn(),
    getIpSubIp: vi.fn(),
    updateIpSubIp: vi.fn(),
    replaceIpSubIpItems: vi.fn(),
    findConflictingSchoolGrant: vi.fn(),
    createSchoolGrant: vi.fn(),
    listSchoolGrants: vi.fn(),
    updateSchoolGrant: vi.fn(),
    getIpContentFile: vi.fn(),
    listIpFileCleanupQueue: vi.fn(),
    removeIpFileCleanupQueueRecord: vi.fn(),
    deleteStoredIpContentFile: vi.fn(),
    readIpContentFile: vi.fn(),
    writeIpContentFile: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./ip-library-access-service", () => ({
    createIpLibraryRepository: () => ({
        getIpPackage: mocks.getIpPackage,
        getIpPackageBySlug: mocks.getIpPackageBySlug,
        createIpPackage: mocks.createIpPackage,
        createIpSubIp: mocks.createIpSubIp,
        createIpContentFile: mocks.createIpContentFile,
        getIpSubIp: mocks.getIpSubIp,
        updateIpSubIp: mocks.updateIpSubIp,
        replaceIpSubIpItems: mocks.replaceIpSubIpItems,
        findConflictingSchoolGrant: mocks.findConflictingSchoolGrant,
        createSchoolGrant: mocks.createSchoolGrant,
        listSchoolGrants: mocks.listSchoolGrants,
        updateSchoolGrant: mocks.updateSchoolGrant,
        getIpContentFile: mocks.getIpContentFile,
        listIpFileCleanupQueue: mocks.listIpFileCleanupQueue,
        removeIpFileCleanupQueueRecord: mocks.removeIpFileCleanupQueueRecord,
    }),
}));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => ({ listSchoolsByIds: vi.fn() }) }));
vi.mock("@/lib/server/ip-library-file-storage", () => ({ deleteStoredIpContentFile: mocks.deleteStoredIpContentFile, readIpContentFile: mocks.readIpContentFile, writeIpContentFile: mocks.writeIpContentFile }));

import { createAdminIp, createAdminIpGrant, createAdminIpSubIp, updateAdminIpGrant, updateAdminIpSubIp, uploadAdminIpFile } from "./ip-library-admin-service";

const now = "2026-09-07T00:00:00.000Z";
const packageRecord = { id: "ip-one", title: "星海计划", slug: "star-sea", summary: "简介", visibility: "school" as const, status: "enabled" as const, createdByUserId: "content-admin", createdAt: now, updatedAt: now };
const childRecord = { id: "child-one", ipId: "ip-one", title: "第一子 IP", summary: "", tags: [], sourceNote: "", sortOrder: 0, createdByUserId: "content-admin", createdAt: now, updatedAt: now, items: [] };
const grantRecord = { id: "grant-one", ipId: "ip-one", subIpId: "child-one", schoolId: "school-a", mode: "multi_school" as const, status: "active" as const, startsAt: now, note: "", createdByUserId: "education-admin", createdAt: now, updatedAt: now };

describe("IP library administration service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id, role: "admin", status: "active", adminPermissions: id === "education-admin" ? ["education.manage"] : ["content.manage"] })));
        mocks.getIpPackage.mockResolvedValue(packageRecord);
        mocks.getIpPackageBySlug.mockResolvedValue(null);
        mocks.createIpPackage.mockImplementation(async (input) => ({ ...input, createdAt: now, updatedAt: now }));
        mocks.createIpSubIp.mockImplementation(async (_ipId, input) => ({ ...input, sortOrder: input.sortOrder ?? 0, createdAt: now, updatedAt: now, items: [] }));
        mocks.createIpContentFile.mockImplementation(async (input) => ({ ...input, createdAt: now, updatedAt: now }));
        mocks.getIpSubIp.mockResolvedValue(childRecord);
        mocks.updateIpSubIp.mockImplementation(async (_ipId, _childId, input) => ({ ...childRecord, ...input }));
        mocks.replaceIpSubIpItems.mockResolvedValue([]);
        mocks.findConflictingSchoolGrant.mockResolvedValue(null);
        mocks.createSchoolGrant.mockImplementation(async (input) => ({ ...input, createdAt: now, updatedAt: now }));
        mocks.listSchoolGrants.mockResolvedValue({ items: [grantRecord], total: 1, page: 1, pageSize: 1 });
        mocks.updateSchoolGrant.mockImplementation(async (_ipId, _grantId, input) => ({ ...grantRecord, ...input, endsAt: input.endsAt ?? undefined }));
        mocks.getIpContentFile.mockResolvedValue({ id: "cover-one", ipId: "ip-one", subIpId: "child-one", kind: "image", status: "ready" });
        mocks.listIpFileCleanupQueue.mockResolvedValue([]);
    });

    it("creates one default child IP with each new package", async () => {
        const created = await createAdminIp("content-admin", { title: " 星海计划 ", slug: " Star-Sea ", summary: " 简介 ", visibility: "school" });

        expect(created).toMatchObject({ title: "星海计划", slug: "star-sea", status: "enabled", visibility: "school" });
        expect(mocks.createIpSubIp).toHaveBeenCalledWith(created.id, expect.objectContaining({ ipId: created.id, title: "星海计划", createdByUserId: "content-admin", tags: [] }));
    });

    it("does not allow a new child to adopt another child's cover or items", async () => {
        await expect(createAdminIpSubIp("content-admin", "ip-one", { title: "第二子 IP", coverFileId: "cover-one" })).rejects.toMatchObject({ status: 400, message: "请先创建子 IP，再上传文件并设置封面" });
        await expect(createAdminIpSubIp("content-admin", "ip-one", { title: "第二子 IP", items: [{ kind: "text", category: "story_summary", title: "梗概", fileId: "text-one" }] })).rejects.toMatchObject({
            status: 400,
            message: "请先创建子 IP，再上传文件并保存内容项",
        });
        expect(mocks.createIpSubIp).not.toHaveBeenCalled();
    });

    it("only accepts a ready cover owned by the child being edited", async () => {
        await updateAdminIpSubIp("content-admin", "ip-one", "child-one", { title: "第一子 IP", coverFileId: "cover-one", items: [] });
        expect(mocks.getIpContentFile).toHaveBeenCalledWith("ip-one", "cover-one", "child-one");
        expect(mocks.updateIpSubIp).toHaveBeenCalledWith("ip-one", "child-one", expect.objectContaining({ coverFileId: "cover-one" }));

        mocks.getIpContentFile.mockResolvedValue(null);
        await expect(updateAdminIpSubIp("content-admin", "ip-one", "child-one", { title: "第一子 IP", coverFileId: "cover-one" })).rejects.toMatchObject({ status: 400 });
    });

    it("authorizes a school directly at child IP scope", async () => {
        const grant = await createAdminIpGrant("education-admin", "ip-one", { subIpId: "child-one", schoolId: "school-a", mode: "multi_school", startsAt: now, note: "教学使用" });

        expect(grant).toMatchObject({ ipId: "ip-one", subIpId: "child-one", schoolId: "school-a", status: "active" });
        expect(mocks.findConflictingSchoolGrant).toHaveBeenCalledWith(expect.objectContaining({ ipId: "ip-one", subIpId: "child-one", schoolId: "school-a" }));
        expect(mocks.createSchoolGrant).toHaveBeenCalledWith(expect.objectContaining({ subIpId: "child-one", status: "active" }));
    });

    it("clears an authorization end date and rejects an end date before its start", async () => {
        await updateAdminIpGrant("education-admin", "ip-one", "grant-one", { endsAt: null });
        expect(mocks.updateSchoolGrant).toHaveBeenCalledWith("ip-one", "grant-one", expect.objectContaining({ endsAt: null }));

        mocks.updateSchoolGrant.mockClear();
        await expect(updateAdminIpGrant("education-admin", "ip-one", "grant-one", { endsAt: "2026-09-06T23:59:59.000Z" })).rejects.toMatchObject({ status: 400, message: "IP 授权时间窗无效" });
        expect(mocks.updateSchoolGrant).not.toHaveBeenCalled();
    });

    it("allows administrators to upload repair files while an IP is disabled", async () => {
        mocks.getIpPackage.mockResolvedValue({ ...packageRecord, status: "disabled" });
        mocks.writeIpContentFile.mockResolvedValue({
            id: "file-one",
            ipId: "ip-one",
            subIpId: "child-one",
            kind: "text",
            originalName: "story.txt",
            extension: ".txt",
            mimeType: "text/plain",
            byteSize: 6,
            sha256: "hash",
            storageProvider: "local",
            storageKey: "ip-one/file-one/original.txt",
            status: "ready",
            uploadedByUserId: "content-admin",
        });

        await uploadAdminIpFile("content-admin", "ip-one", "child-one", "text", new File(["正文"], "story.txt", { type: "text/plain" }));

        expect(mocks.writeIpContentFile).toHaveBeenCalledWith(expect.objectContaining({ ipId: "ip-one", subIpId: "child-one", kind: "text", uploadedByUserId: "content-admin" }));
        expect(mocks.createIpContentFile).toHaveBeenCalledWith(expect.objectContaining({ id: "file-one", subIpId: "child-one" }));
    });
});
