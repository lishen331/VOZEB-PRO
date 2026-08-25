import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    fetchInternalApi: vi.fn(),
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    getVideoTask: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    prepareDramaLabStoryboardVideo: vi.fn(),
    resolveInternalOrigin: vi.fn(),
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
        DramaLabShotGenerationError,
        persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate,
        prepareDramaLabStoryboardVideo: mocks.prepareDramaLabStoryboardVideo,
    };
});
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));

import { POST } from "./route";

const project = { id: "project-one", title: "Project One", ratio: "16:9", creativeConversationId: "conversation-one", updatedAt: "2026-08-22T00:00:00.000Z" };
const context = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/generate-video", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.getVideoTask.mockResolvedValue(null);
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { videoModel: "video-logical" } });
        mocks.resolveInternalOrigin.mockReturnValue("http://internal.example.com");
        mocks.prepareDramaLabStoryboardVideo.mockReturnValue({
            prompt: "server-composed-video-prompt",
            visiblePrompt: "visible-motion-direction",
            shot: { title: "Shot One", duration: 4, generationAttempt: 2, storyboardTaskId: "image-task-one" },
            references: [
                { id: "storyboard-shot-one", label: "Shot One storyboard", url: "/api/generation-log-assets/storyboard.png" },
                { id: "scene-ref", label: "Scene primary", url: "https://cdn.example.com/scene.png" },
            ],
        });
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ task: { id: "video-task-one", status: "running", model: "video-logical" } }));
        mocks.persistDramaLabShotUpdate.mockResolvedValue(project);
    });

    it("submits only the storyboard frame reference and records the server-visible motion prompt", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST", headers: { cookie: "session=test" } }), context);

        expect(response.status).toBe(200);
        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://internal.example.com/api/video-generation-tasks");
        expect(JSON.parse(String(init.body))).toMatchObject({
            config: { model: "video-logical", size: "16:9", videoSeconds: 4 },
            prompt: "server-composed-video-prompt",
            references: [{ type: "image", role: "reference", url: "/api/generation-log-assets/storyboard.png" }],
            context: { parentTaskId: "image-task-one", attemptNo: 3 },
        });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: { videoPrompt: "visible-motion-direction", generationStatus: "running", generationTaskId: "video-task-one", generationAttempt: 3, generationNeedsReview: undefined, generationError: undefined },
            }),
        );
    });

    it("keeps an immediately completed upstream task running until sync-generation persists its video URL", async () => {
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ task: { id: "video-task-one", status: "success", model: "video-logical" } }));

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST", headers: { cookie: "session=test" } }), context);

        expect(response.status).toBe(200);
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: expect.objectContaining({
                    generationStatus: "running",
                    generationTaskId: "video-task-one",
                }),
            }),
        );
    });

    it("does not submit a task when no default video model is configured", async () => {
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { videoModel: "" } });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(503);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it.each([
        ["is waiting for manual review", { generationTaskId: "video-original", generationNeedsReview: true, generationStatus: "error" }, "待检查"],
        ["is already running", { generationTaskId: "video-running", generationStatus: "running" }, "正在执行"],
    ])("does not submit another task when the retained video task %s", async (_state, shot, message) => {
        mocks.prepareDramaLabStoryboardVideo.mockReturnValue({
            prompt: "server-composed-video-prompt",
            visiblePrompt: "visible-motion-direction",
            shot: { title: "Shot One", duration: 4, generationAttempt: 2, storyboardTaskId: "image-task-one", ...shot },
            references: [{ id: "storyboard-shot-one", label: "Shot One storyboard", url: "/api/generation-log-assets/storyboard.png" }],
        });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(409);
        expect((await response.json()).msg).toContain(message);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it.each(["running", "pending"])("does not submit when the retained task store says it is still %s", async (status) => {
        mocks.prepareDramaLabStoryboardVideo.mockReturnValue({
            prompt: "server-composed-video-prompt",
            visiblePrompt: "visible-motion-direction",
            shot: { title: "Shot One", duration: 4, generationAttempt: 2, storyboardTaskId: "image-task-one", generationTaskId: "video-original", generationStatus: "error" },
            references: [{ id: "storyboard-shot-one", label: "Shot One storyboard", url: "/api/generation-log-assets/storyboard.png" }],
        });
        mocks.getVideoTask.mockResolvedValue({ id: "video-original", userId: "user-one", status, executionPhase: "polling" });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(409);
        expect((await response.json()).msg).toContain("正在执行");
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("does not expose or trust a retained task owned by another user", async () => {
        mocks.prepareDramaLabStoryboardVideo.mockReturnValue({
            prompt: "server-composed-video-prompt",
            visiblePrompt: "visible-motion-direction",
            shot: { title: "Shot One", duration: 4, generationAttempt: 2, storyboardTaskId: "image-task-one", generationTaskId: "video-other", generationStatus: "error" },
            references: [{ id: "storyboard-shot-one", label: "Shot One storyboard", url: "/api/generation-log-assets/storyboard.png" }],
        });
        mocks.getVideoTask.mockResolvedValue({ id: "video-other", userId: "other-user", status: "running", executionPhase: "polling" });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.fetchInternalApi).toHaveBeenCalledTimes(1);
    });
});
