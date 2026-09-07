import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createDramaProjectForUser: vi.fn(),
    ensureDramaLabProjectGroup: vi.fn(),
    listDramaProjectSummaries: vi.fn(),
    listDramaLabProjectsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-service", () => ({
    DramaProjectServiceError: class DramaProjectServiceError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    createDramaProjectForUser: mocks.createDramaProjectForUser,
}));
vi.mock("@/lib/server/drama-project-store", () => ({ listDramaProjectSummaries: mocks.listDramaProjectSummaries }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    ensureDramaLabProjectGroup: mocks.ensureDramaLabProjectGroup,
    listDramaLabProjectsForUser: mocks.listDramaLabProjectsForUser,
}));

import { POST } from "./route";

describe("POST /api/drama-lab/projects", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.createDramaProjectForUser.mockResolvedValue({ id: "drama-one", title: "新项目" });
    });

    it("creates through the integrated drama service with the LocalMiniDrama defaults", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新项目", summary: "描述" }) }));

        expect(response.status).toBe(200);
        expect(mocks.createDramaProjectForUser).toHaveBeenCalledWith("user-one", { title: "新项目", summary: "描述", style: "电影感国漫", ratio: "16:9" });
        expect(mocks.ensureDramaLabProjectGroup).toHaveBeenCalledWith("drama-one", "user-one");
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { project: { id: "drama-one" } } });
    });
});
