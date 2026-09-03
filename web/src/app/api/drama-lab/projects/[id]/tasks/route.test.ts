import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listTasks: vi.fn() }));
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
    listDramaLabTasksForProject: mocks.listTasks,
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

import { GET } from "./route";

describe("Drama Lab task list route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "member-one" });
        mocks.listTasks.mockResolvedValue({ tasks: [{ id: "task-one", taskType: "video", status: "running" }], activeCount: 1, total: 1 });
    });

    it("returns the project-scoped task read model", async () => {
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/tasks?status=active"), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { activeCount: 1, tasks: [{ id: "task-one" }] } });
        expect(mocks.listTasks).toHaveBeenCalledWith({ userId: "member-one", projectId: "project-one", status: "active" });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/tasks"), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(401);
        expect(mocks.listTasks).not.toHaveBeenCalled();
    });
});
