import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    fetchInternalApi: vi.fn(),
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
    getAudioTask: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    prepareDramaLabAudio: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "http://app.example.com" }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(message: string, readonly status = 403) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject, DramaProjectStoreError: class DramaProjectStoreError extends Error { constructor(message: string, readonly status: number) { super(message); } } }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask }));
vi.mock("@/lib/server/drama-lab-audio-service", () => ({ legacyDramaAudioTaskId: vi.fn((shot: { audioTaskId?: string }) => shot.audioTaskId), DramaLabAudioError: class DramaLabAudioError extends Error { constructor(message: string, readonly status = 400) { super(message); } }, prepareDramaLabAudio: mocks.prepareDramaLabAudio, syncDramaLabAudioTask: vi.fn() }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", () => ({ persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate }));

import { POST } from "./route";

const project = { id: "project-one", updatedAt: "2026-09-01T00:00:00.000Z", creativeConversationId: "conversation-one", episodes: [{ id: "episode-one", shots: [{ id: "shot-one", audioAttempt: 1 }] }] } as unknown as DramaProject;

describe("POST /api/drama-lab/projects/:id/shots/:shotId/generate-audio", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "user-one" });
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { audioModel: "tts-model" } });
        mocks.prepareDramaLabAudio.mockReturnValue({ project, episode: project.episodes[0], shot: project.episodes[0].shots[0], prompt: "你好", kind: "dialogue", speaker: "林夏", voice: "nova", speed: 1.1, instructions: "自然" });
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ task: { id: "audio-task", status: "running", model: "tts-model" } }));
        mocks.persistDramaLabShotUpdate.mockResolvedValue(project);
        mocks.getAudioTask.mockResolvedValue(null);
    });

    it("dispatches a scoped audio task and persists its binding", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-audio?episodeId=episode-one", { method: "POST", body: JSON.stringify({ kind: "dialogue" }) }), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(200);
        expect(mocks.assertDramaLabStageAllowed).toHaveBeenCalledWith("user-one", "project-one", "storyboard_video", {
            episodeId: "episode-one",
            resourceType: "shot",
            resourceId: "shot-one",
        });
        expect(mocks.fetchInternalApi).toHaveBeenCalledWith("http://app.example.com/api/audio-tasks", expect.objectContaining({ method: "POST", body: expect.stringContaining('"projectId":"project-one"') }));
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ audioStatus: "running", audioTaskId: "audio-task", audioAttempt: 2 }) }));
    });

    it("rejects an upstream response without a task id", async () => {
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ error: "provider unavailable" }, { status: 502 }));
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-audio?episodeId=episode-one", { method: "POST" }), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(502);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("does not submit a duplicate task while the shot is active", async () => {
        const activeProject = { ...project, episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], audioStatus: "running", audioTaskId: "existing-task" }] }] };
        mocks.getDramaProject.mockResolvedValue(activeProject);
        mocks.prepareDramaLabAudio.mockReturnValue({ project: activeProject, episode: activeProject.episodes[0], shot: activeProject.episodes[0].shots[0], prompt: "你好", kind: "dialogue" });
        mocks.getAudioTask.mockResolvedValue({ id: "existing-task", status: "running" });
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/generate-audio?episodeId=episode-one", { method: "POST" }), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(409);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});
