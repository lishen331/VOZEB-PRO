import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    getDatabaseProvider: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    postgresQuery: vi.fn(),
    getTextTask: vi.fn(),
    markTextTaskFailed: vi.fn(),
    getImageTask: vi.fn(),
    markImageTaskFailed: vi.fn(),
    getAudioTask: vi.fn(),
    markAudioTaskFailed: vi.fn(),
    getVideoTask: vi.fn(),
    failVideoTaskFromWorker: vi.fn(),
    scheduleGenerationTask: vi.fn(),
}));

vi.mock("@/lib/auth/store-settings-actions", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/database", () => ({
    getDatabaseProvider: mocks.getDatabaseProvider,
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    postgresQuery: mocks.postgresQuery,
}));
vi.mock("@/lib/server/text-task-store", () => ({ getTextTask: mocks.getTextTask }));
vi.mock("@/lib/server/text-task-runtime", () => ({ markTextTaskFailed: mocks.markTextTaskFailed }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask }));
vi.mock("@/lib/server/image-task-runtime", () => ({ markImageTaskFailed: mocks.markImageTaskFailed }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask }));
vi.mock("@/lib/server/audio-task-runtime", () => ({ markAudioTaskFailed: mocks.markAudioTaskFailed }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/video-task-runtime", () => ({ failVideoTaskFromWorker: mocks.failVideoTaskFromWorker }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.scheduleGenerationTask }));

import { sweepStaleNeedsReviewTasks } from "./generation-task-needs-review-sweep";

function settings(needsReviewAutoRefundEnabled: boolean) {
    return { generationCostControl: { needsReviewAutoRefundEnabled } };
}

describe("sweepStaleNeedsReviewTasks", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.postgresQuery.mockResolvedValue({ rows: [] });
    });

    it("does nothing when the backend toggle is off", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(false));

        const result = await sweepStaleNeedsReviewTasks();

        expect(result).toEqual({ scanned: 0, closed: 0, skipped: 0 });
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("does nothing on the file-backed storage mode", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(true));
        mocks.getDatabaseProvider.mockReturnValue("file");

        const result = await sweepStaleNeedsReviewTasks();

        expect(result).toEqual({ scanned: 0, closed: 0, skipped: 0 });
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("queries only needs_review tasks older than the 2-hour grace window", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(true));

        await sweepStaleNeedsReviewTasks({ now: 10_000_000 });

        const [sql, params] = mocks.postgresQuery.mock.calls[0];
        expect(sql).toContain("execution_phase = 'needs_review'");
        expect(sql).toContain("task_type IN ('text', 'image', 'video', 'audio')");
        expect(params[0]).toBe(new Date(10_000_000 - 2 * 60 * 60_000).toISOString());
    });

    it("closes a stale image task: marks it failed and moves execution_phase to completed", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(true));
        mocks.postgresQuery.mockResolvedValue({ rows: [{ id: "image-one", task_type: "image" }] });
        mocks.getImageTask.mockResolvedValue({ id: "image-one", status: "running", executionPhase: "needs_review" });

        const result = await sweepStaleNeedsReviewTasks();

        expect(mocks.markImageTaskFailed).toHaveBeenCalledWith({ id: "image-one", status: "running", executionPhase: "needs_review" }, expect.stringContaining("2小时"));
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("image", "image-one", { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "needs_review_auto_refunded" });
        expect(result).toEqual({ scanned: 1, closed: 1, skipped: 0 });
    });

    it("closes a stale text, audio, and video task the same way", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(true));
        mocks.postgresQuery.mockResolvedValue({
            rows: [
                { id: "text-one", task_type: "text" },
                { id: "audio-one", task_type: "audio" },
                { id: "video-one", task_type: "video" },
            ],
        });
        mocks.getTextTask.mockResolvedValue({ id: "text-one", status: "pending", executionPhase: "needs_review" });
        mocks.getAudioTask.mockResolvedValue({ id: "audio-one", status: "running", executionPhase: "needs_review" });
        mocks.getVideoTask.mockResolvedValue({ id: "video-one", status: "running", executionPhase: "needs_review" });

        const result = await sweepStaleNeedsReviewTasks();

        expect(mocks.markTextTaskFailed).toHaveBeenCalledTimes(1);
        expect(mocks.markAudioTaskFailed).toHaveBeenCalledTimes(1);
        expect(mocks.failVideoTaskFromWorker).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ scanned: 3, closed: 3, skipped: 0 });
    });

    it("skips a task that was already resolved by manual review before the sweep ran", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(true));
        mocks.postgresQuery.mockResolvedValue({ rows: [{ id: "image-one", task_type: "image" }] });
        mocks.getImageTask.mockResolvedValue({ id: "image-one", status: "success", executionPhase: "completed" });

        const result = await sweepStaleNeedsReviewTasks();

        expect(mocks.markImageTaskFailed).not.toHaveBeenCalled();
        expect(mocks.scheduleGenerationTask).not.toHaveBeenCalled();
        expect(result).toEqual({ scanned: 1, closed: 0, skipped: 1 });
    });

    it("skips a task that disappeared (expired) between the scan and the close attempt", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings(true));
        mocks.postgresQuery.mockResolvedValue({ rows: [{ id: "video-one", task_type: "video" }] });
        mocks.getVideoTask.mockResolvedValue(null);

        const result = await sweepStaleNeedsReviewTasks();

        expect(mocks.failVideoTaskFromWorker).not.toHaveBeenCalled();
        expect(result).toEqual({ scanned: 1, closed: 0, skipped: 1 });
    });
});
