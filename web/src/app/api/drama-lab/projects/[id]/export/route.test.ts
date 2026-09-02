import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    exportDramaLabProjectForUser: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-project-archive", () => ({
    DramaLabProjectArchiveError: class DramaLabProjectArchiveError extends Error {
        constructor(message: string, readonly status = 422) {
            super(message);
        }
    },
    exportDramaLabProjectForUser: mocks.exportDramaLabProjectForUser,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
}));

import { GET } from "./route";

describe("/api/drama-lab/projects/[id]/export", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project: { id: "drama-one" }, ownerUserId: "user-one" });
        mocks.exportDramaLabProjectForUser.mockResolvedValue({
            data: new Uint8Array([80, 75, 3, 4]),
            fileName: "测试短剧-短剧实验室.zip",
        });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/drama-one/export"), context("drama-one"));
        expect(response.status).toBe(401);
        expect(mocks.exportDramaLabProjectForUser).not.toHaveBeenCalled();
    });

    it("exports only the requested project for the current user", async () => {
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/drama-one/export", { headers: { cookie: "session=test" } }), context("drama-one"));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/zip");
        expect(response.headers.get("content-disposition")).toContain("UTF-8''");
        expect(mocks.exportDramaLabProjectForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", projectId: "drama-one", cookie: "session=test" }));
        await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([80, 75, 3, 4]).buffer);
    });

    it("maps archive errors to their status", async () => {
        const ArchiveError = (await import("@/lib/server/drama-lab-project-archive")).DramaLabProjectArchiveError;
        mocks.exportDramaLabProjectForUser.mockRejectedValue(new ArchiveError("项目不存在", 404));
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/drama-one/export"), context("drama-one"));
        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({ code: 404, msg: "项目不存在" });
    });
});

function context(id: string) {
    return { params: Promise.resolve({ id }) };
}
