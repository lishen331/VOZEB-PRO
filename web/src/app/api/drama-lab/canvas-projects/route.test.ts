import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listProjects: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/canvas-project-service", () => ({ listDramaLabCanvasProjectsForUser: mocks.listProjects }));

import { DELETE, GET, POST } from "./route";

describe("drama lab canvas project collection route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.listProjects.mockResolvedValue({ projects: [], total: 0, page: 1, pageSize: 12 });
    });

    it("lists only through the dedicated drama-lab service", async () => {
        const response = await GET(new Request("http://localhost/api/drama-lab/canvas-projects?page=1&pageSize=12"));

        expect(response.status).toBe(200);
        expect(mocks.listProjects).toHaveBeenCalledWith("user-one", { page: "1", pageSize: "12" });
    });

    it("does not expose collection-level create or delete operations", async () => {
        await expect(POST(new Request("http://localhost/api/drama-lab/canvas-projects", { method: "POST" }))).resolves.toMatchObject({ status: 400 });
        await expect(DELETE(new Request("http://localhost/api/drama-lab/canvas-projects", { method: "DELETE" }))).resolves.toMatchObject({ status: 400 });
    });
});
