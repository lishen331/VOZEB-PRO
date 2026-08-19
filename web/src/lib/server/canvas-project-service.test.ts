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
    listCanvasProjectSummaries: vi.fn(),
    updateCanvasProject: vi.fn(),
    updateCanvasProjectMutationPatch: vi.fn(),
    deleteUserLocalMediaAssets: vi.fn(),
    validateIpReferences: vi.fn(),
    recordIpReferenceUsage: vi.fn(),
}));

vi.mock("@/lib/server/creative-runtime-store", () => ({ createCreativeConversation: mocks.createCreativeConversation, updateCreativeConversation: mocks.updateCreativeConversation }));
vi.mock("@/lib/server/canvas-project-store", () => ({
    CanvasProjectStoreError: class CanvasProjectStoreError extends Error {
        status = 409;
    },
    createCanvasProject: mocks.createCanvasProject,
    getCanvasProject: mocks.getCanvasProject,
    listCanvasProjectSummaries: mocks.listCanvasProjectSummaries,
    updateCanvasProject: mocks.updateCanvasProject,
    updateCanvasProjectMutationPatch: mocks.updateCanvasProjectMutationPatch,
}));
vi.mock("@/lib/server/creative-entity-deletion-store", () => ({
    CreativeEntityDeletionConflict: mocks.CreativeEntityDeletionConflict,
    deleteCanvasProjectAggregates: mocks.deleteCanvasProjectAggregates,
    deleteCanvasAssistantConversationAggregates: mocks.deleteCanvasAssistantConversationAggregates,
}));
vi.mock("@/lib/server/local-media-storage", () => ({ deleteUserLocalMediaAssets: mocks.deleteUserLocalMediaAssets }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({
    normalizeIpReferences: (value: unknown) => (Array.isArray(value) ? value : []),
    validateIpReferences: mocks.validateIpReferences,
    recordIpReferenceUsage: mocks.recordIpReferenceUsage,
}));

import { createCanvasProjectForUser, deleteCanvasAssistantConversationsForUser, deleteCanvasProjectsForUser, updateCanvasProjectForUser } from "./canvas-project-service";

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
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("user-one", ["permanent/canvas.png"]);
    });

    it("deletes only assistant conversations linked to the current Canvas project", async () => {
        mocks.getCanvasProject.mockResolvedValue({ ...project(), chatSessions: [assistantSession("session-one", "conversation-agent")] });

        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-agent"])).resolves.toMatchObject({ deleted: 1, activeChatId: "session-new" });

        expect(mocks.deleteCanvasAssistantConversationAggregates).toHaveBeenCalledWith("user-one", "canvas-one", ["conversation-agent"]);
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("user-one", ["permanent/assistant.png"]);
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
        expect(mocks.deleteUserLocalMediaAssets).not.toHaveBeenCalled();
    });

    it("protects the Canvas primary conversation and unrelated assistant conversations", async () => {
        mocks.getCanvasProject.mockResolvedValue({ ...project(), chatSessions: [assistantSession("session-one", "conversation-agent")] });
        mocks.deleteCanvasAssistantConversationAggregates.mockRejectedValue(new mocks.CreativeEntityDeletionConflict("Agent 对话与当前画布不匹配"));

        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-one"])).rejects.toMatchObject({ status: 409 });
        await expect(deleteCanvasAssistantConversationsForUser("user-one", "canvas-one", ["conversation-other"])).rejects.toMatchObject({ status: 409 });
        expect(mocks.deleteUserLocalMediaAssets).not.toHaveBeenCalled();
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
