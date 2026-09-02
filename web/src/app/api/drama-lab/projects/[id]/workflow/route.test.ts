import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    startDramaLabWorkflow: vi.fn(),
    getDramaLabWorkflowTask: vi.fn(),
    findActiveDramaLabWorkflow: vi.fn(),
    advanceDramaLabWorkflow: vi.fn(),
    cancelDramaLabWorkflow: vi.fn(),
    resumeDramaLabWorkflow: vi.fn(),
    dramaLabWorkflowTaskView: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn((callback: () => void) => void callback()) };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: vi.fn(async (request: Request) => request.json()) }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error { constructor(message: string, readonly status = 403) { super(message); } },
}));
vi.mock("@/lib/server/drama-lab-workflow-task-service", () => ({
    DramaLabWorkflowError: class DramaLabWorkflowError extends Error { status = 400; },
    startDramaLabWorkflow: mocks.startDramaLabWorkflow,
    getDramaLabWorkflowTask: mocks.getDramaLabWorkflowTask,
    findActiveDramaLabWorkflow: mocks.findActiveDramaLabWorkflow,
    advanceDramaLabWorkflow: mocks.advanceDramaLabWorkflow,
    cancelDramaLabWorkflow: mocks.cancelDramaLabWorkflow,
    resumeDramaLabWorkflow: mocks.resumeDramaLabWorkflow,
    dramaLabWorkflowTaskView: mocks.dramaLabWorkflowTaskView,
}));

import { GET, PATCH, POST } from "./route";

const project = { id: "project-one", activeEpisodeId: "episode-one", episodes: [{ id: "episode-one" }] };
const task = { id: "workflow-one", userId: "user-one", status: "pending", workflow: { projectId: "project-one" } };
const view = { id: "workflow-one", status: "pending", projectId: "project-one", mode: "video", scope: "current", progress: 0, currentStepIndex: 0, steps: [], children: [], outputRefs: [] };

describe("Drama Lab workflow route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.startDramaLabWorkflow.mockResolvedValue(task);
        mocks.advanceDramaLabWorkflow.mockResolvedValue(task);
        mocks.getDramaLabWorkflowTask.mockResolvedValue(task);
        mocks.findActiveDramaLabWorkflow.mockResolvedValue(null);
        mocks.cancelDramaLabWorkflow.mockResolvedValue({ ...task, status: "cancelled" });
        mocks.resumeDramaLabWorkflow.mockResolvedValue({ ...task, status: "pending" });
        mocks.dramaLabWorkflowTaskView.mockReturnValue(view);
    });

    it("creates a durable parent task and returns 202", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/workflow", { method: "POST", body: JSON.stringify({ episodeId: "episode-one", mode: "video", scope: "current", requestId: "request-one" }) }), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(202);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "workflow-one", status: "pending" } });
        expect(mocks.startDramaLabWorkflow).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-one", sourceEpisodeId: "episode-one", requestId: "request-one", options: expect.objectContaining({ mode: "video" }) }));
        expect(mocks.advanceDramaLabWorkflow).toHaveBeenCalledWith(expect.objectContaining({ taskId: "workflow-one", userId: "user-one" }));
    });

    it("discovers and advances the active task when taskId is omitted", async () => {
        mocks.findActiveDramaLabWorkflow.mockResolvedValue(task);
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow"), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "workflow-one" } });
        expect(mocks.findActiveDramaLabWorkflow).toHaveBeenCalledWith("user-one", "project-one");
    });

    it("rejects a task belonging to another project", async () => {
        mocks.getDramaLabWorkflowTask.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow?taskId=foreign"), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: null });
    });

    it("lets an active collaborator read and advance the owner's workflow", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "member-two" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "user-one" });
        mocks.getDramaLabWorkflowTask.mockResolvedValue({ ...task, userId: "user-one" });
        mocks.advanceDramaLabWorkflow.mockResolvedValue({ ...task, userId: "user-one" });

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow?taskId=workflow-one"), { params: Promise.resolve({ id: "project-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.getDramaLabWorkflowTask).toHaveBeenCalledWith("workflow-one", "member-two", "project-one");
        expect(mocks.advanceDramaLabWorkflow).toHaveBeenCalledWith(expect.objectContaining({ taskId: "workflow-one", userId: "member-two" }));
    });

    it("cancels and resumes a project workflow through the caller's membership", async () => {
        const cancelResponse = await PATCH(new Request("http://localhost/api/drama-lab/projects/project-one/workflow", { method: "PATCH", body: JSON.stringify({ taskId: "workflow-one", action: "cancel" }) }), { params: Promise.resolve({ id: "project-one" }) });
        expect(cancelResponse.status).toBe(200);
        expect(mocks.cancelDramaLabWorkflow).toHaveBeenCalledWith(task, "user-one", "http://localhost", "");

        const resumeResponse = await PATCH(new Request("http://localhost/api/drama-lab/projects/project-one/workflow", { method: "PATCH", body: JSON.stringify({ taskId: "workflow-one", action: "resume" }) }), { params: Promise.resolve({ id: "project-one" }) });
        expect(resumeResponse.status).toBe(200);
        expect(mocks.resumeDramaLabWorkflow).toHaveBeenCalledWith(task, "user-one");
    });

    it("passes the collaborator identity to cancel and resume actions", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "member-two" });
        mocks.getDramaLabWorkflowTask.mockResolvedValue({ ...task, userId: "user-one" });

        const cancelResponse = await PATCH(new Request("http://localhost/api/drama-lab/projects/project-one/workflow", { method: "PATCH", body: JSON.stringify({ taskId: "workflow-one", action: "cancel" }) }), { params: Promise.resolve({ id: "project-one" }) });
        const resumeResponse = await PATCH(new Request("http://localhost/api/drama-lab/projects/project-one/workflow", { method: "PATCH", body: JSON.stringify({ taskId: "workflow-one", action: "resume" }) }), { params: Promise.resolve({ id: "project-one" }) });

        expect(cancelResponse.status).toBe(200);
        expect(resumeResponse.status).toBe(200);
        expect(mocks.cancelDramaLabWorkflow).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one" }), "member-two", "http://localhost", "");
        expect(mocks.resumeDramaLabWorkflow).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one" }), "member-two");
    });
});
