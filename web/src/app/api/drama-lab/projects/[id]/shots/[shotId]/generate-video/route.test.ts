import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    fetchInternalApi: vi.fn(),
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    getVideoTask: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    prepareDramaLabStoryboardVideo: vi.fn(),
    resolveLogicalModelCandidates: vi.fn(),
    resolveInternalOrigin: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
    requestRuntimeCredential: vi.fn((request: Request) => request.headers.get("x-runtime-credential") || request.headers.get("cookie") || ""),
    maintenanceWorkerContextHeaders: vi.fn((credential: string) => (credential.startsWith("worker-context") ? { authorization: "Bearer worker-token", "x-vozeb-pro-worker-user-id": "user-one" } : null)),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: mocks.resolveInternalOrigin }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: mocks.resolveLogicalModelCandidates }));
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
vi.mock("@/lib/server/drama-lab-collaboration-service", () => {
    class DramaLabCollaborationError extends Error {
        constructor(
            message: string,
            readonly status = 400,
        ) {
            super(message);
        }
    }
    return {
        DramaLabCollaborationError,
        resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
        assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
    };
});
vi.mock("@/lib/server/maintenance-auth", () => ({
    requestRuntimeCredential: mocks.requestRuntimeCredential,
    maintenanceWorkerContextHeaders: mocks.maintenanceWorkerContextHeaders,
}));

import { POST } from "./route";

const project = { id: "project-one", title: "Project One", ratio: "16:9", creativeConversationId: "conversation-one", updatedAt: "2026-08-22T00:00:00.000Z" };
const context = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/generate-video", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async () => ({ project: await mocks.getDramaProject("project-one", "user-one"), ownerUserId: "user-one" }));
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.getVideoTask.mockResolvedValue(null);
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { videoModel: "video-logical" } });
        mocks.resolveInternalOrigin.mockReturnValue("http://internal.example.com");
        mocks.resolveLogicalModelCandidates.mockReturnValue([]);
        mocks.prepareDramaLabStoryboardVideo.mockReturnValue({
            prompt: "server-composed-video-prompt",
            visiblePrompt: "visible-motion-direction",
            shot: { title: "Shot One", duration: 4, generationAttempt: 2, storyboardTaskId: "image-task-one" },
            references: [
                { id: "first-frame-shot-one", label: "Shot One first frame", url: "/api/generation-log-assets/first.png", role: "first_frame", frameType: "first", taskId: "first-task", source: "generated" },
                { id: "last-frame-shot-one", label: "Shot One last frame", url: "/api/generation-log-assets/last.png", role: "last_frame", frameType: "last", taskId: "last-task", source: "generated" },
                { id: "storyboard-shot-one", label: "Shot One storyboard", url: "/api/generation-log-assets/storyboard.png", role: "reference", frameType: "key", taskId: "image-task-one", source: "generated" },
            ],
            frameSnapshot: {
                capturedAt: "2026-09-01T00:00:00.000Z",
                model: "video-logical",
                supportsLastFrame: true,
                references: [
                    { role: "first_frame", frameType: "first", url: "/api/generation-log-assets/first.png", taskId: "first-task", source: "generated" },
                    { role: "last_frame", frameType: "last", url: "/api/generation-log-assets/last.png", taskId: "last-task", source: "generated" },
                    { role: "reference", frameType: "key", url: "/api/generation-log-assets/storyboard.png", taskId: "image-task-one", source: "generated" },
                ],
            },
        });
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ task: { id: "video-task-one", status: "running", model: "video-logical" } }));
        mocks.persistDramaLabShotUpdate.mockResolvedValue(project);
    });

    it("submits role-aware frame references and records the server-visible motion prompt and snapshot", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST", headers: { cookie: "session=test" } }), context);

        expect(response.status).toBe(200);
        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://internal.example.com/api/video-generation-tasks");
        expect(JSON.parse(String(init.body))).toMatchObject({
            config: { model: "video-logical", size: "16:9", videoSeconds: 4 },
            prompt: "server-composed-video-prompt",
            references: [
                { type: "image", role: "first_frame", url: "/api/generation-log-assets/first.png" },
                { type: "image", role: "last_frame", url: "/api/generation-log-assets/last.png" },
                { type: "image", role: "reference", url: "/api/generation-log-assets/storyboard.png" },
            ],
            context: {
                parentTaskId: "image-task-one",
                attemptNo: 3,
                frameSnapshot: expect.objectContaining({
                    model: "video-logical",
                    supportsLastFrame: true,
                    references: expect.arrayContaining([expect.objectContaining({ role: "first_frame", taskId: "first-task" }), expect.objectContaining({ role: "last_frame", taskId: "last-task" })]),
                }),
            },
        });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patch: {
                    videoPrompt: "visible-motion-direction",
                    generationStatus: "running",
                    generationTaskId: "video-task-one",
                    generationAttempt: 3,
                    generationNeedsReview: undefined,
                    generationError: undefined,
                    videoFrameSnapshot: expect.objectContaining({ model: "video-logical", supportsLastFrame: true }),
                },
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

    it("passes the intersection of provider frame capabilities to preparation", async () => {
        mocks.getAuthSettings.mockResolvedValue({
            defaultModels: { videoModel: "video-logical" },
            logicalModels: [{ id: "video-logical" }],
            systemChannels: [{ id: "channel-one" }],
        });
        mocks.resolveLogicalModelCandidates.mockReturnValue([
            {
                upstreamModel: "provider-video-one",
                channel: { apiFormat: "openai", advancedConfig: { protocol: "custom", requestTemplate: '{"first":"{{first_frame}}","last":"{{last_frame}}"}' } },
                capabilityProfile: { maxReferenceImages: 3 },
            },
            {
                upstreamModel: "provider-video-two",
                channel: { apiFormat: "openai", advancedConfig: { protocol: "openai" } },
                capabilityProfile: { maxReferenceImages: 2 },
            },
        ]);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.prepareDramaLabStoryboardVideo).toHaveBeenCalledWith(project, "episode-one", "shot-one", {
            model: "video-logical",
            supportsFirstFrame: true,
            supportsLastFrame: false,
            supportsReferenceImages: false,
            maxReferenceImages: 2,
        });
    });

    it("forwards universal slots and persists only the universal prompt field", async () => {
        const urls = ["/scene.png", "/character.png", "/prop.png"];
        const prepared = {
            prompt: "universal multi-beat with numbered refs",
            visiblePrompt: "universal multi-beat",
            shot: { creationMode: "universal", duration: 3, videoPrompt: "keep classic prompt" },
            references: urls.map((url) => ({ url, role: "reference" })),
            frameSnapshot: { references: urls.map((url) => ({ url, role: "reference" })) },
        };
        mocks.prepareDramaLabStoryboardVideo.mockReturnValue(prepared);
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST" }), context);
        expect(response.status).toBe(200);
        const body = JSON.parse(mocks.fetchInternalApi.mock.calls[0][1].body);
        expect(body.prompt).toBe(prepared.prompt);
        expect(body.config.videoSeconds).toBe(3);
        expect(body.references).toEqual(urls.map((url) => ({ type: "image", role: "reference", url })));
        expect(body.context.frameSnapshot).toEqual(prepared.frameSnapshot);
        const patch = mocks.persistDramaLabShotUpdate.mock.calls[0][0].patch;
        expect(patch.universalSegmentText).toBe(prepared.visiblePrompt);
        expect(patch).not.toHaveProperty("videoPrompt");
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

    it("forwards the signed worker identity when recovery invokes the route without a browser cookie", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-video?episodeId=episode-one", { method: "POST", headers: { "x-runtime-credential": "worker-context:user-one" } }), context);

        expect(response.status).toBe(200);
        const [, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(init.headers).toMatchObject({ authorization: "Bearer worker-token", "x-vozeb-pro-worker-user-id": "user-one" });
        expect((init.headers as Record<string, string>).cookie).toBeUndefined();
    });
});
