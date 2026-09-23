import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getDramaProjectForUser: vi.fn(), startOneClickFilm: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser }));
vi.mock("@/lib/server/one-click-film/service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/one-click-film/service")>("@/lib/server/one-click-film/service");
    return { ...actual, startOneClickFilm: mocks.startOneClickFilm };
});

import { POST } from "./route";

const project = {
    id: "project-one",
    sourceHandoffId: "one-click-film:abc",
    episodes: [
        { id: "e1", shots: [] },
        { id: "e2", shots: [] },
        { id: "e3", shots: [] },
    ],
} as unknown as DramaProject;

const params = Promise.resolve({ id: "project-one" });
const post = (body: unknown) => POST(new Request("http://app.example.com/api/one-click-film/projects/project-one/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
    mocks.getDramaProjectForUser.mockResolvedValue(project);
    mocks.startOneClickFilm.mockImplementation(async (input: { episodeIds: string[] }) => ({
        id: "task-one",
        status: "pending",
        workflow: { episodeIds: input.episodeIds, steps: [], currentStepIndex: 0 },
    }));
});

describe("POST /api/one-click-film/projects/:id/tasks", () => {
    it("requires login", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await post({})).status).toBe(401);
    });

    it("rejects a project outside one-click-film", async () => {
        mocks.getDramaProjectForUser.mockResolvedValue({ ...project, sourceHandoffId: "drama-lab:abc" });
        expect((await post({})).status).toBe(404);
    });

    it("only runs the episodes the user selected", async () => {
        const response = await post({ episodeIds: ["e2"] });
        expect(response.status).toBe(200);
        expect(mocks.startOneClickFilm).toHaveBeenCalledWith(expect.objectContaining({ episodeIds: ["e2"], sourceEpisodeId: "e2" }));
    });

    it("falls back to every episode when the user selected none", async () => {
        await post({});
        expect(mocks.startOneClickFilm).toHaveBeenCalledWith(expect.objectContaining({ episodeIds: ["e1", "e2", "e3"] }));
    });

    it("rejects episode ids that do not belong to the project", async () => {
        const response = await post({ episodeIds: ["e2", "not-mine"] });
        expect(response.status).toBe(400);
        expect((await response.json()).msg).toContain("not-mine");
        expect(mocks.startOneClickFilm).not.toHaveBeenCalled();
    });

    it("ignores a sourceEpisodeId outside the selected set", async () => {
        await post({ episodeIds: ["e2"], episodeId: "e3" });
        expect(mocks.startOneClickFilm).toHaveBeenCalledWith(expect.objectContaining({ episodeIds: ["e2"], sourceEpisodeId: "e2" }));
    });
});
