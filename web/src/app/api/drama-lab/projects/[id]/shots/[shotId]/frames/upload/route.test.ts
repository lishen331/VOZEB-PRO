import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    writePersistentMediaDataUrl: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest, assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", () => ({ persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.writePersistentMediaDataUrl }));

import { POST } from "./route";

const project = { id: "project-one", updatedAt: "2026-09-01T00:00:00.000Z", episodes: [{ id: "episode-one", shots: [{ id: "shot-one", order: 1, frames: {} }] }] };
const params = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

function uploadRequest(file: File, frameType = "first") {
    const form = new FormData();
    form.set("file", file);
    form.set("prompt", "uploaded frame prompt");
    form.set("description", "uploaded frame description");
    return new Request(`http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/upload?episodeId=episode-one&frameType=${frameType}`, { method: "POST", body: form, headers: { cookie: "session=test" } });
}

describe("POST /api/drama-lab/projects/:id/shots/:shotId/frames/upload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.writePersistentMediaDataUrl.mockResolvedValue({ token: "permanent/frame.png", url: "/api/reference-assets/permanent/frame.png", mimeType: "image/png", bytes: 4 });
        mocks.persistDramaLabShotUpdate.mockResolvedValue({
            ...project,
            episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], frames: { first: { status: "success", source: "uploaded", url: "/api/reference-assets/permanent/frame.png" } } }] }],
        });
    });

    it("persists an uploaded image as a first, key, or last frame with its metadata", async () => {
        const response = await POST(uploadRequest(new File([new Uint8Array([137, 80, 78, 71])], "frame.png", { type: "image/png" })), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { frame: { source: "uploaded", status: "success", url: "/api/reference-assets/permanent/frame.png" } } });
        expect(mocks.writePersistentMediaDataUrl).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), "image", expect.objectContaining({ ownerUserId: "user-one", projectId: "project-one" }));
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ episodeId: "episode-one", shotId: "shot-one", patch: expect.objectContaining({ frames: expect.objectContaining({ first: expect.objectContaining({ source: "uploaded" }) }) }) }),
        );
    });

    it("keeps collaborator uploads under the project's stable storage owner", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "collaborator" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "project-owner" });

        const response = await POST(uploadRequest(new File([new Uint8Array([137, 80, 78, 71])], "frame.png", { type: "image/png" })), params);

        expect(response.status).toBe(200);
        expect(mocks.writePersistentMediaDataUrl).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), "image", expect.objectContaining({ ownerUserId: "project-owner", projectId: "project-one" }));
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(expect.objectContaining({ userId: "collaborator", projectOwnerUserId: "project-owner" }));
    });

    it("rejects non-image files and unknown frame types before writing media", async () => {
        const invalid = await POST(uploadRequest(new File(["not an image"], "frame.txt", { type: "text/plain" })), params);
        expect(invalid.status).toBe(400);
        expect(mocks.writePersistentMediaDataUrl).not.toHaveBeenCalled();

        const unknown = await POST(uploadRequest(new File([new Uint8Array([1])], "frame.png", { type: "image/png" }), "middle"), params);
        expect(unknown.status).toBe(400);
    });

    it("requires authentication and rejects an upload without a file", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const unauthenticated = await POST(uploadRequest(new File([new Uint8Array([1])], "frame.png", { type: "image/png" })), params);
        expect(unauthenticated.status).toBe(401);

        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        const form = new FormData();
        const missing = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/upload?episodeId=episode-one&frameType=first", { method: "POST", body: form }), params);
        expect(missing.status).toBe(400);
    });
});
