import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    fetchInternalApi: vi.fn(),
    getStoredGenerationTaskRecord: vi.fn(),
    listStoredDramaTaskRecords: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    runGenerationTaskRecoveryBatch: vi.fn(),
}));

vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi }));
vi.mock("@/lib/server/generation-task-store", () => ({
    getStoredGenerationTaskRecord: mocks.getStoredGenerationTaskRecord,
    listStoredDramaTaskRecords: mocks.listStoredDramaTaskRecords,
}));
vi.mock("@/lib/server/drama-lab-shot-generation-service", () => ({ persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.runGenerationTaskRecoveryBatch }));

import { recoverDramaLabVideoTasks } from "./drama-lab-video-recovery-service";

describe("recoverDramaLabVideoTasks", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getStoredGenerationTaskRecord.mockResolvedValue(null);
        mocks.listStoredDramaTaskRecords.mockResolvedValue([]);
        mocks.persistDramaLabShotUpdate.mockResolvedValue(undefined);
        mocks.runGenerationTaskRecoveryBatch.mockResolvedValue({ claimed: 1 });
        mocks.fetchInternalApi.mockResolvedValue(Response.json({ code: 0, data: { shot: {} } }));
    });

    it("discovers a strictly scoped task, persists its binding, recovers only when due, and returns a redacted summary", async () => {
        const project = projectWithShots([{ id: "shot-one" }]);
        const task = taskRecord({ id: "video-one", shotId: "shot-one", nextPollAt: 900, payload: { prompt: "private prompt", config: { apiKey: "secret" } } });
        mocks.listStoredDramaTaskRecords.mockResolvedValue([task]);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue(task);

        const result = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", publicOrigin: "https://public.example", cookie: "session=one", now: 1_000 });

        expect(mocks.runGenerationTaskRecoveryBatch).toHaveBeenCalledWith({
            origin: "http://internal.example",
            publicOrigin: "https://public.example",
            cookie: "session=one",
            limit: 1,
            taskIds: ["video-one"],
        });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-one",
                episodeId: "episode-one",
                shotId: "shot-one",
                patch: { generationTaskId: "video-one", generationAttempt: undefined },
                retryOnConflict: false,
            }),
        );
        expect(mocks.fetchInternalApi).toHaveBeenCalledWith(
            "http://internal.example/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one",
            expect.objectContaining({ method: "POST", headers: { cookie: "session=one" } }),
        );
        expect(result).toMatchObject({ episodeId: "episode-one", activeTaskIds: ["video-one"], syncedShotIds: ["shot-one"], syncErrors: [], tasks: [{ shotId: "shot-one", taskId: "video-one", binding: "discovered" }] });
        expect(result.tasks[0]).not.toHaveProperty("payload");
        expect(result.tasks[0]).not.toHaveProperty("config");
        expect(JSON.stringify(result)).not.toContain("private prompt");
        expect(JSON.stringify(result)).not.toContain("secret");
    });

    it("allows an explicitly persisted legacy task but never auto-attaches a foreign task", async () => {
        const project = projectWithShots([{ id: "shot-one", generationTaskId: "legacy-task" }]);
        const legacy = taskRecord({ id: "legacy-task", shotId: undefined, surface: undefined, projectId: undefined, episodeId: undefined, nextPollAt: 900 });
        const foreignCandidate = taskRecord({ id: "foreign-discovered", shotId: "shot-one", userId: "user-one", nextPollAt: 900 });
        mocks.getStoredGenerationTaskRecord.mockResolvedValue(legacy);
        mocks.listStoredDramaTaskRecords.mockResolvedValue([foreignCandidate]);

        const result = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", now: 1_000 });

        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0]).toMatchObject({ taskId: "legacy-task", binding: "persisted" });
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect(mocks.runGenerationTaskRecoveryBatch).toHaveBeenCalledWith(expect.objectContaining({ taskIds: ["legacy-task"] }));
        expect(mocks.fetchInternalApi).toHaveBeenCalledTimes(1);

        vi.clearAllMocks();
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ ...(legacy as Record<string, unknown>), userId: "other-user" });
        mocks.listStoredDramaTaskRecords.mockResolvedValue([foreignCandidate]);
        const blocked = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", now: 1_000 });
        expect(blocked.tasks).toEqual([]);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("asks sync-generation to clear an owned binding whose task record has expired", async () => {
        const project = projectWithShots([{ id: "shot-one", generationTaskId: "expired-task" }]);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue(null);

        const result = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", now: 1_000 });

        expect(mocks.fetchInternalApi).toHaveBeenCalledWith("http://internal.example/api/drama-lab/projects/project-one/shots/shot-one/sync-generation?episodeId=episode-one", expect.objectContaining({ method: "POST" }));
        expect(result.syncedShotIds).toEqual(["shot-one"]);
        expect(result.tasks).toEqual([]);
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
    });

    it("deduplicates discovered attempts per shot and skips future polls", async () => {
        const project = projectWithShots([{ id: "shot-one" }, { id: "shot-two" }]);
        const first = taskRecord({ id: "video-old", shotId: "shot-one", attemptNo: 1, updatedAt: 200, nextPollAt: 2_000 });
        const second = taskRecord({ id: "video-new", shotId: "shot-one", attemptNo: 2, updatedAt: 100, nextPollAt: 2_000 });
        const other = taskRecord({ id: "video-other", shotId: "shot-two", attemptNo: 1, updatedAt: 300, nextPollAt: 2_000 });
        mocks.listStoredDramaTaskRecords.mockResolvedValue([first, second, other]);
        mocks.getStoredGenerationTaskRecord.mockImplementation(async (_type: string, id: string) => ({ "video-old": first, "video-new": second, "video-other": other })[id] || null);

        const result = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", now: 1_000 });

        expect(result.tasks.map((task) => task.taskId)).toEqual(["video-new", "video-other"]);
        expect(result.activeTaskIds).toEqual(["video-new", "video-other"]);
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(2);
    });

    it("returns validation errors for an unknown episode before scanning tasks", async () => {
        const project = projectWithShots([{ id: "shot-one" }]);

        await expect(recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "missing", origin: "http://internal.example" })).rejects.toMatchObject({ status: 404 });
        expect(mocks.listStoredDramaTaskRecords).not.toHaveBeenCalled();
    });

    it("does not attach a task when durable and payload coordinates conflict", async () => {
        const project = projectWithShots([{ id: "shot-one" }]);
        const conflicting = taskRecord({ id: "conflicting", shotId: "shot-one", payload: { shotId: "another-shot" }, nextPollAt: 900 });
        mocks.listStoredDramaTaskRecords.mockResolvedValue([conflicting]);
        mocks.getStoredGenerationTaskRecord.mockResolvedValue(conflicting);

        const result = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", now: 1_000 });

        expect(result.tasks).toEqual([]);
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("marks resultAvailable only for a provider media URL, not human-readable upstream errors", async () => {
        const project = projectWithShots([{ id: "shot-one" }, { id: "shot-two" }]);
        const ready = taskRecord({ id: "ready", shotId: "shot-one", status: "running", executionPhase: "result_ready", payload: { upstream: { resultUrl: "https://cdn.example/ready.mp4" } }, nextPollAt: 2_000 });
        const error = taskRecord({ id: "error-text", shotId: "shot-two", status: "running", executionPhase: "result_ready", payload: { upstream: { resultUrl: "no active tokens available" } }, nextPollAt: 2_000 });
        mocks.listStoredDramaTaskRecords.mockResolvedValue([ready, error]);
        mocks.getStoredGenerationTaskRecord.mockImplementation(async (_type: string, id: string) => ({ ready, "error-text": error })[id] || null);

        const result = await recoverDramaLabVideoTasks({ userId: "user-one", project, episodeId: "episode-one", origin: "http://internal.example", now: 1_000 });

        expect(result.tasks.find((task) => task.taskId === "ready")?.resultAvailable).toBe(true);
        expect(result.tasks.find((task) => task.taskId === "error-text")?.resultAvailable).toBe(false);
    });
});

function projectWithShots(shots: Array<Record<string, unknown>>) {
    return {
        id: "project-one",
        episodes: [{ id: "episode-one", shots }],
    } as never;
}

function taskRecord(overrides: Record<string, unknown> = {}) {
    const now = Number(overrides.updatedAt) || 500;
    const payload = {
        id: String(overrides.id || "video-task"),
        userId: String(overrides.userId || "user-one"),
        status: "running",
        surface: overrides.surface === undefined ? "drama" : overrides.surface,
        projectId: overrides.projectId === undefined ? "project-one" : overrides.projectId,
        episodeId: overrides.episodeId === undefined ? "episode-one" : overrides.episodeId,
        shotId: overrides.shotId === undefined ? "shot-one" : overrides.shotId,
        attemptNo: overrides.attemptNo === undefined ? 0 : overrides.attemptNo,
        ...(typeof overrides.payload === "object" ? overrides.payload : {}),
    };
    return {
        id: String(overrides.id || "video-task"),
        userId: String(overrides.userId || "user-one"),
        type: "video",
        status: "running",
        payload,
        createdAt: now - 100,
        updatedAt: now,
        expiresAt: 100_000,
        surface: overrides.surface === undefined ? "drama" : overrides.surface,
        projectId: overrides.projectId === undefined ? "project-one" : overrides.projectId,
        episodeId: overrides.episodeId === undefined ? "episode-one" : overrides.episodeId,
        shotId: overrides.shotId === undefined ? "shot-one" : overrides.shotId,
        attemptNo: overrides.attemptNo === undefined ? 0 : overrides.attemptNo,
        executionPhase: "polling",
        nextPollAt: overrides.nextPollAt === undefined ? 900 : overrides.nextPollAt,
        ...overrides,
    } as never;
}
