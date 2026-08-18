import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const users = { getById: vi.fn() };
    const workPublications = {
        getWorkById: vi.fn(),
        getWorkBySlug: vi.fn(),
        getPublicWork: vi.fn(),
        getVersionById: vi.fn(),
        getSourceJson: vi.fn(),
        listVersionAssets: vi.fn(),
    };
    const practice = {
        setPullFilmVersion: vi.fn(),
        claimCopyRequest: vi.fn(),
        createPracticeProjectCopy: vi.fn(),
    };
    return {
        users,
        workPublications,
        practice,
        repositories: { users, workPublications, practice },
        requirePracticeAccess: vi.fn(),
    };
});

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(() => mocks.repositories),
    ensurePostgresSchema: vi.fn(),
    getDatabaseProvider: vi.fn(() => "postgres"),
    withPostgresTransaction: vi.fn(async (run) => run({ query: vi.fn() })),
}));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));

import { copyPublicWorkToPractice, getPublicWorkProcess, setPublishedWorkPullFilm } from "./public-work-process-service";

const now = "2026-08-18T00:00:00.000Z";
const work = {
    id: "work-one",
    ownerUserId: "owner-one",
    slug: "publicwork123",
    sourceType: "canvas",
    sourceId: "canvas-one",
    lifecycleStatus: "active",
    currentVersionId: "version-one",
    publishedVersionId: "version-one",
};
const version = {
    id: "version-one",
    workId: "work-one",
    title: "公开画布",
    moderationStatus: "approved",
    visibility: "public",
    pullFilmEnabled: true,
    pullFilmSnapshot: { sourceType: "canvas", versionId: "version-one", title: "公开画布", nodes: [], connections: [], assets: [] },
    updatedAt: now,
};

describe("public work process service", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.users.getById.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.workPublications.getWorkById.mockResolvedValue(work);
        mocks.workPublications.getWorkBySlug.mockResolvedValue(work);
        mocks.workPublications.getPublicWork.mockResolvedValue({ ...work, publishedVersion: version, assets: [] });
        mocks.workPublications.getVersionById.mockResolvedValue(version);
        mocks.workPublications.getSourceJson.mockResolvedValue({ title: "公开画布", value: { title: "公开画布", nodes: [], connections: [], chatSessions: [{ messages: [{ text: "private" }] }] } });
        mocks.workPublications.listVersionAssets.mockResolvedValue([]);
        mocks.practice.setPullFilmVersion.mockImplementation(async (input) => ({ workId: input.workId, versionId: input.versionId, enabled: input.enabled, snapshot: input.snapshot, enabledAt: now, enabledByUserId: input.enabledByUserId }));
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "membership-one", role: "student" });
    });

    it("locks the current public version and persists only a sanitized version-bound snapshot", async () => {
        const result = await setPublishedWorkPullFilm("admin-one", "work-one", true);

        expect(mocks.workPublications.getWorkById).toHaveBeenCalledWith("work-one", undefined, true);
        expect(mocks.workPublications.getVersionById).toHaveBeenCalledWith("version-one", true);
        expect(mocks.practice.setPullFilmVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                workId: "work-one",
                versionId: "version-one",
                enabled: true,
                enabledByUserId: "admin-one",
                snapshot: { sourceType: "canvas", versionId: "version-one", title: "公开画布", nodes: [], connections: [], assets: [] },
            }),
        );
        expect(JSON.stringify(result)).not.toContain("private");
    });

    it("rejects non-content admins, media works and stale public versions", async () => {
        mocks.users.getById.mockResolvedValueOnce({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["users.read"] });
        await expect(setPublishedWorkPullFilm("admin-one", "work-one", true)).rejects.toMatchObject({ status: 403 });

        mocks.workPublications.getWorkById.mockResolvedValueOnce({ ...work, sourceType: "media" });
        await expect(setPublishedWorkPullFilm("admin-one", "work-one", true)).rejects.toMatchObject({ status: 409 });

        mocks.workPublications.getVersionById.mockResolvedValueOnce({ ...version, moderationStatus: "taken_down" });
        await expect(setPublishedWorkPullFilm("admin-one", "work-one", true)).rejects.toMatchObject({ status: 404 });
    });

    it("returns a process only while the same public approved version remains enabled", async () => {
        await expect(getPublicWorkProcess("publicwork123")).resolves.toEqual({ ...version.pullFilmSnapshot, assets: [] });

        mocks.workPublications.getPublicWork.mockResolvedValueOnce({ ...work, publishedVersion: { ...version, pullFilmEnabled: false }, assets: [] });
        await expect(getPublicWorkProcess("publicwork123")).rejects.toMatchObject({ status: 404 });
    });

    it("removes process and copy access when disabled and does not expose a mark from an older version", async () => {
        await expect(setPublishedWorkPullFilm("admin-one", "work-one", false)).resolves.toMatchObject({ hasProcess: false, processVersionId: undefined, snapshot: undefined });
        expect(mocks.practice.setPullFilmVersion).toHaveBeenCalledWith(expect.objectContaining({ workId: "work-one", versionId: "version-one", enabled: false, snapshot: undefined }));

        const newVersion = { ...version, id: "version-two", pullFilmEnabled: false, pullFilmSnapshot: undefined };
        mocks.workPublications.getPublicWork.mockResolvedValueOnce({ ...work, publishedVersionId: "version-two", publishedVersion: newVersion, assets: [] });
        await expect(getPublicWorkProcess("publicwork123")).rejects.toMatchObject({ status: 404 });

        mocks.workPublications.getWorkBySlug.mockResolvedValueOnce({ ...work, publishedVersionId: "version-two" });
        mocks.workPublications.getVersionById.mockResolvedValueOnce(newVersion);
        await expect(copyPublicWorkToPractice({ id: "student-one", role: "user" }, "publicwork123", "request-disabled")).rejects.toMatchObject({ status: 404 });
        expect(mocks.practice.createPracticeProjectCopy).not.toHaveBeenCalled();
    });

    it("claims idempotency before creating the project in the same transaction", async () => {
        mocks.practice.claimCopyRequest.mockImplementation(async (input) => ({ ...input, createdAt: now, updatedAt: now }));
        mocks.practice.createPracticeProjectCopy.mockResolvedValue(undefined);

        const result = await copyPublicWorkToPractice({ id: "student-one", role: "user" }, "publicwork123", "request-one");

        const claimed = mocks.practice.claimCopyRequest.mock.invocationCallOrder[0];
        const created = mocks.practice.createPracticeProjectCopy.mock.invocationCallOrder[0];
        expect(claimed).toBeLessThan(created);
        expect(mocks.practice.claimCopyRequest).toHaveBeenCalledWith(expect.objectContaining({ userId: "student-one", sourceWorkId: "work-one", sourceVersionId: "version-one", projectKind: "canvas" }));
        expect(mocks.practice.createPracticeProjectCopy).toHaveBeenCalledWith(expect.objectContaining({ userId: "student-one", kind: "canvas", executionProfile: "open-source-practice" }));
        expect(result).toMatchObject({ kind: "canvas", projectId: expect.any(String) });
    });

    it("returns the first claimed project on a retry without creating another project", async () => {
        mocks.practice.claimCopyRequest.mockResolvedValue({
            userId: "student-one",
            clientRequestId: "request-one",
            sourceWorkId: "work-one",
            sourceVersionId: "version-one",
            projectKind: "canvas",
            projectId: "practice-existing",
            createdAt: now,
            updatedAt: now,
        });

        await expect(copyPublicWorkToPractice({ id: "student-one", role: "user" }, "publicwork123", "request-one")).resolves.toEqual({ kind: "canvas", projectId: "practice-existing", clientRequestId: "request-one" });
        expect(mocks.practice.createPracticeProjectCopy).not.toHaveBeenCalled();
    });
});
