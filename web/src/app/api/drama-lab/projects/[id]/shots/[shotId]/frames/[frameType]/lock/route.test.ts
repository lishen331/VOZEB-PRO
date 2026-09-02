import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest, assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", () => ({ persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate }));

import { POST } from "./route";

const project = {
    id: "project-one",
    updatedAt: "2026-09-01T00:00:00.000Z",
    episodes: [{ id: "episode-one", shots: [{ id: "shot-one", order: 1, frames: { first: { status: "success", source: "generated", url: "/first.png", locked: false } } }] }],
};
const params = { params: Promise.resolve({ id: "project-one", shotId: "shot-one", frameType: "first" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/frames/:frameType/lock", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, patch }) => ({
            ...candidate,
            episodes: [{ ...candidate.episodes[0], shots: [{ ...candidate.episodes[0].shots[0], ...patch }] }],
        }));
    });

    it("locks a selected frame and persists the lock state", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/first/lock?episodeId=episode-one", { method: "POST", body: JSON.stringify({ locked: true }), headers: { "content-type": "application/json", cookie: "session=test" } }), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { frame: { locked: true } } });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(expect.objectContaining({ patch: { frames: { first: expect.objectContaining({ locked: true, url: "/first.png" }) } } }));
    });

    it("rejects an invalid frame type or malformed lock body", async () => {
        const invalidType = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/middle/lock?episodeId=episode-one", { method: "POST", body: JSON.stringify({ locked: true }), headers: { "content-type": "application/json" } }), {
            params: Promise.resolve({ id: "project-one", shotId: "shot-one", frameType: "middle" }),
        });
        expect(invalidType.status).toBe(400);

        const invalidBody = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/first/lock?episodeId=episode-one", { method: "POST", body: JSON.stringify({ locked: "yes" }), headers: { "content-type": "application/json" } }), params);
        expect(invalidBody.status).toBe(400);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("rejects locking a frame that is still running or has no persistent URL", async () => {
        mocks.getDramaProject.mockResolvedValue({
            ...project,
            episodes: [{
                ...project.episodes[0],
                shots: [{
                    ...project.episodes[0].shots[0],
                    frames: { first: { status: "running", taskId: "frame-task" } },
                }],
            }],
        });
        const running = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/first/lock?episodeId=episode-one", { method: "POST", body: JSON.stringify({ locked: true }), headers: { "content-type": "application/json" } }), params);
        expect(running.status).toBe(409);
        expect(await running.json()).toMatchObject({ code: 409, msg: expect.stringContaining("尚未生成") });

        mocks.getDramaProject.mockResolvedValue({
            ...project,
            episodes: [{
                ...project.episodes[0],
                shots: [{
                    ...project.episodes[0].shots[0],
                    frames: { first: { status: "success", url: "blob:temporary" } },
                }],
            }],
        });
        const transient = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/first/lock?episodeId=episode-one", { method: "POST", body: JSON.stringify({ locked: true }), headers: { "content-type": "application/json" } }), params);
        expect(transient.status).toBe(409);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("returns a conflict without changing the frame when the project was edited concurrently", async () => {
        mocks.persistDramaLabShotUpdate.mockRejectedValue(Object.assign(new Error("短剧项目已在其他页面更新，请刷新后重试"), { status: 409 }));
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/frames/first/lock?episodeId=episode-one", { method: "POST", body: JSON.stringify({ locked: true }), headers: { "content-type": "application/json" } }), params);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 409 });
    });
});
