import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getDramaProjectForUser: vi.fn(), exportProject: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: (origin: string) => origin }));
vi.mock("@/lib/server/drama-lab-project-archive", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-project-archive")>("@/lib/server/drama-lab-project-archive");
    return { ...actual, exportDramaLabProjectForUser: mocks.exportProject };
});

import { GET } from "./route";

const project = {
    id: "project-one",
    sourceHandoffId: "one-click-film:abc",
    episodes: [
        { id: "e1", shots: [] },
        { id: "e2", shots: [] },
    ],
} as unknown as DramaProject;

const params = Promise.resolve({ id: "project-one" });
const get = (query = "") => GET(new Request(`http://app.example.com/api/one-click-film/projects/project-one/export${query}`), { params });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
    mocks.getDramaProjectForUser.mockResolvedValue(project);
    mocks.exportProject.mockResolvedValue({ fileName: "一键成片.zip", data: new Uint8Array([1, 2, 3]), mediaCount: 2, omittedMediaCount: 0 });
});

describe("GET /api/one-click-film/projects/:id/export", () => {
    it("requires login", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
    });

    it("rejects a project outside one-click-film", async () => {
        mocks.getDramaProjectForUser.mockResolvedValue({ ...project, sourceHandoffId: "drama-lab:abc" });
        expect((await get()).status).toBe(404);
    });

    it("streams a zip with media included and exports the whole project by default", async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/zip");
        expect(response.headers.get("Content-Disposition")).toContain(encodeURIComponent("一键成片.zip"));
        expect(mocks.exportProject).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-one", includeMedia: true }));
        expect(mocks.exportProject.mock.calls[0][0]).not.toHaveProperty("episodeIds");
    });

    it("honors an explicit episode selection and de-duplicates it", async () => {
        await get("?episodeId=e2&episodeId=e2");
        expect(mocks.exportProject).toHaveBeenCalledWith(expect.objectContaining({ episodeIds: ["e2"] }));
    });

    it("rejects episode ids that do not belong to the project", async () => {
        const response = await get("?episodeId=nope");
        expect(response.status).toBe(400);
        expect((await response.json()).msg).toContain("nope");
        expect(mocks.exportProject).not.toHaveBeenCalled();
    });
});
