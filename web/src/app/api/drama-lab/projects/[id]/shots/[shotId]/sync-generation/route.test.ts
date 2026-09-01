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
                    generationNeedsReview: undefined,
                    videoUrl: "/api/generation-log-assets/video.mp4",
                }),
            }),
        );
        const patch = mocks.persistDramaLabShotUpdate.mock.calls[0]?.[0].patch;
        expect(patch.storyboardHistory[0]).toMatchObject({ taskId: "image-task-one", prompt: "server-image-prompt", width: 720, height: 1280 });
        expect(patch.videoHistory[0]).toMatchObject({ taskId: "video-task-one", prompt: "server-video-prompt" });
        expect((await response.json()).data.shot).toMatchObject({ storyboardImageUrl: "/api/generation-log-assets/image.png", videoUrl: "/api/generation-log-assets/video.mp4" });
    });

    it("does not rewrite a completed frame history entry on every poll", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "idle",
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "key-frame-task", attempt: 1, history: [] } },
        };
        let currentProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockImplementation(async () => currentProject);
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => {
            const saved = {
                ...candidate,
                episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
            };
            currentProject = saved;
            return saved;
        });
        mocks.getImageTask.mockImplementation(async (id) =>
            id === "key-frame-task" ? { id, userId: "user-one", status: "success", prompt: "planned-key-frame", result: { serverUrl: "/api/generation-log-assets/key.png", width: 720, height: 1280 } } : null,
        );
        mocks.getVideoTask.mockResolvedValue(null);

        const first = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);
        expect(first.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(1);
        const firstHistory = currentProject.episodes[0].shots[0].frames.key.history;
        expect(firstHistory).toHaveLength(1);

        const second = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);
        expect(second.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(1);
        expect(currentProject.episodes[0].shots[0].frames.key.history).toEqual(firstHistory);
    });

    it("does not rewrite storyboard history when promoting a taskless key frame", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: "stale-storyboard-task",
            generationTaskId: undefined,
            storyboardStatus: "running",
            storyboardImageUrl: undefined,
            storyboardImageWidth: undefined,
            storyboardImageHeight: undefined,
            storyboardHistory: [],
            frames: {
                key: {
                    prompt: "uploaded key frame",
                    status: "success",
                    url: "/api/reference-assets/permanent/key.png",
                    storageKey: "permanent/key.png",
                    width: 720,
                    height: 1280,
                    locked: false,
                },
            },
        };
        let currentProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockImplementation(async () => currentProject);
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => {
            const saved = {
                ...candidate,
                episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
            };
            currentProject = saved;
            return saved;
        });
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);

        const first = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);
        expect(first.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(1);
        const firstHistory = currentProject.episodes[0].shots[0].storyboardHistory;
        expect(firstHistory).toHaveLength(1);

        const second = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);
        expect(second.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(1);
        expect(currentProject.episodes[0].shots[0].storyboardHistory).toEqual(firstHistory);
    });

    it("does not keep rewriting a legacy history that already has duplicate identical entries", async () => {
        const duplicateEntry = { id: "key-frame:/api/reference-assets/permanent/key.png", taskId: "key-frame:/api/reference-assets/permanent/key.png", url: "/api/reference-assets/permanent/key.png", prompt: "uploaded key frame", createdAt: "2026-08-22T00:00:00.000Z", width: 720, height: 1280 };
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "success",
            storyboardImageUrl: duplicateEntry.url,
            storyboardImageWidth: duplicateEntry.width,
            storyboardImageHeight: duplicateEntry.height,
            storyboardHistory: [duplicateEntry, { ...duplicateEntry, id: "legacy-duplicate" }],
            frames: { key: { prompt: duplicateEntry.prompt, status: "success", url: duplicateEntry.url, width: duplicateEntry.width, height: duplicateEntry.height } },
        };
        let currentProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockImplementation(async () => currentProject);
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => {
            currentProject = { ...candidate, episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }] };
            return currentProject;
        });
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);

        const first = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);
        const second = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("recomputes the task patch from the latest project after a persistence conflict", async () => {
        const initialShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "idle",
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "key-frame-task", attempt: 1 } },
        };
        const latestShot = {
            ...initialShot,
            frames: {
                ...initialShot.frames,
                first: {
                    prompt: "uploaded first frame",
                    status: "success",
                    url: "/api/reference-assets/permanent/first.png",
                    storageKey: "permanent/first.png",
                    source: "uploaded",
                    locked: true,
                },
            },
        };
        const initialProject = { ...project, episodes: [{ ...project.episodes[0], shots: [initialShot] }] };
        const latestProject = { ...project, updatedAt: "2026-08-22T00:01:00.000Z", episodes: [{ ...project.episodes[0], shots: [latestShot] }] };
        mocks.getDramaProject.mockResolvedValueOnce(initialProject).mockResolvedValueOnce(latestProject);
        let persistCount = 0;
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => {
            persistCount += 1;
            if (persistCount === 1) throw Object.assign(new Error("短剧项目已在其他页面更新，请刷新后重试"), { status: 409 });
            return {
                ...candidate,
                episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
            };
        });
        mocks.getImageTask.mockImplementation(async (id) =>
            id === "key-frame-task" ? { id, userId: "user-one", status: "success", prompt: "planned-key-frame", result: { serverUrl: "/api/generation-log-assets/key.png", width: 720, height: 1280 } } : null,
        );
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(2);
        const retry = mocks.persistDramaLabShotUpdate.mock.calls[1]?.[0];
        expect(retry).toMatchObject({ project: latestProject, retryOnConflict: false });
        expect(retry.patch.frames).toMatchObject({
            first: { url: "/api/reference-assets/permanent/first.png", storageKey: "permanent/first.png", locked: true },
            key: { url: "/api/generation-log-assets/key.png", status: "success" },
        });
    });

    it("ignores task IDs owned by another user instead of exposing their media", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "image-task-one", userId: "other-user", status: "success", prompt: "private", result: { serverUrl: "/private.png" } });
        mocks.getVideoTask.mockResolvedValue({ id: "video-task-one", userId: "other-user", status: "success", prompt: "private", result: { url: "/private.mp4" } });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect((await response.json()).data.shot).not.toHaveProperty("storyboardImageUrl");
    });

    it("clears owned image and video bindings when their shot coordinates do not match", async () => {
        mocks.getImageTask.mockResolvedValue({
            id: "image-task-one",
            userId: "user-one",
            status: "success",
            surface: "drama",
            projectId: "project-other",
            episodeId: "episode-other",
            shotId: "shot-other",
            prompt: "wrong-shot-image",
            result: { serverUrl: "/wrong-shot.png" },
        });
        mocks.getVideoTask.mockResolvedValue({
            id: "video-task-one",
            userId: "user-one",
            status: "success",
            surface: "drama",
            projectId: "project-other",
            episodeId: "episode-other",
            shotId: "shot-other",
            prompt: "wrong-shot-video",
            result: { url: "/wrong-shot.mp4" },
        });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    storyboardStatus: "error",
                    storyboardTaskId: undefined,
                    generationStatus: "error",
                    generationTaskId: undefined,
                    storyboardError: expect.stringContaining("上下文"),
                    generationError: expect.stringContaining("上下文"),
                }),
            }),
        );
        expect((await response.json()).data.shot).not.toMatchObject({ storyboardImageUrl: "/wrong-shot.png", videoUrl: "/wrong-shot.mp4" });
    });

    it("detaches an owned task whose project context does not match the current shot", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "idle",
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "key-frame-task", attempt: 1 } },
        };
        const frameProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockResolvedValue(frameProject);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.getImageTask.mockResolvedValue({
            id: "key-frame-task",
            userId: "user-one",
            status: "success",
            surface: "drama",
            projectId: "another-project",
            episodeId: "episode-one",
            shotId: "shot-one",
            frameType: "key",
            prompt: "foreign-context",
            result: { serverUrl: "/private-context.png" },
        });
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: {
                    frames: {
                        key: expect.objectContaining({ status: "error", taskId: undefined, error: expect.stringContaining("上下文") }),
                    },
                },
            }),
        );
        expect((await response.json()).data.shot.frames.key).not.toHaveProperty("url", "/private-context.png");
    });

    it("rejects a frame task bound to a different frame slot without applying its media", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "idle",
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "first-frame-task", attempt: 1 } },
        };
        const frameProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockResolvedValue(frameProject);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.getImageTask.mockResolvedValue({
            id: "first-frame-task",
            userId: "user-one",
            status: "success",
            surface: "drama",
            projectId: "project-one",
            episodeId: "episode-one",
            shotId: "shot-one",
            frameType: "first",
            prompt: "first-slot",
            result: { serverUrl: "/wrong-slot.png" },
        });
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: {
                    frames: {
                        key: expect.objectContaining({ status: "error", taskId: undefined, error: expect.stringContaining("上下文") }),
                    },
                },
            }),
        );
        expect((await response.json()).data.shot.frames.key).not.toHaveProperty("url", "/wrong-slot.png");
    });

    it("preserves a foreign frame task binding instead of treating it as an orphan", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "idle",
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "foreign-frame-task", attempt: 1 } },
        };
        const frameProject = { ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] };
        mocks.getDramaProject.mockResolvedValue(frameProject);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.getImageTask.mockResolvedValue({ id: "foreign-frame-task", userId: "other-user", status: "running", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", frameType: "key" });
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect((await response.json()).data.shot.frames.key).toMatchObject({ taskId: "foreign-frame-task", status: "running" });
    });

    it("promotes a completed key frame to the compatible storyboard source", async () => {
        const frameShot = {
            ...shot,
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
                    frames: { key: expect.objectContaining({ source: "generated" }) },
                }),
            }),
        );
    });

    it("does not overwrite a locked frame when its task later reports success", async () => {
        const lockedFrame = {
            ...shot,
            generationTaskId: undefined,
            storyboardStatus: "success",
            storyboardImageUrl: "/api/generation-log-assets/locked-key.png",
            storyboardImageWidth: 720,
            storyboardImageHeight: 1280,
            storyboardTaskId: "key-frame-task",
            storyboardHistory: [{ id: "key-frame:key-frame-task", taskId: "key-frame-task", url: "/api/generation-log-assets/locked-key.png", prompt: "locked prompt", createdAt: "2026-09-01T00:00:00.000Z", width: 720, height: 1280 }],
            generationStatus: "idle",
            frames: {
                key: {
                    prompt: "locked prompt",
                    status: "success",
                    taskId: "key-frame-task",
                    url: "/api/generation-log-assets/locked-key.png",
                    source: "uploaded",
                    width: 720,
                    height: 1280,
                    storageKey: "permanent/locked-key.png",
                    locked: true,
                },
            },
        };
        const lockedProject = { ...project, episodes: [{ ...project.episodes[0], shots: [lockedFrame] }] };
        mocks.getDramaProject.mockResolvedValue(lockedProject);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.getImageTask.mockResolvedValue({ id: "key-frame-task", userId: "user-one", status: "success", prompt: "new prompt", result: { serverUrl: "/api/generation-log-assets/new-key.png", width: 720, height: 1280 } });
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect((await response.json()).data.shot.frames.key).toMatchObject({ url: "/api/generation-log-assets/locked-key.png", source: "uploaded", storageKey: "permanent/locked-key.png", locked: true });
    });

    it("keeps legacy storyboard fields aligned with a locked key frame", async () => {
        const lockedKeyShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            storyboardStatus: "success",
            storyboardImageUrl: "/api/generation-log-assets/old-key.png",
            storyboardImageWidth: 640,
            storyboardImageHeight: 1136,
            storyboardHistory: [],
            frames: {
                key: {
                    prompt: "locked selected key frame",
                    status: "success",
                    url: "/api/generation-log-assets/locked-key.png",
                    storageKey: "permanent/locked-key.png",
                    width: 720,
                    height: 1280,
                    source: "uploaded",
                    locked: true,
                },
            },
        };
        const lockedKeyProject = { ...project, episodes: [{ ...project.episodes[0], shots: [lockedKeyShot] }] };
        mocks.getDramaProject.mockResolvedValue(lockedKeyProject);
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => ({
            ...candidate,
            episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
        }));

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    storyboardStatus: "success",
                    storyboardImageUrl: "/api/generation-log-assets/locked-key.png",
                    storyboardImageWidth: 720,
                    storyboardImageHeight: 1280,
                }),
            }),
        );
    });

    it("clears orphaned running image and video tasks after a restart", async () => {
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    storyboardStatus: "error",
                    storyboardTaskId: undefined,
                    generationStatus: "error",
                    generationTaskId: undefined,
                    generationNeedsReview: undefined,
                    storyboardError: expect.stringContaining("任务记录不存在"),
                    generationError: expect.stringContaining("任务记录不存在"),
                }),
            }),
        );
        expect((await response.json()).data.shot).toMatchObject({ storyboardStatus: "error", generationStatus: "error" });
    });

    it("does not clear a task ID owned by another user", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "image-task-one", userId: "other-user", status: "running" });
        mocks.getVideoTask.mockResolvedValue({ id: "video-task-one", userId: "other-user", status: "running" });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("marks orphaned frame tasks as retryable errors", async () => {
        const frameShot = {
            ...shot,
            storyboardTaskId: undefined,
            generationTaskId: undefined,
            frames: { key: { prompt: "key-frame-prompt", status: "running", taskId: "key-frame-task", attempt: 1 } },
        };
        mocks.getDramaProject.mockResolvedValue({ ...project, episodes: [{ ...project.episodes[0], shots: [frameShot] }] });
        mocks.findShot.mockImplementation((candidate) => ({ episode: candidate.episodes[0], shot: candidate.episodes[0].shots[0] }));
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    frames: { key: expect.objectContaining({ status: "error", taskId: undefined }) },
                }),
            }),
        );
    });

    it("marks a video task needing review as recoverable without clearing its task ID", async () => {
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue({
            id: "video-task-one",
            userId: "user-one",
            status: "running",
            executionPhase: "needs_review",
            reviewReason: "OpenAI 视频协议最多支持 1 张参考图",
        });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    generationStatus: "error",
                    generationNeedsReview: true,
                    generationError: "OpenAI 视频协议最多支持 1 张参考图",
                }),
            }),
        );
        expect(mocks.persistDramaLabShotUpdate.mock.calls[0]?.[0].patch).not.toHaveProperty("generationTaskId");
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
        expect((await response.json()).data.shot).toMatchObject({ generationTaskId: "video-task-one", generationStatus: "error", generationNeedsReview: true });
    });

    it("resumes automatic synchronization after a user rechecks the retained video task", async () => {
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue({ id: "video-task-one", userId: "user-one", status: "running", executionPhase: "polling" });
        mocks.getDramaProject.mockResolvedValue({ ...project, episodes: [{ ...project.episodes[0], shots: [{ ...shot, generationStatus: "error", generationNeedsReview: true, generationError: "待检查" }] }] });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ generationStatus: "running", generationNeedsReview: undefined, generationError: undefined }) }));
        expect((await response.json()).data.shot).toMatchObject({ generationTaskId: "video-task-one", generationStatus: "running" });
    });

    it("unblocks a reviewable shot when its retained task has expired", async () => {
        const reviewShot = { ...shot, generationStatus: "error", generationNeedsReview: true, generationError: "待检查" };
        mocks.getDramaProject.mockResolvedValue({ ...project, episodes: [{ ...project.episodes[0], shots: [reviewShot] }] });
        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    generationStatus: "error",
                    generationTaskId: undefined,
                    generationNeedsReview: undefined,
                    generationError: expect.stringContaining("任务记录不存在"),
                }),
            }),
        );
    });
});
