import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const files = new Map<string, unknown>();
    return {
        files,
        getDramaProject: vi.fn(),
        getDramaProjectWithOwner: vi.fn(),
        getDatabaseProvider: vi.fn(() => "file"),
        ensurePostgresSchema: vi.fn(),
        postgresQuery: vi.fn(),
        withPostgresTransaction: vi.fn(),
        isPostgresDatabaseEnabled: vi.fn(() => false),
        getPublicUsersByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, displayName: id, username: id, avatarUrl: undefined }))),
        readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(files.has(name) ? files.get(name) : fallback)),
        writeJsonDataFile: vi.fn(async (name: string, value: unknown) => files.set(name, structuredClone(value))),
        withJsonDataFileLock: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()),
        withJsonDataFileLocks: vi.fn(async (_names: string[], callback: () => Promise<unknown>) => callback()),
        updateDramaProjectForUser: vi.fn(),
        deleteDramaProjectForUser: vi.fn(),
    };
});

vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject, getDramaProjectWithOwner: mocks.getDramaProjectWithOwner }));
vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: mocks.getDatabaseProvider, isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled, ensurePostgresSchema: mocks.ensurePostgresSchema, postgresQuery: mocks.postgresQuery, withPostgresTransaction: mocks.withPostgresTransaction }));
vi.mock("@/lib/auth/store-actions", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("@/lib/server/data-adapter", () => ({ readJsonDataFile: mocks.readJsonDataFile, writeJsonDataFile: mocks.writeJsonDataFile, withJsonDataFileLock: mocks.withJsonDataFileLock, withJsonDataFileLocks: mocks.withJsonDataFileLocks }));
vi.mock("@/lib/server/drama-project-service", () => ({ updateDramaProjectForUser: mocks.updateDramaProjectForUser, deleteDramaProjectForUser: mocks.deleteDramaProjectForUser }));

import {
    DramaLabCollaborationError,
    ensureDramaLabProjectGroup,
    createDramaLabInvite,
    requestDramaLabJoin,
    listDramaLabJoinRequests,
    reviewDramaLabJoinRequest,
    listDramaLabMembers,
    removeDramaLabMember,
    leaveDramaLabProject,
    setDramaLabMemberRole,
    transferDramaLabOwnership,
    resolveDramaLabProjectForRequest,
    updateDramaLabProjectForUser,
    deleteDramaLabProjectForUser,
    saveDramaLabApprovalConfigs,
    submitDramaLabApproval,
    reviewDramaLabApproval,
    listDramaLabApprovals,
} from "./drama-lab-collaboration-service";

describe("drama lab collaboration service", () => {
    beforeEach(() => {
        mocks.files.clear();
        vi.clearAllMocks();
        mocks.getDatabaseProvider.mockReturnValue("file");
        const project = {
            id: "project-one",
            title: "短剧",
            ownerUserId: "owner",
            episodes: [{ id: "episode-one", shots: [] }],
            characters: [{ id: "character-one" }],
            scenes: [{ id: "scene-one" }],
            props: [{ id: "prop-one" }],
        };
        // The project store has a stable storage owner. Collaboration role
        // transfer must not rewrite this record.
        mocks.files.set("drama-projects.json", { version: 1, projects: [{ userId: "owner", project }] });
        mocks.getDramaProject.mockImplementation(async (_projectId: string, userId: string) => userId === "owner" ? project : null);
        mocks.getDramaProjectWithOwner.mockResolvedValue({ project, ownerUserId: "owner" });
        mocks.deleteDramaProjectForUser.mockResolvedValue(undefined);
    });

    it("requires owner confirmation before an invite applicant becomes a member", async () => {
        await ensureDramaLabProjectGroup("project-one", "owner");
        const invite = await createDramaLabInvite("owner", "project-one");
        expect(invite.token).toBeTruthy();
        await expect(requestDramaLabJoin("member", invite.token!)).resolves.toMatchObject({ projectId: "project-one", status: "pending" });
        await expect(listDramaLabMembers("owner", "project-one")).resolves.toEqual([expect.objectContaining({ userId: "owner", role: "owner" })]);
        const requests = await listDramaLabJoinRequests("owner", "project-one");
        expect(requests).toHaveLength(1);
        await expect(reviewDramaLabJoinRequest("owner", "project-one", requests[0].id, "approve")).resolves.toMatchObject({ status: "approved" });
        await expect(listDramaLabMembers("owner", "project-one", "member")).resolves.toEqual([expect.objectContaining({ userId: "member", role: "member" })]);
    });

    it("does not expose or search users outside the project", async () => {
        await ensureDramaLabProjectGroup("project-one", "owner");
        const invite = await createDramaLabInvite("owner", "project-one");
        await requestDramaLabJoin("member", invite.token!);
        await expect(listDramaLabMembers("owner", "project-one", "external")).resolves.toEqual([]);
        await expect(requestDramaLabJoin("member", invite.token!)).resolves.toMatchObject({ status: "pending" });
    });

    it("supports member exit, removal, and ownership transfer", async () => {
        await ensureDramaLabProjectGroup("project-one", "owner");
        const invite = await createDramaLabInvite("owner", "project-one");
        await requestDramaLabJoin("member", invite.token!);
        const request = (await listDramaLabJoinRequests("owner", "project-one"))[0];
        await reviewDramaLabJoinRequest("owner", "project-one", request.id, "approve");
        await expect(leaveDramaLabProject("member", "project-one")).resolves.toEqual({ left: true });
        await expect(leaveDramaLabProject("owner", "project-one")).rejects.toMatchObject({ status: 409 });
        await requestDramaLabJoin("member", invite.token!);
        const second = (await listDramaLabJoinRequests("owner", "project-one")).find((item) => item.status === "pending");
        await reviewDramaLabJoinRequest("owner", "project-one", second!.id, "approve");
        await expect(transferDramaLabOwnership("owner", "project-one", "member")).resolves.toMatchObject({ ownerUserId: "member" });
        expect((mocks.files.get("drama-projects.json") as { projects: Array<{ userId: string }> }).projects[0].userId).toBe("owner");
        await expect(listDramaLabMembers("owner", "project-one")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ userId: "owner", role: "admin" })]));
        await updateDramaLabProjectForUser("owner", "project-one", { id: "project-one", title: "owner-edit" });
        expect(mocks.updateDramaProjectForUser).toHaveBeenLastCalledWith("owner", "project-one", { id: "project-one", title: "owner-edit" });
        await expect(resolveDramaLabProjectForRequest("member", "project-one")).resolves.toMatchObject({ ownerUserId: "owner", project: { id: "project-one" } });
        await updateDramaLabProjectForUser("member", "project-one", { id: "project-one", title: "updated" });
        expect(mocks.updateDramaProjectForUser).toHaveBeenLastCalledWith("owner", "project-one", { id: "project-one", title: "updated" });
        await expect(transferDramaLabOwnership("owner", "project-one", "member")).rejects.toMatchObject({ status: 403 });
        await expect(setDramaLabMemberRole("member", "project-one", "member", "admin")).rejects.toMatchObject({ status: 409 });
        await expect(removeDramaLabMember("member", "project-one", "owner")).resolves.toEqual({ removed: true });
        await expect(resolveDramaLabProjectForRequest("owner", "project-one")).rejects.toMatchObject({ status: 403 });
        await expect(deleteDramaLabProjectForUser("owner", "project-one")).rejects.toMatchObject({ status: 403 });
        await deleteDramaLabProjectForUser("member", "project-one");
        expect(mocks.deleteDramaProjectForUser).toHaveBeenLastCalledWith("owner", "project-one");
    });

    it("transfers only logical ownership in postgres and keeps the project storage owner stable", async () => {
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        const groupRow = { id: "group-one", project_id: "project-one", owner_user_id: "owner", created_at: "2026-09-02T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z" };
        const transferredRow = { ...groupRow, owner_user_id: "member" };
        mocks.postgresQuery.mockResolvedValue({ rows: [groupRow] });
        const client = {
            query: vi.fn(async (sql: string, params?: unknown[]) => {
                if (sql.includes("SELECT * FROM drama_lab_project_groups")) return { rows: [groupRow] };
                if (sql.includes("SELECT id FROM drama_projects")) return { rows: [{ id: "project-one" }] };
                if (sql.includes("FROM drama_lab_project_members")) return { rows: [{ user_id: params?.[1] || "member", status: "active", role: "member", permissions: {} }] };
                if (sql.includes("UPDATE drama_lab_project_groups")) return { rows: [transferredRow] };
                return { rows: [] };
            }),
        };
        mocks.withPostgresTransaction.mockImplementation(async (callback: (value: typeof client) => Promise<unknown>) => callback(client));

        await expect(transferDramaLabOwnership("owner", "project-one", "member")).resolves.toMatchObject({ ownerUserId: "member" });
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE drama_projects"))).toBe(false);
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes("FOR UPDATE"))).toBe(true);
    });

    it("persists approval configuration and enforces strict predecessor stages", async () => {
        await ensureDramaLabProjectGroup("project-one", "owner");
        await saveDramaLabApprovalConfigs("owner", "project-one", {
            configs: [
                { stage: "script", enabled: true, strictMode: true },
                { stage: "assets", enabled: true, strictMode: true },
            ],
        });
        await expect(submitDramaLabApproval("owner", "project-one", { stage: "assets", resourceType: "character", resourceId: "character-one" })).rejects.toMatchObject({ status: 409 });
        const script = await submitDramaLabApproval("owner", "project-one", { stage: "script", resourceType: "episode", resourceId: "episode-one", episodeId: "episode-one", snapshot: { script: "draft" } });
        await reviewDramaLabApproval("owner", "project-one", script.id, "approve", "通过");
        const assets = await submitDramaLabApproval("owner", "project-one", { stage: "assets", resourceType: "character", resourceId: "character-one" });
        expect(assets.status).toBe("pending");
        await expect(listDramaLabApprovals("owner", "project-one")).resolves.toMatchObject({ total: 2, items: [expect.objectContaining({ stage: "assets" }), expect.objectContaining({ stage: "script", status: "approved" })] });
    });

    it("does not let an older approval bypass a newer rejected revision", async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-09-02T08:00:00.000Z"));
            await ensureDramaLabProjectGroup("project-one", "owner");
            await saveDramaLabApprovalConfigs("owner", "project-one", [
                { stage: "script", enabled: true, strictMode: true },
                { stage: "assets", enabled: true, strictMode: true },
                { stage: "final_export", enabled: true, strictMode: true },
            ]);

            const script = await submitDramaLabApproval("owner", "project-one", { stage: "script", resourceType: "episode", resourceId: "episode-one", episodeId: "episode-one" });
            await reviewDramaLabApproval("owner", "project-one", script.id, "approve");
            const firstAssets = await submitDramaLabApproval("owner", "project-one", { stage: "assets", resourceType: "character", resourceId: "character-one" });
            await reviewDramaLabApproval("owner", "project-one", firstAssets.id, "approve");

            vi.setSystemTime(new Date("2026-09-02T08:01:00.000Z"));
            const revisedAssets = await submitDramaLabApproval("owner", "project-one", { stage: "assets", resourceType: "character", resourceId: "character-one" });
            await reviewDramaLabApproval("owner", "project-one", revisedAssets.id, "reject", "角色设定需修改");

            await expect(submitDramaLabApproval("owner", "project-one", { stage: "final_export", resourceType: "project", resourceId: "project-one" })).rejects.toMatchObject({ status: 409 });

            vi.setSystemTime(new Date("2026-09-02T08:02:00.000Z"));
            const correctedAssets = await submitDramaLabApproval("owner", "project-one", { stage: "assets", resourceType: "character", resourceId: "character-one" });
            await reviewDramaLabApproval("owner", "project-one", correctedAssets.id, "approve");
            await expect(submitDramaLabApproval("owner", "project-one", { stage: "final_export", resourceType: "project", resourceId: "project-one" })).resolves.toMatchObject({ status: "pending" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("rejects approval records that point to a project-external resource", async () => {
        await ensureDramaLabProjectGroup("project-one", "owner");
        await saveDramaLabApprovalConfigs("owner", "project-one", [{ stage: "script", enabled: true }]);
        await expect(submitDramaLabApproval("owner", "project-one", { stage: "script", resourceType: "character", resourceId: "not-in-project" })).rejects.toBeInstanceOf(DramaLabCollaborationError);
    });

    it("requires an approval target to identify the exact episode and shot", async () => {
        const shot = (id: string) => ({ id, order: 1, title: id });
        mocks.getDramaProject.mockResolvedValue({
            id: "project-one",
            title: "短剧",
            episodes: [
                { id: "episode-one", shots: [shot("shot-one")] },
                { id: "episode-two", shots: [shot("shot-two")] },
            ],
            characters: [],
            scenes: [],
            props: [],
        });
        await ensureDramaLabProjectGroup("project-one", "owner");
        await saveDramaLabApprovalConfigs("owner", "project-one", [{ stage: "storyboard_image", enabled: true, strictMode: false }]);

        await expect(
            submitDramaLabApproval("owner", "project-one", { stage: "storyboard_image", resourceType: "shot", resourceId: "shot-two", episodeId: "episode-one" }),
        ).rejects.toMatchObject({ status: 400, message: "审批分镜与集数不匹配" });
        await expect(
            submitDramaLabApproval("owner", "project-one", { stage: "storyboard_image", resourceType: "shot", resourceId: "shot-one" }),
        ).rejects.toMatchObject({ status: 400, message: "审批分镜与集数不匹配" });
        await expect(
            submitDramaLabApproval("owner", "project-one", { stage: "storyboard_image", resourceType: "shot", resourceId: "shot-two", episodeId: "episode-two" }),
        ).resolves.toMatchObject({ episodeId: "episode-two", resourceId: "shot-two" });
    });
});
