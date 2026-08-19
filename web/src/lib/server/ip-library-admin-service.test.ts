import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    listIpPackages: vi.fn(),
    getIpPackage: vi.fn(),
    createIpPackage: vi.fn(),
    updateIpPackage: vi.fn(),
    createIpDraftVersion: vi.fn(),
    getIpVersion: vi.fn(),
    publishIpVersion: vi.fn(),
    listIpVersions: vi.fn(),
    createSchoolGrant: vi.fn(),
    updateSchoolGrant: vi.fn(),
    listSchoolGrants: vi.fn(),
    listIpUsage: vi.fn(),
    listSchoolsByIds: vi.fn(),
    getLibraryAssetById: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./ip-library-access-service", () => ({
    createIpLibraryRepository: () => ({
        listIpPackages: mocks.listIpPackages,
        getIpPackage: mocks.getIpPackage,
        createIpPackage: mocks.createIpPackage,
        updateIpPackage: mocks.updateIpPackage,
        createIpDraftVersion: mocks.createIpDraftVersion,
        getIpVersion: mocks.getIpVersion,
        publishIpVersion: mocks.publishIpVersion,
        listIpVersions: mocks.listIpVersions,
        createSchoolGrant: mocks.createSchoolGrant,
        updateSchoolGrant: mocks.updateSchoolGrant,
        listSchoolGrants: mocks.listSchoolGrants,
        listIpUsage: mocks.listIpUsage,
    }),
}));
vi.mock("@/lib/server/library-asset-store", () => ({ getLibraryAssetById: mocks.getLibraryAssetById }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => ({ listSchoolsByIds: mocks.listSchoolsByIds }) }));

import { createAdminIp, createAdminIpGrant, createAdminIpVersion, listAdminIpGrants, listAdminIpUsage, publishAdminIpVersion, updateAdminIp } from "./ip-library-admin-service";

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
        mocks.createIpPackage.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }));
        mocks.updateIpPackage.mockImplementation(async (_id, patch) => ({ ...packageRecord, ...patch }));
        mocks.createIpDraftVersion.mockImplementation(async (_id, input) => ({ ...input, ipId: "ip-one", versionNumber: 2, status: "draft", manifest: {}, createdAt: "2026-08-19T00:00:00.000Z" }));
        mocks.getIpVersion.mockResolvedValue({ id: "version-two", ipId: "ip-one", status: "draft", items: [{ id: "text-one" }] });
        mocks.publishIpVersion.mockResolvedValue({ id: "version-two", ipId: "ip-one", status: "published", items: [{ id: "text-one" }] });
        mocks.createSchoolGrant.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }));
        mocks.getLibraryAssetById.mockResolvedValue({ id: "asset-one", kind: "image" });
        mocks.listSchoolsByIds.mockResolvedValue([{ id: "school-a", name: "甲学校" }]);
    });

    it("keeps content and education duties separate", async () => {
        await expect(createAdminIpGrant("content-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({ status: 403 });
        await expect(updateAdminIp("education-admin", "ip-one", { title: "越权修改" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.createSchoolGrant).not.toHaveBeenCalled();
        expect(mocks.updateIpPackage).not.toHaveBeenCalled();
    });

    it("creates a normalized package with server-owned ids and creator", async () => {
        const created = await createAdminIp("content-admin", { title: " 星海计划 ", slug: " Star-Sea ", summary: " 简介 ", visibility: "school", authorizationMode: "exclusive" });
        expect(created).toMatchObject({ title: "星海计划", slug: "star-sea", createdByUserId: "content-admin", status: "draft" });
        expect(mocks.createIpPackage).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String), createdByUserId: "content-admin" }));
    });

    it("distinguishes clearing a cover from leaving it unchanged", async () => {
        await updateAdminIp("content-admin", "ip-one", { coverAssetId: "" });
        expect(mocks.updateIpPackage).toHaveBeenCalledWith("ip-one", { coverAssetId: null });
    });

    it("validates draft content and referenced media kinds before persistence", async () => {
        await createAdminIpVersion("content-admin", "ip-one", {
            title: "第二版",
            summary: "版本简介",
            items: [
                { kind: "text", category: "story_summary", title: "梗概", summary: "", textContent: "正文" },
                { kind: "image", category: "character", title: "主角", summary: "", assetId: "asset-one" },
            ],
        });
        expect(mocks.createIpDraftVersion).toHaveBeenCalledWith(
            "ip-one",
            expect.objectContaining({ id: expect.any(String), createdByUserId: "content-admin", items: expect.arrayContaining([expect.objectContaining({ kind: "image", assetId: "asset-one" })]) }),
        );

        mocks.getLibraryAssetById.mockResolvedValue({ id: "asset-one", kind: "video" });
        await expect(createAdminIpVersion("content-admin", "ip-one", { title: "错误版本", summary: "", items: [{ kind: "image", category: "character", title: "主角", summary: "", assetId: "asset-one" }] })).rejects.toMatchObject({ status: 400 });
    });

    it("publishes only a non-empty draft version and keeps historical versions immutable", async () => {
        await expect(publishAdminIpVersion("content-admin", "ip-one", "version-two")).resolves.toMatchObject({ status: "published" });
        mocks.getIpVersion.mockResolvedValue({ id: "version-empty", ipId: "ip-one", status: "draft", items: [] });
        await expect(publishAdminIpVersion("content-admin", "ip-one", "version-empty")).rejects.toMatchObject({ status: 400 });
        expect(mocks.publishIpVersion).toHaveBeenCalledTimes(1);
    });

    it("allows grants only for matching published school IPs and validates the time window", async () => {
        await createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z", note: "线下教学" });
        expect(mocks.createSchoolGrant).toHaveBeenCalledWith(expect.objectContaining({ ipId: "ip-one", schoolId: "school-a", createdByUserId: "education-admin", status: "active" }));

        await expect(createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-09-19T00:00:00.000Z", endsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({ status: 400 });
        mocks.getIpPackage.mockResolvedValue({ ...packageRecord, status: "draft" });
        await expect(createAdminIpGrant("education-admin", "ip-one", { schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z", note: "" })).rejects.toMatchObject({ status: 409 });
    });

    it("projects usage records to public user identities and school names", async () => {
        mocks.listIpUsage.mockResolvedValue({
            items: [{ id: "usage-one", ipId: "ip-one", versionId: "version-one", schoolId: "school-a", userId: "student-user", action: "view", createdAt: "2026-08-19T00:00:00.000Z" }],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) =>
            ids.map((id) =>
                id === "content-admin" ? { id, role: "admin", status: "active", adminPermissions: ["content.manage"] } : { id, accountId: "0007", username: "student", displayName: "练习学生", role: "user", status: "active", adminPermissions: [] },
            ),
        );

        await expect(listAdminIpUsage("content-admin", { page: 1, pageSize: 20 })).resolves.toMatchObject({
            items: [{ id: "usage-one", user: { accountId: "0007", username: "student", displayName: "练习学生" }, school: { id: "school-a", name: "甲学校" } }],
        });
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
