import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getIpPackage: vi.fn(),
    getVisibleIp: vi.fn(),
    listVisibleIps: vi.fn(),
    recordIpUsage: vi.fn(),
    getUserById: vi.fn(),
    requireActiveSchoolContext: vi.fn(),
    getSchoolContextForUser: vi.fn(),
}));

vi.mock("@/lib/server/database/repositories", () => ({
    createPostgresRepositories: () => ({
        ipLibrary: {
            getIpPackage: mocks.getIpPackage,
            getVisibleIp: mocks.getVisibleIp,
            listVisibleIps: mocks.listVisibleIps,
            recordIpUsage: mocks.recordIpUsage,
        },
        users: { getById: mocks.getUserById },
    }),
}));
vi.mock("@/lib/server/database/postgres", () => ({ getDatabaseProvider: () => "postgres" }));
vi.mock("./school-access-service", () => ({
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    getSchoolContextForUser: mocks.getSchoolContextForUser,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public readonly status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));

import { createIpUsageForUser, getIpDetailForUser, listIpLibraryForUser } from "./ip-library-service";

const version = {
    id: "version-one",
    ipId: "ip-one",
    versionNumber: 1,
    title: "星海计划 v1",
    summary: "版本简介",
    status: "published" as const,
    manifest: {},
    publishedAt: "2026-08-19T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    items: [
        { id: "item-text", versionId: "version-one", kind: "text" as const, category: "story_summary" as const, title: "故事梗概", summary: "", textContent: "内容", sortOrder: 0, createdAt: "2026-08-18T00:00:00.000Z" },
        { id: "item-image", versionId: "version-one", kind: "image" as const, category: "character" as const, title: "主角", summary: "", assetId: "asset-one", sortOrder: 1, createdAt: "2026-08-18T00:00:00.000Z" },
    ],
};

function packageRecord(visibility: "public" | "school" = "public") {
    return {
        id: "ip-one",
        title: "星海计划",
        slug: "star-sea",
        summary: "IP 简介",
        visibility,
        authorizationMode: visibility === "school" ? ("exclusive" as const) : ("multi_school" as const),
        status: "published" as const,
        currentVersionId: version.id,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z",
    };
}

function detail(visibility: "public" | "school" = "public") {
    return { ...packageRecord(visibility), version, ...(visibility === "school" ? { grantMode: "exclusive" as const } : {}) };
}

describe("IP library user service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUserById.mockResolvedValue({ id: "user-one", role: "user", status: "active" });
        mocks.getIpPackage.mockResolvedValue(packageRecord());
        mocks.getVisibleIp.mockResolvedValue(detail());
        mocks.listVisibleIps.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-a", status: "active" }, membership: { id: "member-a", role: "teacher", status: "active" } });
        mocks.getSchoolContextForUser.mockResolvedValue(null);
        mocks.recordIpUsage.mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-19T01:00:00.000Z" }));
    });

    it("lists public IPs for an active signed-in user without requiring a school", async () => {
        await listIpLibraryForUser("user-one", { scope: "public", page: 1, pageSize: 12 });

        expect(mocks.requireActiveSchoolContext).not.toHaveBeenCalled();
        expect(mocks.listVisibleIps).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", scope: "public", page: 1, pageSize: 12 }));
    });

    it("derives the school for school-scoped lists and never accepts a client school id", async () => {
        await listIpLibraryForUser("user-one", { scope: "school", page: 1, pageSize: 12 });

        expect(mocks.listVisibleIps).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", schoolId: "school-a", scope: "school" }));
    });

    it("rejects disabled accounts before reading IP visibility", async () => {
        mocks.getUserById.mockResolvedValue({ id: "user-one", role: "user", status: "disabled" });

        await expect(getIpDetailForUser("user-one", "ip-one")).rejects.toMatchObject({ status: 403 });
        expect(mocks.getIpPackage).not.toHaveBeenCalled();
    });

    it("allows public and historical published versions without a school context", async () => {
        await expect(getIpDetailForUser("user-one", "ip-one", "version-one")).resolves.toMatchObject({ id: "ip-one", version: { id: "version-one" } });

        expect(mocks.requireActiveSchoolContext).not.toHaveBeenCalled();
        expect(mocks.getVisibleIp).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", ipId: "ip-one", versionId: "version-one" }));
    });

    it("does not let an administrator without school membership borrow user-side school access", async () => {
        mocks.getUserById.mockResolvedValue({ id: "admin-one", role: "admin", status: "active" });
        mocks.getIpPackage.mockResolvedValue(packageRecord("school"));
        mocks.requireActiveSchoolContext.mockRejectedValue(Object.assign(new Error("当前账号没有可用的学校身份"), { status: 403 }));

        await expect(getIpDetailForUser("admin-one", "ip-one")).rejects.toMatchObject({ status: 403 });
        expect(mocks.getVisibleIp).not.toHaveBeenCalled();
    });

    it("returns 404 when the current school has no active grant, including revoked or expired grants", async () => {
        mocks.getIpPackage.mockResolvedValue(packageRecord("school"));
        mocks.getVisibleIp.mockResolvedValue(null);

        await expect(getIpDetailForUser("user-one", "ip-one")).rejects.toMatchObject({ status: 404 });
        expect(mocks.getVisibleIp).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "school-a" }));
    });

    it("pins usage to the visible version, validates item ownership, and records the derived school", async () => {
        mocks.getIpPackage.mockResolvedValue(packageRecord("school"));
        mocks.getVisibleIp.mockResolvedValue(detail("school"));

        const usage = await createIpUsageForUser("user-one", {
            ipId: "ip-one",
            versionId: "version-one",
            itemIds: ["item-image"],
            action: "reference",
            targetType: "canvas",
            targetId: "canvas-one",
        });

        expect(usage).toMatchObject({ ipId: "ip-one", versionId: "version-one", schoolId: "school-a", userId: "user-one", itemIds: ["item-image"] });
        expect(mocks.recordIpUsage).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "school-a", itemIds: ["item-image"] }));
    });

    it.each([
        [["item-image", "item-image"], "IP 内容项不能重复"],
        [["item-other-version"], "IP 内容项不存在或不属于当前版本"],
    ])("rejects duplicate or cross-version item references", async (itemIds, message) => {
        await expect(
            createIpUsageForUser("user-one", {
                ipId: "ip-one",
                versionId: "version-one",
                itemIds,
                action: "reference",
                targetType: "drama",
                targetId: "drama-one",
            }),
        ).rejects.toThrow(message);
        expect(mocks.recordIpUsage).not.toHaveBeenCalled();
    });

    it("validates download actions at runtime before recording usage", async () => {
        await expect(
            createIpUsageForUser("user-one", {
                ipId: "ip-one",
                versionId: "version-one",
                itemIds: ["item-image", "item-text"],
                action: "download_item",
                targetType: "download",
                targetId: "download-one",
            }),
        ).rejects.toThrow("单项下载必须指定一个");
        expect(mocks.recordIpUsage).not.toHaveBeenCalled();
    });
});
