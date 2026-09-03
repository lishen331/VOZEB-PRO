import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    appendDramaLabGenerationHistory: vi.fn((history, entry) => [...(history || []).filter((item: { taskId: string }) => item.taskId !== entry.taskId), entry]),
    fetchInternalApi: vi.fn(),
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    prepareDramaLabFrame: vi.fn(),
    resolveInternalOrigin: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: mocks.resolveInternalOrigin }));
vi.mock("@/lib/server/drama-project-store", () => {
    class DramaProjectStoreError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    }
    return { DramaProjectStoreError, getDramaProject: mocks.getDramaProject };
});
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(
            message: string,
            readonly status = 403,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/drama-lab-shot-generation-service", () => {
    class DramaLabShotGenerationError extends Error {
        constructor(
            message: string,
            readonly status = 400,
        ) {
            super(message);
        }
    }
    return {
        appendDramaLabGenerationHistory: mocks.appendDramaLabGenerationHistory,
        DramaLabShotGenerationError,
        findShot: (project: { episodes: Array<{ id: string; shots: Array<Record<string, unknown>> }> }, episodeId: string, shotId: string) => {
            const episode = project.episodes.find((item) => item.id === episodeId);
            if (!episode) throw new DramaLabShotGenerationError("episode missing", 404);
            const shot = episode.shots.find((item) => item.id === shotId);
            if (!shot) throw new DramaLabShotGenerationError("shot missing", 404);
            return { episode, shot };
        },
        persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate,
    };
});
vi.mock("@/lib/server/drama-lab-frame-generation-service", () => ({
    isDramaShotFrameType: (value: unknown) => value === "first" || value === "key" || value === "last",
    prepareDramaLabFrame: mocks.prepareDramaLabFrame,
}));

import { POST } from "./route";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";

const shot = {
    id: "shot-one",
    frames: {
        key: {
            prompt: "old prompt",
            description: "old description",
            status: "success",
            taskId: "old-task",
            url: "/old.png",
            width: 720,
            height: 1280,
            history: [{ id: "older-history", taskId: "older-task", url: "/older.png", prompt: "older prompt", createdAt: "2026-08-30T00:00:00.000Z" }],
            locked: false,
        },
    },
};
const project = { id: "project-one", title: "Project One", ratio: "9:16", creativeConversationId: "conversation-one", updatedAt: "2026-09-01T00:00:00.000Z", episodes: [{ id: "episode-one", shots: [shot] }] };
const context = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/generate-frame", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { imageModel: "image-logical" } });
        mocks.resolveInternalOrigin.mockReturnValue("http://internal.example.com");
        mocks.prepareDramaLabFrame.mockResolvedValue({ prompt: "new frame prompt", description: "new frame description", templateKey: "key_frame_prompt", references: [] });
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ task: { id: "new-frame-task", status: "running", model: "image-logical" } }));
        mocks.persistDramaLabShotUpdate.mockResolvedValue(project);
    });

    it("rejects a locked frame before creating an upstream task", async () => {
        const lockedProject = { ...project, episodes: [{ ...project.episodes[0], shots: [{ ...shot, frames: { key: { ...shot.frames.key, locked: true } } }] }] };
        mocks.getDramaProject.mockResolvedValue(lockedProject);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-frame?episodeId=episode-one&frameType=key", { method: "POST" }), context);

        expect(response.status).toBe(409);
        expect(mocks.prepareDramaLabFrame).not.toHaveBeenCalled();
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("persists a generated frame without replacing its historical versions", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-frame?episodeId=episode-one&frameType=key", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                retryOnConflict: false,
                patch: {
                    frames: {
                        key: expect.objectContaining({
                            source: "generated",
                            taskId: "new-frame-task",
                            status: "running",
                            url: undefined,
                            history: expect.arrayContaining([expect.objectContaining({ taskId: "older-task", url: "/older.png" }), expect.objectContaining({ taskId: "old-task", url: "/old.png" })]),
                        }),
                    },
                },
            }),
        );
    });

    it("returns a project conflict instead of replaying the frame patch", async () => {
        mocks.persistDramaLabShotUpdate.mockRejectedValue(new DramaProjectStoreError("project changed", 409));

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-frame?episodeId=episode-one&frameType=key", { method: "POST" }), context);

        expect(response.status).toBe(409);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(expect.objectContaining({ retryOnConflict: false }));
    });
});
