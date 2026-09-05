import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    fetchInternalApi: vi.fn(),
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    prepareDramaLabStoryboardImage: vi.fn(),
    resolveInternalOrigin: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
    requestRuntimeCredential: vi.fn((request: Request) => request.headers.get("x-runtime-credential") || request.headers.get("cookie") || ""),
    maintenanceWorkerContextHeaders: vi.fn((credential: string) => (credential.startsWith("worker-context") ? { authorization: "Bearer worker-token", "x-vozeb-pro-worker-user-id": "user-one" } : null)),
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
        prepareDramaLabStoryboardImage: mocks.prepareDramaLabStoryboardImage,
    };
});
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
}));
vi.mock("@/lib/server/maintenance-auth", () => ({
    requestRuntimeCredential: mocks.requestRuntimeCredential,
    maintenanceWorkerContextHeaders: mocks.maintenanceWorkerContextHeaders,
}));

import { POST } from "./route";

const project = { id: "project-one", title: "Project One", ratio: "9:16", creativeConversationId: "conversation-one", updatedAt: "2026-08-22T00:00:00.000Z" };
const context = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/generate-image", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async () => ({ project: await mocks.getDramaProject("project-one", "user-one"), ownerUserId: "user-one" }));
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { imageModel: "image-logical" } });
        mocks.resolveInternalOrigin.mockReturnValue("http://internal.example.com");
        mocks.prepareDramaLabStoryboardImage.mockResolvedValue({
            prompt: "server-composed-image-prompt",
            templateKey: "key_frame_prompt",
            shot: { title: "Shot One", storyboardAttempt: 1 },
            references: [
                { id: "scene-ref", label: "Scene primary", url: "/api/reference-assets/scene.png", width: 720, height: 1280 },
                { id: "character-ref", label: "Character primary", url: "https://cdn.example.com/character.png" },
            ],
        });
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ task: { id: "image-task-one", status: "running", model: "image-logical" } }));
        mocks.persistDramaLabShotUpdate.mockResolvedValue(project);
    });

    it("uses the server-prepared prompt and asset references, then records the task on the shot", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-image?episodeId=episode-one", { method: "POST", headers: { cookie: "session=test" } }), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { task: { id: "image-task-one" }, templateKey: "key_frame_prompt" } });
        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://internal.example.com/api/image-tasks");
        expect(JSON.parse(String(init.body))).toMatchObject({
            kind: "edit",
            config: { model: "image-logical", size: "9:16" },
            prompt: "server-composed-image-prompt",
            references: [
                { id: "scene-ref", name: "Scene primary", dataUrl: "/api/reference-assets/scene.png", serverUrl: "/api/reference-assets/scene.png" },
                { id: "character-ref", name: "Character primary", dataUrl: "https://cdn.example.com/character.png" },
            ],
            context: { projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", attemptNo: 2 },
        });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-one",
                project,
                episodeId: "episode-one",
                shotId: "shot-one",
                patch: { storyboardStatus: "running", storyboardTaskId: "image-task-one", storyboardAttempt: 2, storyboardError: undefined },
            }),
        );
    });

    it("requires an authenticated project owner before making an internal task request", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-image?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(401);
        expect(mocks.getDramaProject).not.toHaveBeenCalled();
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("forwards the signed worker identity when recovery invokes the route without a browser cookie", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-image?episodeId=episode-one", { method: "POST", headers: { "x-runtime-credential": "worker-context:user-one" } }), context);

        expect(response.status).toBe(200);
        const [, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit];
        expect(init.headers).toMatchObject({ authorization: "Bearer worker-token", "x-vozeb-pro-worker-user-id": "user-one" });
        expect((init.headers as Record<string, string>).cookie).toBeUndefined();
    });

    it("rejects a shot generation request when the project is not owned by the current user", async () => {
        mocks.getDramaProject.mockResolvedValue(null);

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-image?episodeId=episode-one", { method: "POST" }), context);

        expect(response.status).toBe(404);
        expect(mocks.prepareDramaLabStoryboardImage).not.toHaveBeenCalled();
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});
