import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteDramaProjectForUser: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    updateDramaProjectForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({
    getDramaProject: mocks.getDramaProject,
}));
vi.mock("@/lib/server/drama-project-service", () => ({
    DramaProjectServiceError: class DramaProjectServiceError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    deleteDramaProjectForUser: mocks.deleteDramaProjectForUser,
    updateDramaProjectForUser: mocks.updateDramaProjectForUser,
}));

import { DramaProjectServiceError } from "@/lib/server/drama-project-service";
import { DELETE, PUT } from "./route";

describe("DELETE /api/drama-lab/projects/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.deleteDramaProjectForUser.mockResolvedValue(undefined);
        mocks.getDramaProject.mockResolvedValue({ id: "drama-one", title: "项目", episodes: [{ id: "episode-one", title: "第一集", script: "", shots: [] }], updatedAt: "2026-08-25T00:00:00.000Z" });
        mocks.updateDramaProjectForUser.mockImplementation(async (_userId: string, _id: string, value: unknown) => value);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it("requires authentication before deleting a project", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(401);
        expect(mocks.deleteDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("deletes the requested project for the current user", async () => {
        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(200);
        expect(mocks.deleteDramaProjectForUser).toHaveBeenCalledWith("user-one", "drama-one");
        await expect(response.json()).resolves.toMatchObject({ code: 0, msg: "项目删除成功" });
    });

    it("routes project updates through the service so removed episode canvases are reclaimed", async () => {
        const response = await PUT(
            new Request("http://localhost/api/drama-lab/projects/drama-one", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "新标题", episodes: [] }),
            }),
            context("drama-one"),
        );

        expect(response.status).toBe(200);
        expect(mocks.updateDramaProjectForUser).toHaveBeenCalledWith("user-one", "drama-one", expect.objectContaining({ id: "drama-one", title: "新标题", episodes: [] }));
    });

    it.each([
        [404, "短剧项目不存在"],
        [409, "项目存在关联任务，暂时不能删除"],
    ])("preserves the service error status for %s", async (status, message) => {
        mocks.deleteDramaProjectForUser.mockRejectedValue(new DramaProjectServiceError(message, status));

        const response = await DELETE(new Request("http://localhost/api/drama-lab/projects/drama-one", { method: "DELETE" }), context("drama-one"));

        expect(response.status).toBe(status);
        expect(mocks.deleteDramaProjectForUser).toHaveBeenCalledWith("user-one", "drama-one");
        await expect(response.json()).resolves.toMatchObject({ code: status, msg: message });
    });
});

function context(id: string) {
    return { params: Promise.resolve({ id }) };
}
