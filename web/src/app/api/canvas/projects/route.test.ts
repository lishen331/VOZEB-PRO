import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ canvasProjectError: vi.fn(), deleteProjects: vi.fn(), getCurrentUser: vi.fn(), listProjects: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/canvas-project-service", () => ({
    canvasProjectError: mocks.canvasProjectError,
    createCanvasProjectForUser: vi.fn(),
    deleteCanvasProjectsForUser: mocks.deleteProjects,
    listCanvasProjectsForUser: mocks.listProjects,
}));

import { DELETE, GET } from "./route";

describe("canvas projects route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.listProjects.mockResolvedValue({ projects: [{ id: "canvas-one", title: "画布一", nodeCount: 3, connectionCount: 1 }], total: 21, page: 2, pageSize: 12 });
        mocks.deleteProjects.mockResolvedValue(1);
    });

    it("returns lightweight project summaries", async () => {
        const response = await GET(new Request("http://localhost/api/canvas/projects?page=2&pageSize=12"));

        expect(mocks.listProjects).toHaveBeenCalledWith("user-one", { page: "2", pageSize: "12" });
        expect(await response.json()).toEqual({ code: 0, data: { projects: [{ id: "canvas-one", title: "画布一", nodeCount: 3, connectionCount: 1 }], total: 21, page: 2, pageSize: 12 }, msg: "OK" });
    });

    it("returns the scoped service error when a protected project is submitted for deletion", async () => {
        const error = Object.assign(new Error("画布项目不存在"), { status: 404 });
        mocks.deleteProjects.mockRejectedValue(error);
        mocks.canvasProjectError.mockReturnValue(error);

        const response = await DELETE(
            new Request("http://localhost/api/canvas/projects", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: ["canvas-drama"] }),
            }),
        );

        expect(response.status).toBe(404);
        expect(mocks.deleteProjects).toHaveBeenCalledWith("user-one", ["canvas-drama"]);
    });
});
