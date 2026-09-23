import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.project }));
vi.mock("@/lib/server/one-click-film/shot-media-upload", () => ({ isOneClickShotUploadTarget: (target: string) => ["image", "video", "first", "key", "last"].includes(target), uploadOneClickShotMedia: mocks.upload }));
import { POST } from "./route";
const params = { params: Promise.resolve({ id: "p", shotId: "s" }) };
function request() {
    const form = new FormData();
    form.set("file", new File(["bytes"], "a.png", { type: "image/png" }));
    return new Request("http://localhost/api/one-click-film/projects/p/shots/s/upload?episodeId=e&target=first", { method: "POST", body: form });
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "u" });
    mocks.project.mockResolvedValue({ id: "p", sourceHandoffId: "one-click-film:p" });
    mocks.upload.mockResolvedValue({ shot: { id: "s" } });
});
describe("one-click media upload route", () => {
    it("binds owner, project, episode and slot before upload", async () => {
        expect((await POST(request(), params)).status).toBe(200);
        expect(mocks.project).toHaveBeenCalledWith("u", "p");
        expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ userId: "u", episodeId: "e", shotId: "s", target: "first", file: expect.any(File) }));
    });
    it("rejects unauthenticated and other-module projects", async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await POST(request(), params)).status).toBe(401);
        mocks.project.mockResolvedValue({ id: "p", sourceHandoffId: "drama-lab:p" });
        expect((await POST(request(), params)).status).toBe(404);
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it("preserves lock/concurrent-edit rejection", async () => {
        mocks.upload.mockRejectedValue({ status: 409 });
        expect((await POST(request(), params)).status).toBe(409);
    });
});
