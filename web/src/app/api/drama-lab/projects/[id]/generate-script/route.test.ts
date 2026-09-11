import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    startDramaLabStoryGeneration: vi.fn(),
    storyTaskView: vi.fn(),
    findActiveDramaLabStoryTask: vi.fn(),
    getDramaLabStoryTaskView: vi.fn(),
    getTextTask: vi.fn(),
    runGenerationTaskRecoveryBatch: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn((callback: () => void) => void callback()) };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: vi.fn(async (request: Request) => request.json()) }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-story-generation-service", () => ({
    DramaLabStoryGenerationError: class DramaLabStoryGenerationError extends Error {
        status = 400;
    },
    startDramaLabStoryGeneration: mocks.startDramaLabStoryGeneration,
    storyTaskView: mocks.storyTaskView,
    findActiveDramaLabStoryTask: mocks.findActiveDramaLabStoryTask,
    getDramaLabStoryTaskView: mocks.getDramaLabStoryTaskView,
}));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: vi.fn((value: string) => value) }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.runGenerationTaskRecoveryBatch }));
vi.mock("@/lib/server/text-task-store", () => ({ getTextTask: mocks.getTextTask }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
}));

import { GET, POST } from "./route";

describe("Drama Lab story generation route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async () => ({ project: await mocks.getDramaProject("project-one", "user-one"), ownerUserId: "user-one" }));
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue({ id: "project-one", summary: "outline", style: "现代", activeEpisodeId: "episode-one", episodes: [{ id: "episode-one" }] });
        mocks.startDramaLabStoryGeneration.mockResolvedValue({ id: "task-one" });
        mocks.storyTaskView.mockReturnValue({ id: "task-one", status: "pending", phase: "pending", progress: 0, episodeCount: 3, persistedEpisodeCount: 0 });
    });

    it("creates a durable task and returns taskId instead of waiting for model output", async () => {
        const response = await POST(
            new Request("http://localhost/api/drama-lab/projects/project-one/generate-script", {
                method: "POST",
                body: JSON.stringify({ episodeId: "episode-one", storyOutline: "outline", episodeCount: "3", requestId: "request-one" }),
            }),
            { params: Promise.resolve({ id: "project-one" }) },
        );
        expect(response.status).toBe(202);
        expect(await response.json()).toMatchObject({ code: 0, data: { taskId: "task-one", episodeCount: 3 } });
        expect(mocks.startDramaLabStoryGeneration).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-one", sourceEpisodeId: "episode-one", storyStyle: "modern", scriptType: "drama", episodeCount: "3" }));
    });

    it("only exposes a task belonging to the current project owner", async () => {
        mocks.getTextTask.mockResolvedValue({ id: "task-one", userId: "user-one", storyBatch: { projectId: "project-one" } });
        mocks.getDramaLabStoryTaskView.mockResolvedValue({ id: "task-one", status: "running", phase: "persisting", progress: 50, episodeCount: 2, persistedEpisodeCount: 1 });
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/generate-script?taskId=task-one"), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "task-one", persistedEpisodeCount: 1 } });
    });

    it("passes a collaborator identity through when reading the owner's task", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "member-two" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project: { ...(await mocks.getDramaProject("project-one", "user-one")), id: "project-one" }, ownerUserId: "user-one" });
        mocks.getTextTask.mockResolvedValue({ id: "task-one", userId: "user-one", storyBatch: { projectId: "project-one" } });
        mocks.getDramaLabStoryTaskView.mockResolvedValue({ id: "task-one", status: "running", phase: "persisting", progress: 50, episodeCount: 2, persistedEpisodeCount: 1 });

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/generate-script?taskId=task-one"), { params: Promise.resolve({ id: "project-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.getDramaLabStoryTaskView).toHaveBeenCalledWith("task-one", "member-two", "project-one");
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "task-one" } });
    });

    it("discovers the active project task when taskId is omitted", async () => {
        mocks.findActiveDramaLabStoryTask.mockResolvedValue({ id: "task-active", userId: "user-one", storyBatch: { projectId: "project-one" } });
        mocks.storyTaskView.mockReturnValue({ id: "task-active", status: "running", phase: "pending", progress: 0, episodeCount: 2, persistedEpisodeCount: 0 });

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/generate-script"), { params: Promise.resolve({ id: "project-one" }) });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "task-active", taskId: "task-active", status: "running" } });
        expect(mocks.findActiveDramaLabStoryTask).toHaveBeenCalledWith("user-one", "project-one");
    });

    it("returns an empty successful response when no task is active", async () => {
        mocks.findActiveDramaLabStoryTask.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/generate-script"), { params: Promise.resolve({ id: "project-one" }) });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: null });
    });

    it("rejects a task from another project", async () => {
        mocks.getTextTask.mockResolvedValue({ id: "task-one", userId: "user-one", storyBatch: { projectId: "other-project" } });
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/generate-script?taskId=task-one"), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(404);
        expect(mocks.getDramaLabStoryTaskView).not.toHaveBeenCalled();
    });
});
