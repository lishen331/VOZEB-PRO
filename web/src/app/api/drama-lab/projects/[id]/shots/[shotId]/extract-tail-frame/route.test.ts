import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    extractDramaLabTailFrame: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest, assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed }));
vi.mock("@/lib/server/drama-lab-tail-frame-service", () => ({
    extractDramaLabTailFrame: mocks.extractDramaLabTailFrame,
}));

import { POST } from "./route";

const project = {
    id: "project-one",
    updatedAt: "2026-09-01T00:00:00.000Z",
    episodes: [
        {
            id: "episode-one",
            shots: [
                { id: "shot-one", order: 1, generationTaskId: "video-task-one", generationStatus: "success", videoUrl: "/api/reference-assets/permanent/video.mp4" },
                { id: "shot-two", order: 2, frames: {} },
            ],
        },
    ],
};
const params = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };
const request = () => new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/extract-tail-frame?episodeId=episode-one", { method: "POST", headers: { cookie: "session=test" } });

describe("POST /api/drama-lab/projects/:id/shots/:shotId/extract-tail-frame", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.extractDramaLabTailFrame.mockResolvedValue({
            frame: { url: "/api/reference-assets/permanent/tail.png", source: "video_tail", sourceVideoTaskId: "video-task-one" },
            nextShot: { id: "shot-two" },
            candidate: { id: "candidate-project-one-shot-two-video-task-one", sourceVideoTaskId: "video-task-one" },
        });
    });

    it("extracts the real completed video tail and returns the next-shot candidate", async () => {
        const response = await POST(request(), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            code: 0,
            data: {
                frame: { url: "/api/reference-assets/permanent/tail.png", source: "video_tail" },
                nextShot: { id: "shot-two" },
                candidate: { sourceVideoTaskId: "video-task-one" },
            },
        });
        expect(mocks.extractDramaLabTailFrame).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "user-one", project, episodeId: "episode-one", shotId: "shot-one" }),
        );
    });

    it("is idempotent for a repeated extraction request and does not create another candidate", async () => {
        const existing = { frame: { url: "/api/reference-assets/permanent/tail.png", source: "video_tail" }, nextShot: { id: "shot-two" }, candidate: { id: "candidate-existing" }, reused: true };
        mocks.extractDramaLabTailFrame.mockResolvedValue(existing);

        const response = await POST(request(), params);

        expect(response.status).toBe(200);
        expect((await response.json()).data).toMatchObject({ reused: true, candidate: { id: "candidate-existing" } });
        expect(mocks.extractDramaLabTailFrame).toHaveBeenCalledTimes(1);
    });

    it("requires authentication and episode identity before touching the project", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const unauthenticated = await POST(request(), params);
        expect(unauthenticated.status).toBe(401);
        expect(mocks.getDramaProject).not.toHaveBeenCalled();

        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        const missingEpisode = await POST(
            new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/extract-tail-frame", { method: "POST" }),
            params,
        );
        expect(missingEpisode.status).toBe(400);
        expect(mocks.extractDramaLabTailFrame).not.toHaveBeenCalled();
    });

    it("maps a missing video or extraction failure to a user-visible error", async () => {
        mocks.extractDramaLabTailFrame.mockRejectedValue(Object.assign(new Error("当前镜头没有已完成的视频任务"), { status: 409 }));

        const response = await POST(request(), params);

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 409, msg: "当前镜头没有已完成的视频任务" });
    });
});
