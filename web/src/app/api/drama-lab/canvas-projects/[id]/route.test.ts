import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getProject: vi.fn(), updateProject: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/canvas-project-service", () => ({
    canvasProjectError: vi.fn(),
    getDramaLabCanvasProjectForUser: mocks.getProject,
    updateDramaLabCanvasProjectForUser: mocks.updateProject,
}));

import { GET, PATCH } from "./route";

describe("drama lab canvas project detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getProject.mockResolvedValue({ id: "canvas-one", sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" });
    });

    it("uses the drama-lab scoped service for reads and saves", async () => {
        const context = { params: Promise.resolve({ id: "canvas-one" }) };
        const readResponse = await GET(new Request("http://localhost/api/drama-lab/canvas-projects/canvas-one"), context);
        expect(readResponse.status).toBe(200);
        expect(mocks.getProject).toHaveBeenCalledWith("user-one", "canvas-one");

        const mutation = { mutationId: "mutation-one", baseUpdatedAt: "2026-08-25T00:00:00.000Z" };
        mocks.updateProject.mockResolvedValue({ projectId: "canvas-one", updatedAt: "2026-08-25T00:00:00.001Z", mutationId: "mutation-one" });
        const saveResponse = await PATCH(new Request("http://localhost/api/drama-lab/canvas-projects/canvas-one", { method: "PATCH", body: JSON.stringify({ mutation }) }), context);

        expect(saveResponse.status).toBe(200);
        expect(mocks.updateProject).toHaveBeenCalledWith("user-one", "canvas-one", { mutation });
    });

    it("does not expose the dedicated route without authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/drama-lab/canvas-projects/canvas-one"), { params: Promise.resolve({ id: "canvas-one" }) });

        expect(response.status).toBe(401);
        expect(mocks.getProject).not.toHaveBeenCalled();
    });
});
