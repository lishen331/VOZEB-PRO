import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readJsonBodyResult: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
    findDramaAudioSplitShot: vi.fn(),
    normalizeDramaAudioSplitOptions: vi.fn(),
    planDramaAudioSplit: vi.fn(),
    applyDramaAudioSplitDetailed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: mocks.readJsonBodyResult }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(message: string, readonly status = 403) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/drama-project-store", () => ({
    getDramaProject: mocks.getDramaProject,
    DramaProjectStoreError: class DramaProjectStoreError extends Error {
        constructor(message: string, readonly status: number) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/drama-lab-audio-split-service", () => ({
    DramaLabAudioSplitError: class DramaLabAudioSplitError extends Error {
        constructor(message: string, readonly status = 400) {
            super(message);
        }
    },
    findDramaAudioSplitShot: mocks.findDramaAudioSplitShot,
    normalizeDramaAudioSplitOptions: mocks.normalizeDramaAudioSplitOptions,
    planDramaAudioSplit: mocks.planDramaAudioSplit,
    applyDramaAudioSplitDetailed: mocks.applyDramaAudioSplitDetailed,
}));

import { POST } from "./route";

const sourceShot = { id: "shot-one", title: "源镜头" };
const project = { id: "project-one", updatedAt: "2026-09-01T00:00:00.000Z", episodes: [{ id: "episode-one", shots: [sourceShot] }] };
const previewPlan = { sourceShotId: "shot-one", sourceShotTitle: "源镜头", sourceFingerprint: "fingerprint", segments: [{ index: 0, kind: "dialogue", text: "你好", duration: 5, durationMs: 5_000, startMs: 0, endMs: 5_000, durationSource: "estimated", utterances: [], candidateId: "shot-shot-one-audio-split-1" }, { index: 1, kind: "dialogue", text: "再见", duration: 5, durationMs: 5_000, startMs: 5_000, endMs: 10_000, durationSource: "estimated", utterances: [], candidateId: "shot-shot-one-audio-split-2" }], totalDurationMs: 10_000 };
const context = { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) };

describe("POST /api/drama-lab/projects/:id/shots/:shotId/split-by-audio", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBodyResult.mockResolvedValue({ ok: true, data: {} });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "user-one" });
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.findDramaAudioSplitShot.mockReturnValue({ episode: project.episodes[0], shot: sourceShot });
        mocks.normalizeDramaAudioSplitOptions.mockReturnValue({});
        mocks.planDramaAudioSplit.mockReturnValue(previewPlan);
        mocks.applyDramaAudioSplitDetailed.mockResolvedValue({ project, sourceShotId: "shot-one", createdShots: [], skippedSegmentIndexes: [0, 1], preservedShotIds: ["shot-one"] });
    });

    it("returns a server-computed preview without persisting", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/shots/shot-one/split-by-audio?episodeId=episode-one", { method: "POST", body: "{}" }), context);

        expect(response.status).toBe(200);
        expect(mocks.planDramaAudioSplit).toHaveBeenCalledWith(sourceShot, {});
        expect(mocks.applyDramaAudioSplitDetailed).not.toHaveBeenCalled();
        expect(mocks.assertDramaLabStageAllowed).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { plan: previewPlan, sourceUpdatedAt: project.updatedAt } });
    });

    it("applies only an explicit plan and forwards the optimistic version", async () => {
        mocks.readJsonBodyResult.mockResolvedValue({ ok: true, data: { action: "apply", plan: previewPlan, expectedUpdatedAt: "version-one" } });
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/shots/shot-one/split-by-audio?episodeId=episode-one", { method: "POST", body: "{}" }), context);

        expect(response.status).toBe(200);
        expect(mocks.applyDramaAudioSplitDetailed).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", project, episodeId: "episode-one", shotId: "shot-one", plan: previewPlan, expectedUpdatedAt: "version-one" }));
        expect(mocks.assertDramaLabStageAllowed).toHaveBeenCalledWith("user-one", "project-one", "storyboard", {
            episodeId: "episode-one",
            resourceType: "shot",
            resourceId: "shot-one",
        });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { sourceShotId: "shot-one", skippedSegmentIndexes: [0, 1] } });
    });

    it("rejects unauthenticated and malformed requests before loading the project", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        const unauthorized = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/shots/shot-one/split-by-audio?episodeId=episode-one", { method: "POST" }), context);
        expect(unauthorized.status).toBe(401);
        expect(mocks.getDramaProject).not.toHaveBeenCalled();

        mocks.readJsonBodyResult.mockResolvedValueOnce({ ok: false, status: 413, message: "请求体过大" });
        const malformed = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/shots/shot-one/split-by-audio?episodeId=episode-one", { method: "POST" }), context);
        expect(malformed.status).toBe(413);
        expect(mocks.getDramaProject).not.toHaveBeenCalled();
    });

    it("requires the episode query parameter", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/shots/shot-one/split-by-audio", { method: "POST", body: "{}" }), context);
        expect(response.status).toBe(400);
        expect(mocks.getDramaProject).not.toHaveBeenCalled();
    });
});
