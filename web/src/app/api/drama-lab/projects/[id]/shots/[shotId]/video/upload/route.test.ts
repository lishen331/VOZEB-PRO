import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    writePersistentMediaDataUrl: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest, assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-shot-generation-service")>("@/lib/server/drama-lab-shot-generation-service");
    return { ...actual, persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate };
});
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.writePersistentMediaDataUrl }));

import { POST } from "./route";

const project = {
    id: "project-one",
    updatedAt: "2026-09-11T00:00:00.000Z",
    episodes: [{ id: "episode-one", shots: [{ id: "shot-one", order: 1, videoUrl: "/api/reference-assets/permanent/original.mp4", generationStatus: "success", generationTaskId: "task-old", videoPrompt: "old prompt" }] }],
};
const params = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

function uploadRequest(file: File) {
    const form = new FormData();
    form.set("file", file);
    return new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/video/upload?episodeId=episode-one", { method: "POST", body: form, headers: { cookie: "session=test" } });
}

describe("POST /api/drama-lab/projects/:id/shots/:shotId/video/upload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "project-owner" });
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.writePersistentMediaDataUrl.mockResolvedValue({ token: "permanent/2026/09/11/videos/upload.mp4", url: "/api/reference-assets/permanent/2026/09/11/videos/upload.mp4", mimeType: "video/mp4", bytes: 4 });
        mocks.persistDramaLabShotUpdate.mockResolvedValue({
            ...project,
            episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], videoUrl: "/api/reference-assets/permanent/2026/09/11/videos/upload.mp4", generationStatus: "success" }] }],
        });
    });

    it("persists an uploaded video for the current shot and preserves the previous result in history", async () => {
        const response = await POST(uploadRequest(new File([new Uint8Array([0, 0, 0, 0])], "cut.mp4", { type: "video/mp4" })), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { shot: { videoUrl: "/api/reference-assets/permanent/2026/09/11/videos/upload.mp4", generationStatus: "success" } } });
        expect(mocks.writePersistentMediaDataUrl).toHaveBeenCalledWith(expect.stringMatching(/^data:video\/mp4;base64,/), "video", expect.objectContaining({ ownerUserId: "project-owner", projectId: "project-one", source: "drama-lab-video-upload" }));
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-one",
                projectOwnerUserId: "project-owner",
                patch: expect.objectContaining({
                    videoUrl: "/api/reference-assets/permanent/2026/09/11/videos/upload.mp4",
                    generationStatus: "success",
                    videoHistory: [expect.objectContaining({ url: "/api/reference-assets/permanent/original.mp4", taskId: "task-old" })],
                }),
            }),
        );
    });

    it("rejects unsupported video formats and active video tasks", async () => {
        const invalid = await POST(uploadRequest(new File(["not video"], "cut.avi", { type: "video/x-msvideo" })), params);
        expect(invalid.status).toBe(400);
        expect(mocks.writePersistentMediaDataUrl).not.toHaveBeenCalled();

        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project: { ...project, episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], generationStatus: "running" }] }] }, ownerUserId: "project-owner" });
        const active = await POST(uploadRequest(new File([new Uint8Array([0])], "cut.mp4", { type: "video/mp4" })), params);
        expect(active.status).toBe(409);
        expect(mocks.writePersistentMediaDataUrl).not.toHaveBeenCalled();
    });
});
