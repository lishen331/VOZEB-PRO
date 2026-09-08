import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readJsonBody: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    startDramaLabWorkflow: vi.fn(),
    advanceDramaLabWorkflow: vi.fn(),
    dramaLabWorkflowTaskView: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn((callback: () => void) => void callback()) };
});
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        status = 403;
    },
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
}));
vi.mock("@/lib/server/drama-lab-workflow-task-service", () => ({
    DramaLabWorkflowError: class DramaLabWorkflowError extends Error {
        status = 502;
    },
    startDramaLabWorkflow: mocks.startDramaLabWorkflow,
    advanceDramaLabWorkflow: mocks.advanceDramaLabWorkflow,
    dramaLabWorkflowTaskView: mocks.dramaLabWorkflowTaskView,
}));

import { POST } from "./route";

describe("POST /api/drama-lab/projects/:id/extract-storyboards", () => {
    it("creates a durable extraction-only workflow task for the selected episode", async () => {
        const project = {
            id: "project-one",
            title: "短剧",
            summary: "",
            style: "现代写实",
            ratio: "9:16",
            status: "active" as const,
            characters: [],
            scenes: [],
            props: [],
            clues: [],
            defaultVideoMode: "storyboard" as const,
            episodes: [
                { id: "episode-one", title: "第一集", script: "剧本", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [{ id: "old-shot" }] },
                { id: "episode-two", title: "第二集", script: "剧本", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [{ id: "other-shot" }] },
            ],
            createdAt: "2026-08-22T00:00:00.000Z",
            updatedAt: "2026-08-22T00:00:00.000Z",
        };
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBody.mockResolvedValue({ episodeId: "episode-one", requestId: "request-one", storyboardOptions: { shotCount: 12, totalDuration: 90.5, creationMode: "universal", generateNarration: true } });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "user-one" });
        mocks.startDramaLabWorkflow.mockResolvedValue({ id: "workflow-one" });
        mocks.advanceDramaLabWorkflow.mockResolvedValue(undefined);
        mocks.dramaLabWorkflowTaskView.mockReturnValue({ id: "workflow-one", status: "pending", mode: "storyboard_extract", scope: "current", projectId: "project-one" });

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/extract-storyboards", { method: "POST" }), { params: Promise.resolve({ id: "project-one" }) });

        expect(response.status).toBe(202);
        expect(mocks.startDramaLabWorkflow).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: "project-one",
                sourceEpisodeId: "episode-one",
                requestId: "request-one",
                options: { mode: "storyboard_extract", scope: "current", storyboardOptions: { shotCount: 12, totalDuration: 90.5, creationMode: "universal", generateNarration: true } },
            }),
        );
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { taskId: "workflow-one", task: { mode: "storyboard_extract" } } });
    });
});

describe("extraction parameter validation", () => {
    it("returns 400 before task creation on fractional shot count", async () => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBody.mockResolvedValue({ episodeId: "episode-one", storyboardOptions: { shotCount: 1.5 } });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project: { id: "project-one" } });
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/extract-storyboards", { method: "POST" }), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(400);
        expect(mocks.startDramaLabWorkflow).not.toHaveBeenCalled();
    });
});
