import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    recoverDramaLabVideoTasks: vi.fn(),
    resolveInternalOrigin: vi.fn(),
    resolvePublicRequestOrigin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-video-recovery-service", () => {
    class DramaLabVideoRecoveryError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    }
    return { DramaLabVideoRecoveryError, recoverDramaLabVideoTasks: mocks.recoverDramaLabVideoTasks };
});
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: mocks.resolveInternalOrigin }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: mocks.resolvePublicRequestOrigin }));

import { GET, POST } from "./route";

const project = { id: "project-one", episodes: [{ id: "episode-one", shots: [] }] };
const context = { params: Promise.resolve({ id: "project-one", episodeId: "episode-one" }) };

describe("Drama Lab episode video recovery route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolvePublicRequestOrigin.mockReturnValue("https://public.example");
        mocks.resolveInternalOrigin.mockReturnValue("http://internal.example");
        mocks.recoverDramaLabVideoTasks.mockResolvedValue({ episodeId: "episode-one", tasks: [], activeTaskIds: [], syncedShotIds: [], syncErrors: [] });
    });

    it("supports GET and forwards authenticated origin/cookie context", async () => {
        const request = new Request("https://public.example/api/drama-lab/projects/project-one/episodes/episode-one/recover-generation", { headers: { cookie: "session=one" } });
        const response = await GET(request, context);

        expect(response.status).toBe(200);
        expect(mocks.recoverDramaLabVideoTasks).toHaveBeenCalledWith({
            userId: "user-one",
            project,
            episodeId: "episode-one",
            origin: "http://internal.example",
            publicOrigin: "https://public.example",
            cookie: "session=one",
        });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { episodeId: "episode-one" } });
    });

    it("supports POST with the same recovery semantics", async () => {
        const response = await POST(new Request("https://public.example/api/drama-lab/projects/project-one/episodes/episode-one/recover-generation", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.recoverDramaLabVideoTasks).toHaveBeenCalledTimes(1);
    });

    it("requires authentication and never scans another user's project", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("https://public.example/api/drama-lab/projects/project-one/episodes/episode-one/recover-generation"), context);

        expect(response.status).toBe(401);
        expect(mocks.getDramaProject).not.toHaveBeenCalled();
        expect(mocks.recoverDramaLabVideoTasks).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown project or episode", async () => {
        mocks.getDramaProject.mockResolvedValueOnce(null);
        const missingProject = await GET(new Request("https://public.example/api/drama-lab/projects/project-one/episodes/episode-one/recover-generation"), context);
        expect(missingProject.status).toBe(404);

        mocks.getDramaProject.mockResolvedValueOnce({ id: "project-one", episodes: [] });
        const missingEpisode = await GET(new Request("https://public.example/api/drama-lab/projects/project-one/episodes/episode-one/recover-generation"), context);
        expect(missingEpisode.status).toBe(404);
    });
});
