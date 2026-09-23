import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.read, updateDramaProjectForUser: vi.fn() }));
vi.mock("@/lib/server/one-click-film/sync-runner", () => ({ syncOneClickProjectGeneration: mocks.sync }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "http://localhost" }));
import { GET } from "./route";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
const project = { id: "p1", sourceHandoffId: "one-click-film:p1", episodes: [] };
const read = () => GET(new Request("http://localhost/api/one-click-film/projects/p1", { headers: { cookie: "session=test" } }), { params: Promise.resolve({ id: "p1" }) });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "u1" });
    mocks.read.mockResolvedValue(project);
    mocks.sync.mockResolvedValue({ ...project, title: "synced" });
});
describe("manual generation project read", () => {
    it("settles paid tasks before returning the project", async () => {
        const response = await read();
        expect((await response.json()).data.project.title).toBe("synced");
        expect(mocks.sync).toHaveBeenCalledWith({ userId: "u1", project, origin: "http://localhost", cookie: "session=test" });
    });
    it("does not synchronize other modules or unauthenticated requests", async () => {
        mocks.read.mockResolvedValue({ ...project, sourceHandoffId: "drama-lab:p1" });
        expect((await read()).status).toBe(404);
        expect(mocks.sync).not.toHaveBeenCalled();
        mocks.user.mockResolvedValue(null);
        expect((await read()).status).toBe(401);
    });
    it("returns fresh user edits instead of replaying stale sync patches after a conflict", async () => {
        mocks.sync.mockRejectedValue(new DramaProjectStoreError("conflict", 409));
        mocks.read.mockResolvedValueOnce(project).mockResolvedValueOnce({ ...project, title: "user-edit" });
        expect((await (await read()).json()).data.project.title).toBe("user-edit");
        expect(mocks.sync).toHaveBeenCalledTimes(1);
    });
});
