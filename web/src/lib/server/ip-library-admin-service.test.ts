import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    listIpPackages: vi.fn(),
    getIpPackage: vi.fn(),
    getIpPackageBySlug: vi.fn(),
    createIpPackage: vi.fn(),
    updateIpPackage: vi.fn(),
    createIpDraftVersion: vi.fn(),
    updateIpDraftVersion: vi.fn(),
    getIpVersion: vi.fn(),
    publishIpVersion: vi.fn(),
    listIpVersions: vi.fn(),
    createSchoolGrant: vi.fn(),
    findConflictingSchoolGrant: vi.fn(),
    updateSchoolGrant: vi.fn(),
    listSchoolGrants: vi.fn(),
    listIpDownloads: vi.fn(),
    listSchoolsByIds: vi.fn(),
    getIpContentFile: vi.fn(),
    listIpContentFiles: vi.fn(),
    createIpContentFile: vi.fn(),
    claimIpContentFileDeletion: vi.fn(),
    finalizeIpContentFileDeletion: vi.fn(),
    writeIpContentFile: vi.fn(),
    readIpContentFile: vi.fn(),
    deleteStoredIpContentFile: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./ip-library-access-service", () => ({
    createIpLibraryRepository: () => ({
        listIpPackages: mocks.listIpPackages,
        getIpPackage: mocks.getIpPackage,
        getIpPackageBySlug: mocks.getIpPackageBySlug,
        createIpPackage: mocks.createIpPackage,
        updateIpPackage: mocks.updateIpPackage,
        createIpDraftVersion: mocks.createIpDraftVersion,
        updateIpDraftVersion: mocks.updateIpDraftVersion,
        getIpVersion: mocks.getIpVersion,
        publishIpVersion: mocks.publishIpVersion,
        listIpVersions: mocks.listIpVersions,
        createSchoolGrant: mocks.createSchoolGrant,
        findConflictingSchoolGrant: mocks.findConflictingSchoolGrant,
        updateSchoolGrant: mocks.updateSchoolGrant,
        listSchoolGrants: mocks.listSchoolGrants,
        listIpDownloads: mocks.listIpDownloads,
        getIpContentFile: mocks.getIpContentFile,
        listIpContentFiles: mocks.listIpContentFiles,
        createIpContentFile: mocks.createIpContentFile,
        claimIpContentFileDeletion: mocks.claimIpContentFileDeletion,
        finalizeIpContentFileDeletion: mocks.finalizeIpContentFileDeletion,
    }),
}));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => ({ listSchoolsByIds: mocks.listSchoolsByIds }) }));
vi.mock("@/lib/server/ip-library-file-storage", () => ({
    writeIpContentFile: mocks.writeIpContentFile,
    readIpContentFile: mocks.readIpContentFile,
    deleteStoredIpContentFile: mocks.deleteStoredIpContentFile,
}));

import {
    createAdminIp,
    createAdminIpGrant,
    createAdminIpVersion,
    deleteAdminIpFile,
    listAdminIpFiles,
    listAdminIpGrants,
    listAdminIpUsage,
    publishAdminIpVersion,
    readAdminIpFile,
    updateAdminIp,
    updateAdminIpVersion,
    uploadAdminIpFile,
} from "./ip-library-admin-service";

const packageRecord = {
    id: "ip-one",
    title: "星海计划",
    slug: "star-sea",
    summary: "简介",
    visibility: "school" as const,
    authorizationMode: "exclusive" as const,
    status: "published" as const,
    currentVersionId: "version-one",
    createdByUserId: "content-admin",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
};

describe("IP library administration service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) =>
            ids.map((id) => ({ id, role: "admin", status: "active", adminPermissions: id === "content-admin" ? ["content.manage"] : id === "education-admin" ? ["education.manage"] : ["content.manage", "education.manage"] })),
        );
        mocks.getIpPackage.mockResolvedValue(packageRecord);
        mocks.getIpPackageBySlug.mockResolvedValue(null);
        mocks.createIpPackage.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }));
        mocks.updateIpPackage.mockImplementation(async (_id, patch) => ({ ...packageRecord, ...patch }));
        mocks.createIpDraftVersion.mockImplementation(async (_id, input) => ({ ...input, ipId: "ip-one", versionNumber: 2, status: "draft", manifest: {}, createdAt: "2026-08-19T00:00:00.000Z" }));
        mocks.updateIpDraftVersion.mockImplementation(async (_ipId, _versionId, input) => ({ ...input, ipId: "ip-one", versionNumber: 2, status: "draft", manifest: {}, createdAt: "2026-08-19T00:00:00.000Z" }));
        mocks.getIpVersion.mockResolvedValue({ id: "version-two", ipId: "ip-one", status: "draft", items: [{ id: "text-one", fileId: "text-one" }] });
        mocks.publishIpVersion.mockResolvedValue({ id: "version-two", ipId: "ip-one", status: "published", items: [{ id: "text-one" }] });
        mocks.createSchoolGrant.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }));
        mocks.findConflictingSchoolGrant.mockResolvedValue(null);
        mocks.getIpContentFile.mockImplementation(async (_ipId: string, fileId: string) => ({ id: fileId, ipId: "ip-one", kind: fileId === "text-one" ? "text" : "image", status: "ready" }));
        mocks.listIpContentFiles.mockResolvedValue([]);
        mocks.writeIpContentFile.mockResolvedValue({ id: "file-new", ipId: "ip-one", kind: "text", status: "ready", storageProvider: "local", storageKey: "ip-one/file-new/original.txt" });
        mocks.createIpContentFile.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }));
        mocks.claimIpContentFileDeletion.mockImplementation(async (_ipId: string, fileId: string) => ({ id: fileId, ipId: "ip-one", kind: "image", status: "deleting" }));
        mocks.finalizeIpContentFileDeletion.mockResolvedValue(true);
        mocks.readIpContentFile.mockResolvedValue(new Response("正文"));
        mocks.listSchoolsByIds.mockResolvedValue([{ id: "school-a", name: "甲学校" }]);
    });

    it("keeps content and education duties separate", async () => {
        await expect(createAdminIpGrant("content-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({ status: 403 });
        await expect(updateAdminIp("education-admin", "ip-one", { title: "越权修改" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.createSchoolGrant).not.toHaveBeenCalled();
        expect(mocks.updateIpPackage).not.toHaveBeenCalled();
    });

    it("creates a normalized package with server-owned ids and creator", async () => {
        const created = await createAdminIp("content-admin", { title: " 星海计划 ", slug: " Star-Sea ", summary: " 简介 ", visibility: "school" });
        expect(created).toMatchObject({ title: "星海计划", slug: "star-sea", authorizationMode: "multi_school", createdByUserId: "content-admin", status: "draft" });
        expect(mocks.createIpPackage).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String), authorizationMode: "multi_school", createdByUserId: "content-admin" }));
    });

    it("rejects a duplicate slug before attempting to create the package", async () => {
        mocks.getIpPackageBySlug.mockResolvedValue({ ...packageRecord, id: "ip-existing", slug: "star-sea" });
        await expect(createAdminIp("content-admin", { title: "另一个 IP", slug: "star-sea", visibility: "public" })).rejects.toMatchObject({ status: 409, message: "IP 标识已存在，请更换 slug" });
        expect(mocks.createIpPackage).not.toHaveBeenCalled();
    });

    it("maps grant conflicts to a stable Chinese business error", async () => {
        mocks.createSchoolGrant.mockRejectedValue({ code: "23505", message: "Conflicting IP school grant" });
        await expect(createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "multi_school", startsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({
            status: 409,
            message: "授权创建失败：当前学校或授权模式存在重叠时间窗",
        });
    });

    it("preflights a grant window before the database trigger", async () => {
        mocks.findConflictingSchoolGrant.mockResolvedValue({ id: "grant-existing" });
        await expect(createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "multi_school", startsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({
            status: 409,
            message: "授权创建失败：当前学校或授权模式存在重叠时间窗",
        });
        expect(mocks.createSchoolGrant).not.toHaveBeenCalled();
    });

    it("reports distinct publish readiness failures", async () => {
        mocks.getIpVersion.mockResolvedValue({ id: "version-processing", ipId: "ip-one", status: "draft", items: [{ id: "item", fileId: "file-processing" }] });
        mocks.getIpContentFile.mockResolvedValue({ id: "file-processing", ipId: "ip-one", kind: "image", status: "processing" });
        await expect(publishAdminIpVersion("content-admin", "ip-one", "version-processing")).rejects.toMatchObject({ status: 409, message: "仍有内容文件处理中，请稍后再发布" });
    });

    it("distinguishes clearing a cover from leaving it unchanged", async () => {
        await updateAdminIp("content-admin", "ip-one", { coverAssetId: "" });
        expect(mocks.updateIpPackage).toHaveBeenCalledWith("ip-one", { coverAssetId: null });
    });

    it("validates independent ready files before persisting the version snapshot", async () => {
        await createAdminIpVersion("content-admin", "ip-one", {
            title: "第二版",
            summary: "版本简介",
            coverFileId: "image-one",
            tags: [" 科幻 ", "科幻", "教学"],
            sourceNote: " 平台线下审核 ",
            changeNote: " 首次发布 ",
            items: [
                { kind: "text", category: "story_summary", title: "梗概", summary: "", fileId: "text-one" },
                { kind: "image", category: "character", title: "主角", summary: "", fileId: "image-one" },
            ],
        });
        expect(mocks.createIpDraftVersion).toHaveBeenCalledWith(
            "ip-one",
            expect.objectContaining({
                id: expect.any(String),
                createdByUserId: "content-admin",
                coverFileId: "image-one",
                tags: ["科幻", "教学"],
                sourceNote: "平台线下审核",
                changeNote: "首次发布",
                items: expect.arrayContaining([expect.objectContaining({ kind: "image", fileId: "image-one" })]),
            }),
        );

        mocks.getIpContentFile.mockResolvedValue({ id: "image-one", ipId: "ip-one", kind: "video", status: "ready" });
        await expect(createAdminIpVersion("content-admin", "ip-one", { title: "错误版本", summary: "", items: [{ kind: "image", category: "character", title: "主角", summary: "", fileId: "image-one" }] })).rejects.toMatchObject({ status: 400 });

        mocks.getIpContentFile.mockResolvedValue({ id: "image-one", ipId: "ip-one", kind: "image", status: "processing" });
        await expect(createAdminIpVersion("content-admin", "ip-one", { title: "未就绪版本", summary: "", items: [{ kind: "image", category: "character", title: "主角", summary: "", fileId: "image-one" }] })).rejects.toMatchObject({ status: 409 });
    });

    it("creates either an empty draft or a draft copied from an existing version", async () => {
        await createAdminIpVersion("content-admin", "ip-one", { title: "空白第三版" });
        expect(mocks.createIpDraftVersion).toHaveBeenLastCalledWith("ip-one", expect.objectContaining({ title: "空白第三版", items: [] }));

        mocks.getIpVersion.mockResolvedValue({
            id: "version-one",
            ipId: "ip-one",
            versionNumber: 1,
            title: "第一版",
            summary: "第一版摘要",
            coverFileId: "image-one",
            tags: ["教学"],
            sourceNote: "平台审核",
            changeNote: "首次发布",
            status: "published",
            manifest: {},
            items: [{ id: "old-item", versionId: "version-one", kind: "text", category: "story_summary", title: "梗概", summary: "", fileId: "text-one", sortOrder: 0 }],
            createdByUserId: "content-admin",
            createdAt: "2026-08-19T00:00:00.000Z",
            publishedAt: "2026-08-19T01:00:00.000Z",
        });
        await createAdminIpVersion("content-admin", "ip-one", { sourceVersionId: "version-one", changeNote: "第二次发布" });
        expect(mocks.createIpDraftVersion).toHaveBeenLastCalledWith(
            "ip-one",
            expect.objectContaining({
                title: "第一版",
                coverFileId: "image-one",
                tags: ["教学"],
                changeNote: "第二次发布",
                items: [expect.objectContaining({ id: expect.not.stringMatching(/^old-item$/), fileId: "text-one" })],
            }),
        );
    });

    it("publishes only a non-empty draft version and keeps historical versions immutable", async () => {
        await expect(publishAdminIpVersion("content-admin", "ip-one", "version-two")).resolves.toMatchObject({ status: "published" });
        mocks.getIpVersion.mockResolvedValue({ id: "version-empty", ipId: "ip-one", status: "draft", items: [] });
        await expect(publishAdminIpVersion("content-admin", "ip-one", "version-empty")).rejects.toMatchObject({ status: 400 });
        expect(mocks.publishIpVersion).toHaveBeenCalledTimes(1);
    });

    it("atomically replaces draft metadata and items without changing published versions", async () => {
        await updateAdminIpVersion("content-admin", "ip-one", "version-two", {
            title: "第二版修订",
            summary: "修订摘要",
            tags: ["教学"],
            sourceNote: "平台审核",
            changeNote: "替换角色图",
            items: [{ kind: "image", category: "character", title: "新角色", fileId: "image-one" }],
        });
        expect(mocks.updateIpDraftVersion).toHaveBeenCalledWith("ip-one", "version-two", expect.objectContaining({ id: "version-two", title: "第二版修订", items: [expect.objectContaining({ fileId: "image-one" })] }));

        mocks.getIpVersion.mockResolvedValue({ id: "version-one", ipId: "ip-one", status: "published", items: [{ id: "item-one" }] });
        await expect(updateAdminIpVersion("content-admin", "ip-one", "version-one", { title: "覆盖", items: [{ kind: "image", category: "character", title: "角色", fileId: "image-one" }] })).rejects.toMatchObject({ status: 409 });
        expect(mocks.updateIpDraftVersion).toHaveBeenCalledTimes(1);
    });

    it("stores authorization mode on each grant and validates the time window", async () => {
        await createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "multi_school", startsAt: "2026-08-19T00:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z", note: "线下教学" });
        expect(mocks.createSchoolGrant).toHaveBeenCalledWith(expect.objectContaining({ ipId: "ip-one", schoolId: "school-a", mode: "multi_school", createdByUserId: "education-admin", status: "active" }));

        await expect(createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-09-19T00:00:00.000Z", endsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({ status: 400 });
        mocks.getIpPackage.mockResolvedValue({ ...packageRecord, status: "draft" });
        await expect(createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({ status: 409 });
    });

    it("uploads, reads, lists and deletes independent files under content duty", async () => {
        const file = new File(["正文"], "story.txt", { type: "text/plain" });
        await expect(uploadAdminIpFile("content-admin", "ip-one", "text", file)).resolves.toMatchObject({ id: "file-new", ipId: "ip-one" });
        expect(mocks.writeIpContentFile).toHaveBeenCalledWith(expect.objectContaining({ ipId: "ip-one", kind: "text", originalName: "story.txt", bytes: expect.any(Buffer), uploadedByUserId: "content-admin" }));
        await expect(listAdminIpFiles("content-admin", "ip-one")).resolves.toEqual([]);
        await expect(readAdminIpFile("content-admin", new Request("http://localhost/file"), "ip-one", "image-one")).resolves.toBeInstanceOf(Response);
        await expect(deleteAdminIpFile("content-admin", "ip-one", "image-one")).resolves.toBeUndefined();
        expect(mocks.deleteStoredIpContentFile).toHaveBeenCalled();

        await expect(uploadAdminIpFile("education-admin", "ip-one", "text", file)).rejects.toMatchObject({ status: 403 });
    });

    it("does not remove stored bytes when a file is still referenced", async () => {
        mocks.claimIpContentFileDeletion.mockResolvedValue(null);
        await expect(deleteAdminIpFile("content-admin", "ip-one", "image-one")).rejects.toMatchObject({ status: 409 });
        expect(mocks.deleteStoredIpContentFile).not.toHaveBeenCalled();
        expect(mocks.finalizeIpContentFileDeletion).not.toHaveBeenCalled();
    });

    it("keeps the database record when stored file deletion fails", async () => {
        mocks.deleteStoredIpContentFile.mockRejectedValue(new Error("对象存储暂时不可用"));
        await expect(deleteAdminIpFile("content-admin", "ip-one", "image-one")).rejects.toThrow("对象存储暂时不可用");
        expect(mocks.finalizeIpContentFileDeletion).not.toHaveBeenCalled();
    });

    it("claims the record before cleanup and finalizes it after storage deletion", async () => {
        const order: string[] = [];
        mocks.claimIpContentFileDeletion.mockImplementation(async () => {
            order.push("claim");
            return { id: "image-one", ipId: "ip-one", kind: "image", status: "deleting" };
        });
        mocks.deleteStoredIpContentFile.mockImplementation(async () => order.push("storage"));
        mocks.finalizeIpContentFileDeletion.mockImplementation(async () => {
            order.push("finalize");
            return true;
        });
        await deleteAdminIpFile("content-admin", "ip-one", "image-one");
        expect(order).toEqual(["claim", "storage", "finalize"]);
    });

    it("treats an already finalized concurrent retry as a successful deletion", async () => {
        mocks.finalizeIpContentFileDeletion.mockResolvedValue(false);
        mocks.getIpContentFile.mockResolvedValueOnce({ id: "image-one", ipId: "ip-one", kind: "image", status: "ready" }).mockResolvedValueOnce(null);
        await expect(deleteAdminIpFile("content-admin", "ip-one", "image-one")).resolves.toBeUndefined();
    });

    it("projects independent download records to public user identities and school names", async () => {
        mocks.listIpDownloads.mockResolvedValue({
            items: [{ id: "download-one", ipId: "ip-one", versionId: "version-one", itemId: "item-one", schoolId: "school-a", userId: "student-user", downloadType: "item", result: "succeeded", createdAt: "2026-08-19T00:00:00.000Z" }],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) =>
            ids.map((id) =>
                id === "content-admin" ? { id, role: "admin", status: "active", adminPermissions: ["content.manage"] } : { id, accountId: "0007", username: "student", displayName: "练习学生", role: "user", status: "active", adminPermissions: [] },
            ),
        );

        await expect(listAdminIpUsage("content-admin", { page: 1, pageSize: 20, downloadType: "item", result: "succeeded" })).resolves.toMatchObject({
            items: [{ id: "download-one", downloadType: "item", result: "succeeded", user: { accountId: "0007", username: "student", displayName: "练习学生" }, school: { id: "school-a", name: "甲学校" } }],
        });
        expect(mocks.listIpDownloads).toHaveBeenCalledWith({ page: 1, pageSize: 20, downloadType: "item", result: "succeeded" });
        expect(mocks.listSchoolsByIds).toHaveBeenCalledWith(["school-a"]);
    });

    it("adds school names to the current grant page without exposing an unbounded lookup", async () => {
        mocks.listSchoolGrants.mockResolvedValue({ items: [{ id: "grant-one", schoolId: "school-a" }], total: 1, page: 1, pageSize: 20 });
        await expect(listAdminIpGrants("education-admin", "ip-one", { page: 1, pageSize: 20 })).resolves.toMatchObject({
            items: [{ id: "grant-one", school: { id: "school-a", name: "甲学校" } }],
        });
        expect(mocks.listSchoolsByIds).toHaveBeenCalledWith(["school-a"]);
    });
});
