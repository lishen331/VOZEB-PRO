import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

type AudioTaskContext = { userId?: string; surface?: string; projectId?: string; episodeId?: string; shotId?: string; audioKind?: unknown };
type RecoveryTask = AudioTaskContext & {
    id: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    upstream?: { id: string };
    config: { model: string; apiFormat: "openai" | "gemini" };
    createdAt: number;
};

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProject: vi.fn(),
    getAudioTask: vi.fn(),
    getStoredGenerationTaskRecord: vi.fn(),
    hasStoredGenerationTaskContextConflict: vi.fn(),
    runGenerationTaskRecoveryBatch: vi.fn(),
    scheduleGenerationTask: vi.fn(),
    recoverGenerationTaskFromUpstream: vi.fn(),
    syncDramaLabAudioTask: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(
            message: string,
            readonly status = 403,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/drama-project-store", () => ({
    getDramaProject: mocks.getDramaProject,
    DramaProjectStoreError: class DramaProjectStoreError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask }));
vi.mock("@/lib/server/generation-task-store", () => ({
    getStoredGenerationTaskRecord: mocks.getStoredGenerationTaskRecord,
    hasStoredGenerationTaskContextConflict: mocks.hasStoredGenerationTaskContextConflict,
}));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.runGenerationTaskRecoveryBatch }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.scheduleGenerationTask }));
vi.mock("@/lib/server/generation-task-user-recovery", () => ({ recoverGenerationTaskFromUpstream: mocks.recoverGenerationTaskFromUpstream }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: (value: string) => value }));
vi.mock("@/lib/server/drama-lab-audio-service", () => ({
    DramaLabAudioError: class DramaLabAudioError extends Error {
        constructor(
            message: string,
            readonly status = 400,
        ) {
            super(message);
        }
    },
    legacyDramaAudioTaskId: vi.fn(() => "audio-one"),
    assertAudioTaskBinding: (shot: { audioTaskId?: string }, _kind: string, taskId: string) => {
        if (shot.audioTaskId !== taskId) throw new Error("audio task binding mismatch");
    },
    assertAudioTaskContext: (task: AudioTaskContext, input: AudioTaskContext) => {
        if (task.userId !== input.userId || task.projectId !== input.projectId || task.episodeId !== input.episodeId || task.shotId !== input.shotId || (task.audioKind && input.audioKind && task.audioKind !== input.audioKind)) {
            throw new Error("audio task context mismatch");
        }
    },
    syncDramaLabAudioTask: mocks.syncDramaLabAudioTask,
}));

import { POST } from "./route";

const project = { id: "project-one", episodes: [{ id: "episode-one", shots: [{ id: "shot-one", audioTaskId: "audio-one" }] }] } as unknown as DramaProject;
const task = {
    id: "audio-one",
    userId: "user-one",
    surface: "drama",
    projectId: "project-one",
    episodeId: "episode-one",
    shotId: "shot-one",
    audioKind: "dialogue",
    status: "running",
    upstream: { id: "upstream-one" },
    config: { model: "tts", apiFormat: "openai" },
    createdAt: 10,
} satisfies RecoveryTask;

describe("POST /api/drama-lab/projects/:id/shots/:shotId/recover-audio", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (_userId: string, _projectId: string) => ({ project: await mocks.getDramaProject(), ownerUserId: "user-one" }));
        mocks.getAudioTask.mockResolvedValue(task);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ upstreamTaskId: "upstream-one", submittedAt: 10 });
        mocks.hasStoredGenerationTaskContextConflict.mockReturnValue(false);
        mocks.scheduleGenerationTask.mockResolvedValue({ id: "audio-one" });
        mocks.runGenerationTaskRecoveryBatch.mockResolvedValue({ claimed: 1 });
        mocks.recoverGenerationTaskFromUpstream.mockResolvedValue(true);
        mocks.syncDramaLabAudioTask.mockResolvedValue(project);
    });

    it("recovers the original upstream task without creating a new task", async () => {
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(200);
        expect(mocks.recoverGenerationTaskFromUpstream).toHaveBeenCalledWith(expect.objectContaining({ type: "audio", id: "audio-one", upstreamTaskId: "upstream-one" }));
        expect(mocks.syncDramaLabAudioTask).toHaveBeenCalled();
    });

    it("recovers a pending task that already has an upstream identity", async () => {
        mocks.getAudioTask.mockResolvedValueOnce({ ...task, status: "pending" as const });
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: "submitted", upstreamTaskId: "upstream-one", submittedAt: 10 });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.recoverGenerationTaskFromUpstream).toHaveBeenCalledWith(expect.objectContaining({ type: "audio", id: "audio-one", upstreamTaskId: "upstream-one" }));
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
    });

    it("rejects a task from another project", async () => {
        mocks.getAudioTask.mockResolvedValue({ ...task, projectId: "other-project" });
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(500);
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it("rejects a task whose durable and payload context disagree", async () => {
        mocks.hasStoredGenerationTaskContextConflict.mockReturnValue(true);
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(409);
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it("rejects a conflicted scheduler record before querying upstream", async () => {
        mocks.hasStoredGenerationTaskContextConflict.mockImplementation((value: unknown) => value !== task);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ upstreamTaskId: "upstream-one", submittedAt: 10, payload: { projectId: "other-project" } });
        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });
        expect(response.status).toBe(409);
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it("wakes a pending created task through the existing worker", async () => {
        const pending = { ...task, status: "pending" as const, upstream: undefined, executionPhase: "created" as const };
        mocks.getAudioTask.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: "created", nextPollAt: 1 });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("audio", "audio-one", expect.objectContaining({ nextPollAt: expect.any(Number), lastUpstreamStatus: "user_recovery_requested" }));
        expect(mocks.scheduleGenerationTask.mock.calls[0][2]).not.toHaveProperty("executionPhase");
        expect(mocks.runGenerationTaskRecoveryBatch).toHaveBeenCalledWith(expect.objectContaining({ taskIds: ["audio-one"], limit: 1, userRequested: true, origin: "http://app.example.com", publicOrigin: "http://app.example.com" }));
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it.each(["result_ready", "persisting"] as const)("wakes a %s task for local persistence without querying upstream", async (phase) => {
        const pending = { ...task, status: "running" as const, upstream: undefined, executionPhase: phase };
        mocks.getAudioTask.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: phase, resultPayload: { url: "https://cdn.example.com/audio.mp3" } });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("audio", "audio-one", expect.objectContaining({ nextPollAt: expect.any(Number) }));
        expect(mocks.runGenerationTaskRecoveryBatch).toHaveBeenCalledTimes(1);
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it("does not resubmit a task interrupted during submission", async () => {
        const interrupted = { ...task, status: "running" as const, upstream: undefined, executionPhase: "submitting" as const };
        mocks.getAudioTask.mockResolvedValue(interrupted);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: "submitting" });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });

        expect(response.status).toBe(409);
        expect(mocks.scheduleGenerationTask).not.toHaveBeenCalled();
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it("does not resubmit a task in manual review without an upstream identity", async () => {
        const review = { ...task, status: "running" as const, upstream: undefined, executionPhase: "needs_review" as const };
        mocks.getAudioTask.mockResolvedValue(review);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: "needs_review" });

        const response = await POST(new Request("http://app.example.com/api/drama-lab/projects/project-one/shots/shot-one/recover-audio?episodeId=episode-one"), { params: Promise.resolve({ id: "project-one", shotId: "shot-one" }) });

        expect(response.status).toBe(409);
        expect(mocks.scheduleGenerationTask).not.toHaveBeenCalled();
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });
});
