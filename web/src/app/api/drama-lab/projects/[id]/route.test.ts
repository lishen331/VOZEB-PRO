import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteDramaProjectForUser: vi.fn(),
    deleteDramaLabProjectForUser: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    updateDramaProjectForUser: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({
    getDramaProject: mocks.getDramaProject,
}));
vi.mock("@/lib/server/drama-project-service", () => ({
    DramaProjectServiceError: class DramaProjectServiceError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    deleteDramaProjectForUser: mocks.deleteDramaProjectForUser,
    updateDramaProjectForUser: mocks.updateDramaProjectForUser,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    deleteDramaLabProjectForUser: mocks.deleteDramaLabProjectForUser,
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    updateDramaLabProjectForUser: mocks.updateDramaProjectForUser,
}));
vi.mock("@/lib/server/drama-lab-collaboration-error", () => ({
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
}));

import { DramaProjectServiceError } from "@/lib/server/drama-project-service";
import { DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { DELETE, PUT } from "./route";

describe("DELETE /api/drama-lab/projects/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.deleteDramaProjectForUser.mockResolvedValue(undefined);
        mocks.deleteDramaLabProjectForUser.mockResolvedValue(undefined);
        mocks.getDramaProject.mockResolvedValue({ id: "drama-one", title: "项目", episodes: [{ id: "episode-one", title: "第一集", script: "", shots: [] }], updatedAt: "2026-08-25T00:00:00.000Z" });
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.updateDramaProjectForUser.mockImplementation(async (_userId: string, _id: string, value: unknown) => value);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it("requires authentication before deleting a project", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(401);
        expect(mocks.deleteDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("deletes the requested project for the current user", async () => {
        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(200);
        expect(mocks.deleteDramaLabProjectForUser).toHaveBeenCalledWith("user-one", "drama-one");
        await expect(response.json()).resolves.toMatchObject({ code: 0, msg: "项目删除成功" });
    });

    it("routes project updates through the service so removed episode canvases are reclaimed", async () => {
        const response = await PUT(
            new Request("http://localhost/api/drama-lab/projects/drama-one", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "新标题", episodes: [] }),
            }),
            context("drama-one"),
        );

        expect(response.status).toBe(200);
        expect(mocks.updateDramaProjectForUser).toHaveBeenCalledWith("user-one", "drama-one", expect.objectContaining({ id: "drama-one", title: "新标题", episodes: [] }));
    });

    it("preserves frame workflow data when the workbench saves flat shots", async () => {
        mocks.getDramaProject.mockResolvedValue({
            id: "drama-one",
            title: "Project",
            episodes: [{ id: "episode-one", title: "Episode One", script: "", shots: [{ id: "shot-one", order: 1 }] }],
            updatedAt: "2026-09-01T00:00:00.000Z",
        });
        const frameWorkflow = {
            frames: {
                first: {
                    prompt: "first frame prompt",
                    description: "opening state",
                    status: "success",
                    taskId: "first-frame-task",
                    attempt: 2,
                    url: "/api/reference-assets/permanent/first.png",
                    storageKey: "permanent/first.png",
                    width: 1280,
                    height: 720,
                    history: [{ id: "first-history", taskId: "first-frame-task", url: "/api/reference-assets/permanent/first.png", prompt: "first frame prompt", createdAt: "2026-09-01T01:00:00.000Z" }],
                    source: "uploaded",
                    locked: true,
                },
                key: { prompt: "key frame prompt", status: "running", taskId: "key-frame-task", attempt: 1, source: "generated", locked: false },
                last: {
                    prompt: "last frame prompt",
                    status: "success",
                    url: "/api/reference-assets/permanent/tail.png",
                    storageKey: "permanent/tail.png",
                    source: "video_tail",
                    sourceVideoTaskId: "video-task-one",
                    sourceShotId: "shot-one",
                    sourceVideoHistoryId: "video-history-one",
                    locked: true,
                },
            },
            firstFrameCandidate: {
                id: "candidate-one",
                frameType: "first",
                url: "/api/reference-assets/permanent/candidate.png",
                storageKey: "permanent/candidate.png",
                width: 1280,
                height: 720,
                source: "video_tail",
                sourceVideoTaskId: "video-task-zero",
                sourceShotId: "shot-zero",
                sourceVideoHistoryId: "video-history-zero",
                createdAt: "2026-09-01T01:01:00.000Z",
                projectUpdatedAt: "2026-09-01T01:00:00.000Z",
            },
            videoFrameSnapshot: {
                capturedAt: "2026-09-01T01:02:00.000Z",
                model: "video-model",
                supportsFirstFrame: true,
                supportsLastFrame: true,
                maxReferenceImages: 2,
                references: [{ role: "first_frame", frameType: "first", url: "/api/reference-assets/permanent/first.png", storageKey: "permanent/first.png", source: "uploaded" }],
            },
            startFramePrompt: "legacy first-frame prompt",
            endFramePrompt: "legacy last-frame prompt",
            negativePrompt: "legacy negative prompt",
            storyboardFrameMode: "first_last",
            storyboardEndStatus: "success",
            storyboardEndAttempt: 3,
            storyboardEndTaskId: "storyboard-end-task",
            storyboardEndImageUrl: "/api/reference-assets/permanent/end.png",
            storyboardEndImageWidth: 1280,
            storyboardEndImageHeight: 720,
        };

        const response = await PUT(
            new Request("http://localhost/api/drama-lab/projects/drama-one", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodes: [{ id: "episode-one", title: "Episode One", number: 1, script: "" }],
                    shots: [{ id: "shot-one", episodeId: "episode-one", shotNumber: 1, script: "Shot One", duration: 3, characterIds: [], propIds: [], ...frameWorkflow }],
                }),
            }),
            context("drama-one"),
        );

        expect(response.status).toBe(200);
        const savedProject = mocks.updateDramaProjectForUser.mock.calls[0]?.[2] as { episodes?: Array<{ shots?: unknown[] }> };
        expect(savedProject.episodes?.[0]?.shots?.[0]).toMatchObject(frameWorkflow);
    });

    it.each([
        [404, "短剧项目不存在"],
        [409, "项目存在关联任务，暂时不能删除"],
    ])("preserves the service error status for %s", async (status, message) => {
        mocks.deleteDramaLabProjectForUser.mockRejectedValue(new DramaProjectServiceError(message, status));

        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(status);
        expect(mocks.deleteDramaLabProjectForUser).toHaveBeenCalledWith("user-one", "drama-one");
        await expect(response.json()).resolves.toMatchObject({ code: status, msg: message });
    });

    it("preserves collaboration authorization failures when deleting", async () => {
        mocks.deleteDramaLabProjectForUser.mockRejectedValue(new DramaLabCollaborationError("只有项目管理员可以删除项目", 403));

        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({ code: 403 });
    });
});

function context(id: string) {
    return { params: Promise.resolve({ id }) };
}
