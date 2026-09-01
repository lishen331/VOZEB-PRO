import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    acceptDramaLabFirstFrameCandidate: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/drama-lab-tail-frame-service", () => ({
    acceptDramaLabFirstFrameCandidate: mocks.acceptDramaLabFirstFrameCandidate,
}));

import { POST } from "./route";

const project = {
    id: "project-one",
    updatedAt: "2026-09-01T00:00:00.000Z",
    episodes: [{ id: "episode-one", shots: [{ id: "shot-one", order: 1, frames: {} }, { id: "shot-two", order: 2, firstFrameCandidate: { id: "candidate-one" }, frames: {} }] }],
};
const params = { params: Promise.resolve({ id: "project-one", shotId: "shot-two" }) };
const url = (replaceExisting = false) => `http://app.example.com/api/drama-lab/projects/project-one/shots/shot-two/accept-first-frame-candidate?episodeId=episode-one&candidateId=candidate-one&replaceExisting=${replaceExisting}`;

describe("POST /api/drama-lab/projects/:id/shots/:shotId/accept-first-frame-candidate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.acceptDramaLabFirstFrameCandidate.mockResolvedValue({
            shot: { id: "shot-two", frames: { first: { status: "success", source: "video_tail", locked: true, url: "/api/reference-assets/permanent/tail.png" } } },
            candidate: null,
        });
    });

    it("accepts only the project-owned candidate and locks it as the next shot first frame", async () => {
        const response = await POST(new Request(url(), { method: "POST", headers: { cookie: "session=test" } }), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { shot: { frames: { first: { source: "video_tail", locked: true } } }, candidate: null } });
        expect(mocks.acceptDramaLabFirstFrameCandidate).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "user-one", project, episodeId: "episode-one", shotId: "shot-two", candidateId: "candidate-one", replaceExisting: false }),
        );
    });

    it("does not overwrite an existing first frame unless replacement is explicit", async () => {
        mocks.acceptDramaLabFirstFrameCandidate.mockRejectedValueOnce(Object.assign(new Error("当前镜头已有首帧，请确认是否替换"), { status: 409 }));
        const conflict = await POST(new Request(url(), { method: "POST" }), params);
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({ code: 409 });

        mocks.acceptDramaLabFirstFrameCandidate.mockResolvedValueOnce({ shot: { id: "shot-two", frames: { first: { source: "video_tail", locked: true } } }, candidate: null, replaced: true });
        const replaced = await POST(new Request(url(true), { method: "POST" }), params);
        expect(replaced.status).toBe(200);
        expect((await replaced.json()).data).toMatchObject({ replaced: true });
        expect(mocks.acceptDramaLabFirstFrameCandidate).toHaveBeenLastCalledWith(expect.objectContaining({ replaceExisting: true }));
    });

    it("rejects missing or spoofed candidate IDs", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-two/accept-first-frame-candidate?episodeId=episode-one", { method: "POST" }), params);
        expect(response.status).toBe(400);
        expect(mocks.acceptDramaLabFirstFrameCandidate).not.toHaveBeenCalled();

        mocks.acceptDramaLabFirstFrameCandidate.mockRejectedValueOnce(Object.assign(new Error("候选首帧不存在或不属于当前项目"), { status: 404 }));
        const spoofed = await POST(new Request(url().replace("candidate-one", "spoofed"), { method: "POST" }), params);
        expect(spoofed.status).toBe(404);
    });
});
