import { describe, expect, it, vi } from "vitest";

import {
    DramaLabVideoBatchWaitError,
    classifyDramaLabVideoBatchObservation,
    isDramaLabVideoBatchObservationTerminal,
    summarizeDramaLabVideoBatch,
    waitForDramaLabVideoBatch,
    type DramaLabVideoBatchObservation,
    type DramaLabVideoBatchTarget,
} from "./drama-lab-video-batch";

describe("drama lab video batch terminal semantics", () => {
    const target = { shotId: "shot-one", taskId: "video-one" };

    it("keeps submitted and result-ready tasks pending until durable shot media exists", () => {
        expect(classify(target, { status: "running", executionPhase: "submitted" })).toBeNull();
        expect(classify(target, { status: "running", executionPhase: "result_ready", videoUrl: "https://provider.example.com/transient.mp4" })).toBeNull();
        expect(classify(target, { status: "running", executionPhase: "persisting" })).toBeNull();
        expect(classify(target, { status: "running", executionPhase: "cancel_requested" })).toBeNull();
        expect(classify(target, { status: "cancelled", executionPhase: "cancel_polling" })).toBeNull();
        expect(classify(target, { status: "success", executionPhase: "completed", videoUrl: "/api/reference-assets/video.mp4" })).toMatchObject({ outcome: "success" });
        expect(isDramaLabVideoBatchObservationTerminal(target, { ...target, status: "running", executionPhase: "result_ready" })).toBe(false);
        expect(isDramaLabVideoBatchObservationTerminal(target, { ...target, status: "success", executionPhase: "completed", videoUrl: "/api/reference-assets/video.mp4" })).toBe(true);
    });

    it("separates manual review, terminal failure, cancellation, and an invalid success", () => {
        expect(classify(target, { status: "running", executionPhase: "needs_review", error: "submission outcome unknown" })).toMatchObject({ outcome: "needs_review", error: "submission outcome unknown" });
        expect(classify(target, { status: "error", executionPhase: "completed", error: "provider rejected the shot" })).toMatchObject({ outcome: "failed", error: "provider rejected the shot" });
        expect(classify(target, { status: "cancelled", executionPhase: "completed" })).toMatchObject({ outcome: "cancelled" });
        expect(classify(target, { status: "cancelled", executionPhase: "needs_review", needsReview: true })).toMatchObject({ outcome: "cancelled" });
        expect(classify(target, { status: "success", executionPhase: "completed" })).toMatchObject({ outcome: "failed", error: expect.stringContaining("playable URL") });
    });

    it("waits for every child and reports one terminal batch summary", async () => {
        const targets = [target, { shotId: "shot-two", taskId: "video-two" }, { shotId: "shot-three", taskId: "video-three" }, { shotId: "shot-four", taskId: "video-four" }];
        const sequences: Record<string, Array<Omit<DramaLabVideoBatchObservation, "shotId" | "taskId">>> = {
            "video-one": [
                { status: "running", executionPhase: "submitted" },
                { status: "running", executionPhase: "result_ready" },
                { status: "success", executionPhase: "completed", videoUrl: "/api/reference-assets/video-one.mp4" },
            ],
            "video-two": [
                { status: "running", executionPhase: "polling" },
                { status: "error", executionPhase: "needs_review", needsReview: true, error: "manual review required" },
            ],
            "video-three": [{ status: "error", executionPhase: "completed", error: "provider failed" }],
            "video-four": [{ status: "cancelled", executionPhase: "completed", error: "cancelled by user" }],
        };
        const reads = new Map<string, number>();
        const read = vi.fn(async (item: DramaLabVideoBatchTarget) => {
            const index = reads.get(item.taskId) || 0;
            reads.set(item.taskId, index + 1);
            const state = sequences[item.taskId][Math.min(index, sequences[item.taskId].length - 1)];
            return { ...item, ...state };
        });
        const sleep = vi.fn(async () => undefined);
        const progress = vi.fn();

        const result = await waitForDramaLabVideoBatch({ targets, read, sleep, intervalMs: 0, onProgress: progress });

        expect(result).toMatchObject({
            totalCount: 4,
            terminalCount: 4,
            pendingCount: 0,
            successCount: 1,
            failedCount: 1,
            cancelledCount: 1,
            needsReviewCount: 1,
            allSucceeded: false,
        });
        expect(result.items.map((item) => [item.taskId, item.outcome])).toEqual([
            ["video-one", "success"],
            ["video-two", "needs_review"],
            ["video-three", "failed"],
            ["video-four", "cancelled"],
        ]);
        expect(read).toHaveBeenCalledTimes(7);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(progress).toHaveBeenCalledTimes(3);
        expect(progress.mock.calls[0][0]).toMatchObject({ terminalCount: 2, pendingCount: 2, submittedCount: 1 });
        expect(progress.mock.calls[1][0]).toMatchObject({ terminalCount: 3, pendingCount: 1, resultReadyCount: 1 });
    });

    it("aggregates a mixed pending and terminal snapshot without treating result_ready as complete", () => {
        const summary = summarizeDramaLabVideoBatch([
            { ...target, outcome: "success", status: "success", executionPhase: "completed", videoUrl: "/video-one.mp4" },
            { shotId: "shot-two", taskId: "video-two", outcome: "failed", status: "error", executionPhase: "completed", error: "provider failed" },
            { shotId: "shot-three", taskId: "video-three", outcome: "cancelled", status: "cancelled", executionPhase: "completed" },
            { shotId: "shot-four", taskId: "video-four", outcome: "needs_review", status: "running", executionPhase: "needs_review" },
            { shotId: "shot-five", taskId: "video-five", outcome: "pending", status: "running", executionPhase: "result_ready" },
        ]);

        expect(summary).toMatchObject({ totalCount: 5, terminalCount: 4, pendingCount: 1, successCount: 1, failedCount: 1, cancelledCount: 1, needsReviewCount: 1, resultReadyCount: 1, allSucceeded: false });
    });

    it("does not silently attach a replacement task to the running batch", async () => {
        const result = await waitForDramaLabVideoBatch({
            targets: [target],
            read: async () => ({ ...target, taskId: "video-replacement", status: "success", executionPhase: "completed", videoUrl: "/api/reference-assets/replacement.mp4" }),
        });

        expect(result).toMatchObject({ terminalCount: 1, successCount: 0, failedCount: 1 });
        expect(result.items[0]).toMatchObject({ taskId: "video-one", outcome: "failed", error: expect.stringContaining("no longer bound") });
    });

    it("stops tracking without fabricating a terminal result when the poll budget is exhausted", async () => {
        const waiting = waitForDramaLabVideoBatch({
            targets: [target],
            read: async () => ({ ...target, status: "running", executionPhase: "result_ready" }),
            maxPollRounds: 1,
        });

        const error = await waiting.catch((reason) => reason);
        expect(error).toBeInstanceOf(DramaLabVideoBatchWaitError);
        expect(error).toMatchObject({ reason: "poll_limit_reached", progress: { terminalCount: 0, pendingCount: 1, resultReadyCount: 1 } });
    });

    it("deduplicates an exact target and returns an empty summary without polling", async () => {
        const read = vi.fn();
        const duplicate = await waitForDramaLabVideoBatch({
            targets: [target, { ...target }],
            read: async (item) => ({ ...item, status: "success", executionPhase: "completed", videoUrl: "/api/reference-assets/video.mp4" }),
        });
        const empty = await waitForDramaLabVideoBatch({ targets: [], read });

        expect(duplicate.totalCount).toBe(1);
        expect(duplicate.successCount).toBe(1);
        expect(empty).toMatchObject({ totalCount: 0, terminalCount: 0, pendingCount: 0, allSucceeded: false });
        expect(read).not.toHaveBeenCalled();
    });

    it("keeps submission failures in the final batch accounting even without a task to poll", async () => {
        const read = vi.fn();
        const result = await waitForDramaLabVideoBatch({
            targets: [],
            initialFailures: [{ shotId: "shot-submit-failed", error: "provider rejected the request" }],
            read,
        });

        expect(result).toMatchObject({ totalCount: 1, terminalCount: 1, pendingCount: 0, failedCount: 1, allSucceeded: false });
        expect(result.items[0]).toMatchObject({ shotId: "shot-submit-failed", outcome: "failed", error: "provider rejected the request" });
        expect(read).not.toHaveBeenCalled();
    });

    it("converts an in-flight read abort into a partial domain error", async () => {
        const controller = new AbortController();
        const waiting = waitForDramaLabVideoBatch({
            targets: [target],
            signal: controller.signal,
            read: async () => {
                controller.abort();
                throw new DOMException("Aborted", "AbortError");
            },
        });

        const error = await waiting.catch((reason) => reason);
        expect(error).toBeInstanceOf(DramaLabVideoBatchWaitError);
        expect(error).toMatchObject({ reason: "aborted", progress: { totalCount: 1, pendingCount: 1 } });
    });
});

function classify(target: DramaLabVideoBatchTarget, state: Omit<DramaLabVideoBatchObservation, "shotId" | "taskId">) {
    return classifyDramaLabVideoBatchObservation(target, { ...target, ...state });
}
