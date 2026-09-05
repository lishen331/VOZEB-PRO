import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), cancelTask: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-task-service", () => ({
    DramaLabTaskError: class DramaLabTaskError extends Error {
        constructor(
            message: string,
            readonly status = 400,
        ) {
            super(message);
        }
    },
    cancelDramaLabTask: mocks.cancelTask,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(
            message: string,
            readonly status = 403,
        ) {
            super(message);
        }
    },
}));

import { POST } from "./route";

describe("Drama Lab task cancellation route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "member-one" });
        mocks.cancelTask.mockResolvedValue({ id: "task-one", status: "cancelled", canCancel: false });
    });

    it("passes project and task IDs to the server cancellation service", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/tasks/task-one/cancel", { method: "POST" }), { params: Promise.resolve({ id: "project-one", taskId: "task-one" }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "task-one", status: "cancelled" } });
        expect(mocks.cancelTask).toHaveBeenCalledWith({ userId: "member-one", projectId: "project-one", taskId: "task-one", origin: "http://localhost", cookie: "" });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/tasks/task-one/cancel", { method: "POST" }), { params: Promise.resolve({ id: "project-one", taskId: "task-one" }) });
        expect(response.status).toBe(401);
        expect(mocks.cancelTask).not.toHaveBeenCalled();
    });
});
