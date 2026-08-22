import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    after: vi.fn(),
    appendDramaLabGenerationHistory: vi.fn((history, entry) => [...(history || []), entry]),
    findShot: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    getImageTask: vi.fn(),
    getVideoTask: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    resolveInternalOrigin: vi.fn(),
    runGenerationTaskRecoveryBatch: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: mocks.after };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: mocks.resolveInternalOrigin }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.runGenerationTaskRecoveryBatch }));
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
        findShot: mocks.findShot,
        persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate,
    };
});

import { POST } from "./route";

const shot = { id: "shot-one", title: "Shot One", imagePrompt: "image supplement", videoPrompt: "motion supplement", storyboardTaskId: "image-task-one", generationTaskId: "video-task-one", storyboardStatus: "running", generationStatus: "running" };
const project = { id: "project-one", updatedAt: "2026-08-22T00:00:00.000Z", episodes: [{ id: "episode-one", shots: [shot] }] };
const context = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/sync-generation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => ({
            ...candidate,
            episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
        }));
        mocks.resolveInternalOrigin.mockReturnValue("http://internal.example.com");
    });

    it("writes owned completed task results and their submitted prompts back to the matching shot", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "image-task-one", userId: "user-one", status: "success", prompt: "server-image-prompt", result: { serverUrl: "/api/generation-log-assets/image.png", width: 720, height: 1280 } });
        mocks.getVideoTask.mockResolvedValue({ id: "video-task-one", userId: "user-one", status: "success", prompt: "server-video-prompt", result: { url: "/api/generation-log-assets/video.mp4" } });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    storyboardStatus: "success",
                    storyboardImageUrl: "/api/generation-log-assets/image.png",
                    generationStatus: "success",
                    videoUrl: "/api/generation-log-assets/video.mp4",
                }),
            }),
        );
        const patch = mocks.persistDramaLabShotUpdate.mock.calls[0]?.[0].patch;
        expect(patch.storyboardHistory[0]).toMatchObject({ taskId: "image-task-one", prompt: "server-image-prompt", width: 720, height: 1280 });
        expect(patch.videoHistory[0]).toMatchObject({ taskId: "video-task-one", prompt: "server-video-prompt" });
        expect((await response.json()).data.shot).toMatchObject({ storyboardImageUrl: "/api/generation-log-assets/image.png", videoUrl: "/api/generation-log-assets/video.mp4" });
    });

    it("ignores task IDs owned by another user instead of exposing their media", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "image-task-one", userId: "other-user", status: "success", prompt: "private", result: { serverUrl: "/private.png" } });
        mocks.getVideoTask.mockResolvedValue({ id: "video-task-one", userId: "other-user", status: "success", prompt: "private", result: { url: "/private.mp4" } });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect((await response.json()).data.shot).not.toHaveProperty("storyboardImageUrl");
    });

    it("promotes a completed key frame to the compatible storyboard source", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "key-frame-task", attempt: 1 } },
        };
        const frameProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockResolvedValue(frameProject);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => ({
            ...candidate,
            episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
        }));
        mocks.getImageTask.mockResolvedValue({ id: "key-frame-task", userId: "user-one", status: "success", prompt: "planned-key-frame", result: { serverUrl: "/api/generation-log-assets/key.png", width: 720, height: 1280 } });
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    storyboardStatus: "success",
                    storyboardTaskId: "key-frame-task",
                    storyboardImageUrl: "/api/generation-log-assets/key.png",
                    storyboardImageWidth: 720,
                    storyboardImageHeight: 1280,
                }),
            }),
        );
    });
});
