import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    resolveProject: vi.fn(),
    getCollaboration: vi.fn(),
    listRecords: vi.fn(),
    listProjectRecords: vi.fn(),
    getRecord: vi.fn(),
    getStoredTask: vi.fn(),
    getTextTask: vi.fn(),
    cancelStoryTask: vi.fn(),
    transitionText: vi.fn(),
    getImageTask: vi.fn(),
    transitionImage: vi.fn(),
    getVideoTask: vi.fn(),
    transitionVideo: vi.fn(),
    getAudioTask: vi.fn(),
    transitionAudio: vi.fn(),
    cancelWorkflow: vi.fn(),
    workflowView: vi.fn(),
    recovery: vi.fn(),
    cancellationPatch: vi.fn(() => ({ executionPhase: "cancel_requested" })),
}));

vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ resolveDramaLabProjectForRequest: mocks.resolveProject, getDramaLabCollaborationForUser: mocks.getCollaboration }));
vi.mock("@/lib/server/drama-lab-story-generation-service", () => ({ cancelDramaLabStoryTask: mocks.cancelStoryTask }));
vi.mock("@/lib/server/drama-lab-workflow-task-service", () => ({ cancelDramaLabWorkflow: mocks.cancelWorkflow, dramaLabWorkflowTaskView: mocks.workflowView }));
vi.mock("@/lib/server/generation-task-cancellation-service", () => ({ cancellationExecutionPatch: mocks.cancellationPatch }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.recovery }));
vi.mock("@/lib/server/generation-task-store", () => ({
    listStoredGenerationTaskRecords: mocks.listRecords,
    listStoredDramaProjectTaskRecords: mocks.listProjectRecords,
    getStoredGenerationTaskRecord: mocks.getRecord,
    getStoredGenerationTask: mocks.getStoredTask,
}));
vi.mock("@/lib/server/text-task-store", () => ({ getTextTask: mocks.getTextTask, transitionTextTask: mocks.transitionText }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask, transitionImageTask: mocks.transitionImage }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask, transitionVideoTask: mocks.transitionVideo }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask, transitionAudioTask: mocks.transitionAudio }));

import { cancelDramaLabTask, listDramaLabTasksForProject, normalizeDramaLabTask, DramaLabTaskError } from "./drama-lab-task-service";
import type { StoredGenerationTaskRecord } from "./generation-task-types";

function record(overrides: Partial<StoredGenerationTaskRecord> = {}): StoredGenerationTaskRecord {
    return {
        id: "task-one",
        userId: "owner-one",
        type: "video",
        status: "running",
        payload: { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", title: "分镜视频" },
        surface: "drama",
        projectId: "project-one",
        episodeId: "episode-one",
        shotId: "shot-one",
        executionPhase: "polling",
        createdAt: 10,
        updatedAt: 20,
        expiresAt: Date.now() + 60_000,
        ...overrides,
    };
}

describe("drama lab task service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveProject.mockResolvedValue({ project: { id: "project-one", episodes: [] }, ownerUserId: "owner-one" });
        mocks.getCollaboration.mockResolvedValue({
            members: [
                { userId: "owner-one", status: "active" },
                { userId: "member-one", status: "active" },
            ],
        });
        mocks.listRecords.mockResolvedValue({ items: [] });
        mocks.listProjectRecords.mockResolvedValue([]);
        mocks.getRecord.mockResolvedValue(null);
    });

    it("filters by project and keeps episode/shot coordinates", async () => {
        mocks.listRecords.mockImplementation(async ({ userId }: { userId: string }) => ({ items: userId === "owner-one" ? [record()] : [record({ id: "foreign", projectId: "project-two", payload: { surface: "drama", projectId: "project-two" } })] }));
        const result = await listDramaLabTasksForProject({ userId: "member-one", projectId: "project-one", status: "all" });
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0]).toMatchObject({ id: "task-one", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", progress: null, canCancel: true });
        expect(result.activeCount).toBe(1);
    });

    it("does not expose a terminal task to cancel", async () => {
        mocks.getRecord.mockResolvedValue(record({ status: "success", executionPhase: "completed" }));
        await expect(cancelDramaLabTask({ userId: "member-one", projectId: "project-one", taskId: "task-one", origin: "http://localhost" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.transitionVideo).not.toHaveBeenCalled();
    });

    it("returns an already requested cancellation idempotently", async () => {
        mocks.getRecord.mockResolvedValue(record({ status: "cancelled", executionPhase: "cancel_polling" }));
        const result = await cancelDramaLabTask({ userId: "member-one", projectId: "project-one", taskId: "task-one", origin: "http://localhost" });
        expect(result).toMatchObject({ id: "task-one", status: "cancelled", canCancel: false });
        expect(mocks.transitionVideo).not.toHaveBeenCalled();
    });

    it("rejects a task whose durable context belongs to another project", async () => {
        mocks.getRecord.mockResolvedValue(record({ projectId: "project-two", payload: { surface: "drama", projectId: "project-two" } }));
        await expect(cancelDramaLabTask({ userId: "member-one", projectId: "project-one", taskId: "task-one", origin: "http://localhost" })).rejects.toMatchObject({ status: 404 });
    });

    it("keeps missing progress indeterminate", () => {
        expect(normalizeDramaLabTask(record({ payload: { surface: "drama", projectId: "project-one" } })).progress).toBeNull();
    });

    it("keeps a story task active while episode materialization is persisting", () => {
        const task = normalizeDramaLabTask(
            record({
                type: "text",
                status: "success",
                payload: {
                    surface: "drama",
                    projectId: "project-one",
                    storyBatch: { projectId: "project-one", status: "persisting", episodeCount: 3, persistedEpisodeIndexes: [0] },
                },
            }),
        );
        expect(task).toMatchObject({ status: "running", progress: 33, canCancel: true });
    });

    it("does not expose synthetic workflow children as project tasks", async () => {
        const parent = record({ type: "render", id: "workflow-parent", payload: { surface: "drama", projectId: "project-one", title: "workflow" } });
        const child = record({
            type: "render",
            id: "workflow-child",
            parentTaskId: "workflow-parent",
            payload: { surface: "drama", projectId: "project-one", parentTaskId: "workflow-parent", workflowChild: { id: "workflow-child", key: "assets:episode:prop", status: "running" } },
        });
        mocks.listRecords.mockImplementation(async ({ userId, type }: { userId: string; type: string }) => ({ items: userId === "owner-one" && type === "render" ? [parent, child] : [] }));
        const result = await listDramaLabTasksForProject({ userId: "member-one", projectId: "project-one", status: "all" });
        expect(result.tasks.map((task) => task.id)).toEqual(["workflow-parent"]);
    });

    it("does not treat a task awaiting review as active or cancellable", async () => {
        const review = record({ status: "running", executionPhase: "needs_review" });
        expect(normalizeDramaLabTask(review)).toMatchObject({ status: "running", canCancel: false });
        mocks.listRecords.mockImplementation(async ({ userId, type }: { userId: string; type: string }) => ({ items: userId === "owner-one" && type === "video" ? [review] : [] }));
        const result = await listDramaLabTasksForProject({ userId: "member-one", projectId: "project-one", status: "active" });
        expect(result.tasks).toHaveLength(0);
        expect(result.activeCount).toBe(0);
    });

    it("discovers legacy payload-only project tasks", async () => {
        mocks.listProjectRecords.mockResolvedValue([
            record({
                type: "text",
                status: "success",
                surface: undefined,
                projectId: undefined,
                episodeId: undefined,
                shotId: undefined,
                payload: {
                    surface: "drama",
                    storyBatch: { projectId: "project-one", sourceEpisodeId: "episode-one", status: "persisting", episodeCount: 1, persistedEpisodeIndexes: [] },
                },
            }),
        ]);
        const result = await listDramaLabTasksForProject({ userId: "member-one", projectId: "project-one", status: "active" });
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0]).toMatchObject({ status: "running", projectId: "project-one", episodeId: "episode-one" });
    });

    it("returns cancellation success when a concurrent request already won the CAS", async () => {
        const running = record();
        const cancelled = record({ status: "cancelled", executionPhase: "cancel_requested" });
        mocks.getRecord.mockResolvedValueOnce(running).mockResolvedValueOnce(cancelled);
        mocks.getVideoTask.mockResolvedValue({ id: running.id, userId: running.userId, status: "running", config: {} });
        mocks.transitionVideo.mockResolvedValue(null);
        const result = await cancelDramaLabTask({ userId: "member-one", projectId: "project-one", taskId: running.id, origin: "http://localhost" });
        expect(result).toMatchObject({ id: running.id, status: "cancelled", canCancel: false });
    });

    it("uses a stable task error type for malformed coordinates", async () => {
        await expect(listDramaLabTasksForProject({ userId: "member-one", projectId: "", status: "active" })).rejects.toBeInstanceOf(DramaLabTaskError);
    });
});
