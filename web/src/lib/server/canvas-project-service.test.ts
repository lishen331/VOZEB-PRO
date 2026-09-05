import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasProject } from "@/lib/canvas-project-contract";

const mocks = vi.hoisted(() => ({
    CreativeEntityDeletionConflict: class CreativeEntityDeletionConflict extends Error {},
    createCreativeConversation: vi.fn(),
    updateCreativeConversation: vi.fn(),
    createCanvasProject: vi.fn(),
    deleteCanvasProjectAggregates: vi.fn(),
    deleteCanvasAssistantConversationAggregates: vi.fn(),
    getCanvasProject: vi.fn(),
    getCanvasProjectWithOwner: vi.fn(),
    listCanvasProjectSummaries: vi.fn(),
    listDramaLabCanvasProjectSummariesForProjects: vi.fn(),
    listDramaLabProjectIdsForUser: vi.fn(),
    updateCanvasProject: vi.fn(),
    updateCanvasProjectMutationPatch: vi.fn(),
    deleteUserMediaAssetsCascade: vi.fn(),
    validateIpReferences: vi.fn(),
    recordIpReferenceUsage: vi.fn(),
    getDramaLabProjectGroup: vi.fn(),
    getDramaLabMembership: vi.fn(),
    getDramaProjectWithOwner: vi.fn(),
}));

vi.mock("@/lib/server/creative-runtime-store", () => ({ createCreativeConversation: mocks.createCreativeConversation, updateCreativeConversation: mocks.updateCreativeConversation }));
vi.mock("@/lib/server/canvas-project-store", () => ({
    CanvasProjectStoreError: class CanvasProjectStoreError extends Error {
        status = 409;
    },
    createCanvasProject: mocks.createCanvasProject,
    getCanvasProject: mocks.getCanvasProject,
    getCanvasProjectWithOwner: mocks.getCanvasProjectWithOwner,
    listCanvasProjectSummaries: mocks.listCanvasProjectSummaries,
    listDramaLabCanvasProjectSummariesForProjects: mocks.listDramaLabCanvasProjectSummariesForProjects,
    updateCanvasProject: mocks.updateCanvasProject,
    updateCanvasProjectMutationPatch: mocks.updateCanvasProjectMutationPatch,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ getDramaLabProjectGroup: mocks.getDramaLabProjectGroup, getDramaLabMembership: mocks.getDramaLabMembership, listDramaLabProjectIdsForUser: mocks.listDramaLabProjectIdsForUser }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProjectWithOwner: mocks.getDramaProjectWithOwner }));
vi.mock("@/lib/server/creative-entity-deletion-store", () => ({
    CreativeEntityDeletionConflict: mocks.CreativeEntityDeletionConflict,
    deleteCanvasProjectAggregates: mocks.deleteCanvasProjectAggregates,
    deleteCanvasAssistantConversationAggregates: mocks.deleteCanvasAssistantConversationAggregates,
}));
vi.mock("@/lib/server/user-media-deletion-service", () => ({ deleteUserMediaAssetsCascade: mocks.deleteUserMediaAssetsCascade }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({
    normalizeIpReferences: (value: unknown) => (Array.isArray(value) ? value : []),
    validateIpReferences: mocks.validateIpReferences,
    recordIpReferenceUsage: mocks.recordIpReferenceUsage,
}));

import {
    createCanvasProjectForUser,
    createDramaLabCanvasProjectForUser,
    deleteCanvasAssistantConversationsForUser,
    deleteDramaLabCanvasAssistantConversationsForUser,
    deleteCanvasProjectsForUser,
    deleteDramaLabEpisodeCanvasForUser,
    getCanvasProjectForUser,
    getDramaLabCanvasProjectForUser,
    listDramaLabCanvasProjectsForUser,
    updateCanvasProjectForUser,
    updateDramaLabCanvasProjectForUser,
} from "./canvas-project-service";

describe("canvas project service lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createCreativeConversation.mockResolvedValue({ id: "conversation-new" });
        mocks.updateCreativeConversation.mockResolvedValue(undefined);
        mocks.deleteCanvasProjectAggregates.mockResolvedValue({ deletedConversations: 1, deletedProjects: 1, mediaStorageKeys: ["permanent/canvas.png"] });
        mocks.deleteCanvasAssistantConversationAggregates.mockResolvedValue({
            deletedConversations: 1,
            deletedProjects: 0,
            mediaStorageKeys: ["permanent/assistant.png"],
            canvasAssistantState: { chatSessions: [assistantSession("session-new")], activeChatId: "session-new" },
        });
        mocks.getCanvasProject.mockResolvedValue(null);
        mocks.getCanvasProjectWithOwner.mockResolvedValue(null);
        mocks.getDramaLabProjectGroup.mockResolvedValue(null);
        mocks.getDramaLabMembership.mockResolvedValue(null);
        mocks.listDramaLabProjectIdsForUser.mockResolvedValue([]);
        mocks.listDramaLabCanvasProjectSummariesForProjects.mockResolvedValue({ projects: [], total: 0, page: 1, pageSize: 12 });
        mocks.getDramaProjectWithOwner.mockResolvedValue({ project: { id: "drama-one", episodes: [{ id: "episode-one", shots: [] }] }, ownerUserId: "owner-one" });
        mocks.validateIpReferences.mockResolvedValue([]);
        mocks.recordIpReferenceUsage.mockResolvedValue(undefined);
    });

    it("archives the new conversation without deleting another project when project creation fails", async () => {
        const error = new Error("write failed");
        mocks.createCanvasProject.mockRejectedValue(error);

        await expect(createCanvasProjectForUser("user-one", { title: "画布" })).rejects.toBe(error);

        expect(mocks.updateCreativeConversation).toHaveBeenCalledWith("conversation-new", "user-one", { status: "archived" });
        expect(mocks.deleteCanvasProjectAggregates).not.toHaveBeenCalled();
    });

    it("reuses a source handoff project through a user-scoped stable primary key", async () => {
        mocks.createCanvasProject.mockImplementation(async (_userId, value) => value);

        const first = await createCanvasProjectForUser("user-one", { sourceHandoffId: "handoff-one" });
        const second = await createCanvasProjectForUser("user-two", { sourceHandoffId: "handoff-one" });

        expect(first.id).not.toBe(second.id);
        expect(first.id).toMatch(/^canvas-handoff-/);
        expect(second.id).toMatch(/^canvas-handoff-/);
    });

    it("reserves the drama-lab handoff namespace for the episode canvas service", async () => {
        const sourceHandoffId = "drama-lab-canvas:drama-one:episode:episode-one";
        mocks.createCanvasProject.mockImplementation(async (_userId, value) => value);

        await expect(createCanvasProjectForUser("user-one", { sourceHandoffId })).rejects.toMatchObject({ status: 400 });
        await expect(createDramaLabCanvasProjectForUser("user-one", { sourceHandoffId })).resolves.toMatchObject({ sourceHandoffId });

        expect(mocks.createCanvasProject).toHaveBeenCalledTimes(1);
    });

    it("hashes the complete episode handoff key instead of truncating distinct suffixes", async () => {
        mocks.createCanvasProject.mockImplementation(async (_userId, value) => value);
        const sharedPrefix = `drama-lab-canvas:${"project".repeat(20)}:episode:${"episode".repeat(20)}`;
        const first = await createDramaLabCanvasProjectForUser("user-one", { sourceHandoffId: `${sharedPrefix}-one` });
        const second = await createDramaLabCanvasProjectForUser("user-one", { sourceHandoffId: `${sharedPrefix}-two` });

        expect(first.id).not.toBe(second.id);
        expect(first.sourceHandoffId).toBe(`${sharedPrefix}-one`);
        expect(second.sourceHandoffId).toBe(`${sharedPrefix}-two`);
    });

    it("rejects an oversized handoff key instead of silently collapsing it", async () => {
        await expect(createDramaLabCanvasProjectForUser("user-one", { sourceHandoffId: `drama-lab-canvas:${"x".repeat(600)}` })).rejects.toMatchObject({ status: 400 });
        expect(mocks.createCanvasProject).not.toHaveBeenCalled();
    });

    it("keeps drama-lab canvases inaccessible through ordinary detail reads", async () => {
        const dramaCanvas = { ...project(), sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" };
        mocks.getCanvasProject.mockResolvedValue(dramaCanvas);

        await expect(getCanvasProjectForUser("user-one", dramaCanvas.id)).rejects.toMatchObject({ status: 404 });
        await expect(getDramaLabCanvasProjectForUser("user-one", dramaCanvas.id)).resolves.toEqual(dramaCanvas);
    });

    it("returns the winning handoff project after a concurrent insert conflict", async () => {
        const existing = { ...project(), id: "canvas-handoff-existing", sourceHandoffId: "handoff-one" };
        mocks.getCanvasProject.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
        mocks.createCanvasProject.mockRejectedValue(new (await import("@/lib/server/canvas-project-store")).CanvasProjectStoreError("画布项目已存在", 409));

        await expect(createCanvasProjectForUser("user-one", { sourceHandoffId: "handoff-one" })).resolves.toEqual(existing);

        expect(mocks.updateCreativeConversation).toHaveBeenCalledWith("conversation-new", "user-one", { status: "archived" });
        expect(mocks.deleteCanvasProjectAggregates).not.toHaveBeenCalled();
    });

    it("validates and records stable IP references when creating a Canvas", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: ["item-one"] };
        mocks.validateIpReferences.mockResolvedValue([{ reference }]);
        mocks.createCanvasProject.mockImplementation(async (_userId, value) => value);

        const created = await createCanvasProjectForUser("user-one", { title: "IP 画布", ipReferences: [reference] });

        expect(mocks.validateIpReferences).toHaveBeenCalledWith("user-one", [reference]);
        expect(created).toMatchObject({ ipReferences: [reference] });
        expect(mocks.recordIpReferenceUsage).toHaveBeenCalledWith("user-one", { targetType: "canvas", targetId: created.id, references: [reference] });
        expect(mocks.recordIpReferenceUsage.mock.invocationCallOrder[0]).toBeLessThan(mocks.createCanvasProject.mock.invocationCallOrder[0]);
    });

    it("records a practice target when Canvas is created through the practice workspace", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        mocks.validateIpReferences.mockResolvedValue([{ reference }]);
        mocks.createCanvasProject.mockImplementation(async (_userId, value) => value);

        const created = await createCanvasProjectForUser("user-one", { title: "IP 练习画布", ipReferences: [reference] }, { executionProfile: "open-source-practice" });

        expect(mocks.recordIpReferenceUsage).toHaveBeenCalledWith("user-one", { targetType: "practice", targetId: created.id, references: [reference] });
    });

    it("does not create a Canvas when initial IP usage cannot be recorded", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        mocks.validateIpReferences.mockResolvedValue([{ reference }]);
        mocks.recordIpReferenceUsage.mockRejectedValue(new Error("usage failed"));

        await expect(createCanvasProjectForUser("user-one", { title: "IP 画布", ipReferences: [reference] })).rejects.toThrow("usage failed");

        expect(mocks.createCanvasProject).not.toHaveBeenCalled();
        expect(mocks.updateCreativeConversation).toHaveBeenCalledWith("conversation-new", "user-one", { status: "archived" });
    });

    it("deletes linked conversations and reclaims only unreferenced media after deleting projects", async () => {
        await deleteCanvasProjectsForUser("user-one", ["canvas-one"]);

        expect(mocks.deleteCanvasProjectAggregates).toHaveBeenCalledWith("user-one", ["canvas-one"]);
        expect(mocks.deleteUserMediaAssetsCascade).toHaveBeenCalledWith("user-one", ["permanent/canvas.png"]);
    });

    it("does not pass drama-lab canvas ids into the ordinary project deletion cascade", async () => {
        mocks.getCanvasProject.mockResolvedValue({ ...project(), sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" });

        await expect(deleteCanvasProjectsForUser("user-one", ["canvas-one"])).rejects.toMatchObject({ status: 404 });

        expect(mocks.deleteCanvasProjectAggregates).not.toHaveBeenCalled();
        expect(mocks.deleteUserMediaAssetsCascade).not.toHaveBeenCalled();
    });

    it("deletes exactly one episode-bound drama canvas through the dedicated cascade", async () => {
        mocks.createCanvasProject.mockImplementation(async (_userId, value) => value);
        const created = await createDramaLabCanvasProjectForUser("user-one", { sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" });
        mocks.getCanvasProject.mockResolvedValue(created);

        await expect(deleteDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one")).resolves.toBe(true);

        expect(mocks.deleteCanvasProjectAggregates).toHaveBeenCalledWith("user-one", [created.id], { includeDramaLab: true });
        expect(mocks.deleteUserMediaAssetsCascade).toHaveBeenCalledWith("user-one", ["permanent/canvas.png"]);
    });

    it("lists episode canvases for every project the caller can access", async () => {
        mocks.listDramaLabProjectIdsForUser.mockResolvedValue(["drama-one", "drama-two"]);
        mocks.listDramaLabCanvasProjectSummariesForProjects.mockResolvedValue({ projects: [{ id: "canvas-one" }], total: 1, page: 2, pageSize: 5 });

        await expect(listDramaLabCanvasProjectsForUser("collaborator", { page: 2, pageSize: 5 })).resolves.toMatchObject({ total: 1, page: 2, pageSize: 5 });

        expect(mocks.listDramaLabProjectIdsForUser).toHaveBeenCalledWith("collaborator");
        expect(mocks.listDramaLabCanvasProjectSummariesForProjects).toHaveBeenCalledWith(["drama-one", "drama-two"], { page: 2, pageSize: 5 });
        expect(mocks.listCanvasProjectSummaries).not.toHaveBeenCalled();
    });

    it("deletes a collaborator-visible episode Canvas under the stable storage owner", async () => {
        const dramaCanvas = { ...project(), id: "canvas-owner", sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" };
        mocks.getDramaLabProjectGroup.mockResolvedValue({ id: "group-one", projectId: "drama-one", ownerUserId: "manager-one" });
        mocks.getDramaLabMembership.mockResolvedValue({ userId: "collaborator", role: "member", status: "active" });
        mocks.getDramaProjectWithOwner.mockResolvedValue({ project: { id: "drama-one", episodes: [{ id: "episode-one", shots: [] }] }, ownerUserId: "owner-one" });
        mocks.getCanvasProject.mockImplementation(async (id: string, ownerUserId: string) => (id === "canvas-owner" && ownerUserId === "owner-one" ? dramaCanvas : null));

        // The production id is derived from the owner/source handoff pair;
        // use the same helper indirectly by accepting the actual lookup.
        mocks.getCanvasProject.mockResolvedValue(dramaCanvas);
        await expect(deleteDramaLabEpisodeCanvasForUser("collaborator", "drama-one", "episode-one")).resolves.toBe(true);

        expect(mocks.getDramaLabMembership).toHaveBeenCalledWith("collaborator", "drama-one");
        expect(mocks.deleteCanvasProjectAggregates).toHaveBeenCalledWith("owner-one", [expect.stringMatching(/^canvas-handoff-/)], { includeDramaLab: true });
        expect(mocks.deleteUserMediaAssetsCascade).toHaveBeenCalledWith("owner-one", ["permanent/canvas.png"]);
    });

    it("does not delete a canvas whose stored handoff does not exactly match the episode", async () => {
        mocks.getCanvasProject.mockResolvedValue({ ...project(), sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-other" });

        await expect(deleteDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one")).resolves.toBe(false);
        expect(mocks.deleteCanvasProjectAggregates).not.toHaveBeenCalled();
    });

    it("deletes only assistant conversations linked to the current Canvas project", async () => {
        mocks.getCanvasProject.mockResolvedValue({ ...project(), chatSessions: [assistantSession("session-one", "conversation-agent")] });

        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-agent"])).resolves.toMatchObject({ deleted: 1, activeChatId: "session-new" });

        expect(mocks.deleteCanvasAssistantConversationAggregates).toHaveBeenCalledWith("user-one", "canvas-one", ["conversation-agent"]);
        expect(mocks.deleteUserMediaAssetsCascade).toHaveBeenCalledWith("user-one", ["permanent/assistant.png"]);
    });

    it("blocks ordinary assistant-conversation deletion for drama-lab canvases", async () => {
        mocks.getCanvasProject.mockResolvedValue({
            ...project(),
            sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
            chatSessions: [assistantSession("session-one", "conversation-agent")],
        });

        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-agent"])).rejects.toMatchObject({ status: 404 });

        expect(mocks.deleteCanvasAssistantConversationAggregates).not.toHaveBeenCalled();
        expect(mocks.deleteUserMediaAssetsCascade).not.toHaveBeenCalled();
    });

    it("allows assistant-conversation deletion only through the dedicated drama-lab scope", async () => {
        mocks.getCanvasProject.mockResolvedValue({
            ...project(),
            sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
            chatSessions: [assistantSession("session-one", "conversation-agent")],
        });

        await deleteDramaLabCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-agent"]);

        expect(mocks.deleteCanvasAssistantConversationAggregates).toHaveBeenCalledWith("user-one", "canvas-one", ["conversation-agent"], { includeDramaLab: true });
    });

    it("allows an active project member to read, mutate, and delete assistant conversations through the Canvas storage owner", async () => {
        const dramaCanvas = {
            ...project(),
            sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
            chatSessions: [assistantSession("session-one", "conversation-agent")],
        };
        mocks.getCanvasProject.mockResolvedValue(null);
        mocks.getCanvasProjectWithOwner.mockResolvedValue({ project: dramaCanvas, ownerUserId: "owner-one" });
        mocks.getDramaLabProjectGroup.mockResolvedValue({ id: "group-one", projectId: "drama-one", ownerUserId: "owner-one" });
        mocks.getDramaLabMembership.mockResolvedValue({ userId: "member-one", role: "member", status: "active", permissions: { manageMembers: false, approve: false } });
        mocks.getDramaProjectWithOwner.mockResolvedValue({ project: { id: "drama-one", episodes: [{ id: "episode-one", shots: [] }] }, ownerUserId: "owner-one" });
        mocks.updateCanvasProjectMutationPatch.mockResolvedValue({ projectId: dramaCanvas.id, updatedAt: "2026-09-02T00:00:01.000Z", mutationId: "member-mutation" });

        await expect(getDramaLabCanvasProjectForUser("member-one", dramaCanvas.id)).resolves.toEqual(dramaCanvas);
        await expect(updateDramaLabCanvasProjectForUser("member-one", dramaCanvas.id, { mutation: { mutationId: "member-mutation", baseUpdatedAt: dramaCanvas.updatedAt } })).resolves.toMatchObject({ projectId: dramaCanvas.id });
        await expect(deleteDramaLabCanvasAssistantConversationsForUser("member-one", dramaCanvas.id, ["conversation-agent"])).resolves.toMatchObject({ deleted: 1 });

        expect(mocks.updateCanvasProjectMutationPatch).toHaveBeenCalledWith("owner-one", dramaCanvas.id, expect.objectContaining({ mutationId: "member-mutation" }));
        expect(mocks.deleteCanvasAssistantConversationAggregates).toHaveBeenCalledWith("owner-one", dramaCanvas.id, ["conversation-agent"], { includeDramaLab: true });
        expect(mocks.deleteUserMediaAssetsCascade).toHaveBeenCalledWith("owner-one", ["permanent/assistant.png"]);
    });

    it("rejects a drama Canvas whose handoff points at a deleted episode", async () => {
        const dramaCanvas = { ...project(), sourceHandoffId: "drama-lab-canvas:drama-one:episode:deleted-episode" };
        mocks.getCanvasProject.mockResolvedValue(null);
        mocks.getCanvasProjectWithOwner.mockResolvedValue({ project: dramaCanvas, ownerUserId: "owner-one" });
        mocks.getDramaLabProjectGroup.mockResolvedValue({ id: "group-one", projectId: "drama-one", ownerUserId: "owner-one" });
        mocks.getDramaLabMembership.mockResolvedValue({ userId: "member-one", role: "member", status: "active", permissions: { manageMembers: false, approve: false } });
        mocks.getDramaProjectWithOwner.mockResolvedValue({ project: { id: "drama-one", episodes: [{ id: "episode-one", shots: [] }] }, ownerUserId: "owner-one" });

        await expect(getDramaLabCanvasProjectForUser("member-one", dramaCanvas.id)).rejects.toMatchObject({ status: 404 });
    });

    it("returns the owned project state when no assistant conversation id is provided", async () => {
        const current = { ...project(), chatSessions: [assistantSession("session-one")], activeChatId: "session-one" };
        mocks.getCanvasProject.mockResolvedValue(current);

        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", [])).resolves.toEqual({
            deleted: 0,
            chatSessions: current.chatSessions,
            activeChatId: "session-one",
        });

        expect(mocks.getCanvasProject).toHaveBeenCalledWith("canvas-one", "user-one");
        expect(mocks.deleteCanvasAssistantConversationAggregates).not.toHaveBeenCalled();
        expect(mocks.deleteUserMediaAssetsCascade).not.toHaveBeenCalled();
    });

    it("protects the Canvas primary conversation and unrelated assistant conversations", async () => {
        mocks.getCanvasProject.mockResolvedValue({ ...project(), chatSessions: [assistantSession("session-one", "conversation-agent")] });
        mocks.deleteCanvasAssistantConversationAggregates.mockRejectedValue(new mocks.CreativeEntityDeletionConflict("Agent 对话与当前画布不匹配"));

        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-one"])).rejects.toMatchObject({ status: 409 });
        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-other"])).rejects.toMatchObject({ status: 409 });
        expect(mocks.deleteUserMediaAssetsCascade).not.toHaveBeenCalled();
    });

    it("passes the explicit server version to the conditional store update", async () => {
        const current = project();
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.updateCanvasProject.mockResolvedValue({ ...current, title: "新标题" });

        await updateCanvasProjectForUser("user-one", current.id, { project: { ...current, title: "新标题" }, expectedUpdatedAt: current.updatedAt });

        expect(mocks.updateCanvasProject).toHaveBeenCalledWith("user-one", expect.objectContaining({ title: "新标题" }), current.updatedAt);
    });

    it("does not allow a revoked reference to be removed as a generation bypass", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        const current = { ...project(), ipReferences: [reference] };
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.validateIpReferences.mockRejectedValue(Object.assign(new Error("IP 授权已失效"), { status: 403 }));

        await expect(updateCanvasProjectForUser("user-one", current.id, { project: { ...current, ipReferences: [] }, expectedUpdatedAt: current.updatedAt })).rejects.toMatchObject({ status: 403 });

        expect(mocks.validateIpReferences).toHaveBeenCalledWith("user-one", [reference]);
        expect(mocks.updateCanvasProject).not.toHaveBeenCalled();
    });

    it("records IP usage before persisting a reference update", async () => {
        const current = project();
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.validateIpReferences.mockResolvedValue([{ reference }]);
        mocks.recordIpReferenceUsage.mockRejectedValueOnce(new Error("usage failed"));

        await expect(updateCanvasProjectForUser("user-one", current.id, { project: { ...current, ipReferences: [reference] }, expectedUpdatedAt: current.updatedAt })).rejects.toThrow("usage failed");

        expect(mocks.updateCanvasProject).not.toHaveBeenCalled();
    });

    it("always advances the persisted version beyond the current snapshot", async () => {
        const current = { ...project(), updatedAt: "2099-01-01T00:00:00.000Z" };
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.updateCanvasProject.mockImplementation(async (_userId, next) => next);

        await updateCanvasProjectForUser("user-one", current.id, { project: { ...current, title: "新标题" }, expectedUpdatedAt: current.updatedAt });

        const saved = mocks.updateCanvasProject.mock.calls[0][1] as CanvasProject;
        expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(current.updatedAt));
    });

    it("rejects saves without a valid base version", async () => {
        await expect(updateCanvasProjectForUser("user-one", "canvas-one", { project: project() })).rejects.toMatchObject({ status: 400 });
        expect(mocks.getCanvasProject).not.toHaveBeenCalled();
    });

    it("applies a compact mutation and returns an idempotent save acknowledgement", async () => {
        const current = project();
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.updateCanvasProjectMutationPatch.mockResolvedValue({ projectId: current.id, updatedAt: "2026-08-01T00:00:00.001Z", mutationId: "mutation-one" });

        await expect(
            updateCanvasProjectForUser("user-one", current.id, {
                mutation: {
                    mutationId: "mutation-one",
                    baseUpdatedAt: current.updatedAt,
                    title: "增量标题",
                    viewport: { x: 12, y: 24, k: 0.05 },
                },
            }),
        ).resolves.toMatchObject({ projectId: current.id, mutationId: "mutation-one" });

        expect(mocks.updateCanvasProjectMutationPatch).toHaveBeenCalledWith("user-one", current.id, expect.objectContaining({ title: "增量标题", viewport: { x: 12, y: 24, k: 0.05 } }));
        expect(mocks.updateCanvasProject).not.toHaveBeenCalled();
    });

    it("blocks ordinary mutations while allowing the dedicated drama-lab mutation path", async () => {
        const current = { ...project(), sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" };
        const mutation = { mutationId: "mutation-drama", baseUpdatedAt: current.updatedAt, title: "Drama Canvas" };
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.updateCanvasProjectMutationPatch.mockResolvedValue({ projectId: current.id, updatedAt: "2026-08-01T00:00:00.001Z", mutationId: mutation.mutationId });

        await expect(updateCanvasProjectForUser("user-one", current.id, { mutation })).rejects.toMatchObject({ status: 404 });
        await expect(updateDramaLabCanvasProjectForUser("user-one", current.id, { mutation })).resolves.toMatchObject({ projectId: current.id, mutationId: mutation.mutationId });

        expect(mocks.updateCanvasProjectMutationPatch).toHaveBeenCalledTimes(1);
    });

    it("keeps only stable unique entity ids in compact upserts", async () => {
        const current = project();
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.updateCanvasProjectMutationPatch.mockResolvedValue({ projectId: current.id, updatedAt: current.updatedAt, mutationId: "mutation-ids" });

        await updateCanvasProjectForUser("user-one", current.id, {
            mutation: {
                mutationId: "mutation-ids",
                baseUpdatedAt: current.updatedAt,
                nodeUpserts: [{ id: "node-one", type: "text" }, { id: "node-one", type: "text", title: "latest" }, { id: "" }, { title: "missing-id" }],
                connectionUpserts: [
                    { id: "edge-one", fromNodeId: "node-one", toNodeId: "node-two" },
                    { id: "edge-one", fromNodeId: "node-two", toNodeId: "node-three" },
                ],
            },
        });

        expect(mocks.updateCanvasProjectMutationPatch).toHaveBeenCalledWith(
            "user-one",
            current.id,
            expect.objectContaining({
                nodeUpserts: [{ id: "node-one", type: "text", title: "latest" }],
                connectionUpserts: [{ id: "edge-one", fromNodeId: "node-two", toNodeId: "node-three" }],
            }),
        );
    });

    it("removes transient media payloads before compact persistence", async () => {
        const current = project();
        mocks.getCanvasProject.mockResolvedValue(current);
        mocks.updateCanvasProjectMutationPatch.mockResolvedValue({ projectId: current.id, updatedAt: current.updatedAt, mutationId: "mutation-media" });

        await updateCanvasProjectForUser("user-one", current.id, {
            mutation: {
                mutationId: "mutation-media",
                baseUpdatedAt: current.updatedAt,
                nodeUpserts: [{ id: "node-media", metadata: { content: "data:image/png;base64,AA==", preview: "blob:temporary" } }],
            },
        });

        expect(mocks.updateCanvasProjectMutationPatch).toHaveBeenCalledWith("user-one", current.id, expect.objectContaining({ nodeUpserts: [{ id: "node-media", metadata: { content: "", preview: "" } }] }));
    });
});

function project(): CanvasProject {
    const now = new Date().toISOString();
    return {
        id: "canvas-one",
        title: "画布",
        creativeConversationId: "conversation-one",
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
        createdAt: now,
        updatedAt: now,
    };
}

function assistantSession(id: string, conversationId?: string): CanvasProject["chatSessions"][number] {
    const now = new Date().toISOString();
    return { id, ...(conversationId ? { conversationId } : {}), title: "Agent 对话", messages: [], createdAt: now, updatedAt: now };
}
