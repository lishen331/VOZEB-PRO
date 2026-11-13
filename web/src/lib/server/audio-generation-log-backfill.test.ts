import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listRecords: vi.fn(),
    getLog: vi.fn(),
    getTask: vi.fn(),
    ensureLog: vi.fn(),
}));

vi.mock("@/lib/server/generation-task-store", () => ({ listStoredGenerationTaskRecords: mocks.listRecords }));
vi.mock("@/lib/server/generation-log-store", () => ({ getGenerationLogForUser: mocks.getLog }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getTask }));
vi.mock("@/lib/server/audio-task-runtime", () => ({ ensureAudioGenerationLog: mocks.ensureLog }));

import { backfillAudioGenerationLogs } from "./audio-generation-log-backfill";

function record(id: string, status: "success" | "error") {
    return { id, userId: "user-one", type: "audio", status, payload: { prompt: `prompt ${id}` } };
}

function listing(items: unknown[]) {
    return { items, total: items.length, page: 1, pageSize: 100, all: [], summary: null };
}

describe("audio generation log backfill", () => {
    it("only reports tasks that have no audio-task log in dry-run", async () => {
        mocks.listRecords.mockResolvedValueOnce(listing([record("t1", "success"), record("t2", "success")])).mockResolvedValueOnce(listing([]));
        mocks.getLog.mockImplementation(async (_userId: string, id: string) => (id === "audio-task:t2" ? { id } : null));

        const result = await backfillAudioGenerationLogs({ dryRun: true });

        expect(result).toMatchObject({ dryRun: true, missing: 1, written: 0 });
        expect(result.sample).toEqual([{ taskId: "t1", status: "success", title: "prompt t1" }]);
        expect(mocks.ensureLog).not.toHaveBeenCalled();
    });

    it("writes the missing log and confirms it by reading back", async () => {
        mocks.listRecords.mockResolvedValueOnce(listing([record("t1", "success")])).mockResolvedValueOnce(listing([]));
        mocks.getTask.mockResolvedValue({ id: "t1", userId: "user-one", prompt: "prompt t1", error: undefined, status: "success" });
        mocks.getLog.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "audio-task:t1" });

        const result = await backfillAudioGenerationLogs({ dryRun: false });

        expect(mocks.ensureLog).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), "success", undefined);
        expect(result).toMatchObject({ missing: 1, written: 1, failed: 0 });
    });

    it("picks up tasks whose log source is still unknown so it can be rewritten", async () => {
        mocks.listRecords.mockResolvedValueOnce(listing([record("t1", "success"), record("t2", "success")])).mockResolvedValueOnce(listing([]));
        mocks.getLog.mockImplementation(async (_userId: string, id: string) => (id === "audio-task:t1" ? { id, source: "unknown" } : { id, source: "canvas" }));

        const result = await backfillAudioGenerationLogs({ dryRun: true });

        expect(result.missing).toBe(1);
        expect(result.sample[0]?.taskId).toBe("t1");
    });

    it("counts a write as failed when the log still cannot be read back", async () => {
        mocks.listRecords.mockResolvedValueOnce(listing([])).mockResolvedValueOnce(listing([record("t9", "error")]));
        mocks.getTask.mockResolvedValue({ id: "t9", userId: "user-one", prompt: "prompt t9", error: "上游超时", status: "error" });
        mocks.getLog.mockResolvedValue(null);

        const result = await backfillAudioGenerationLogs({ dryRun: false });

        expect(mocks.ensureLog).toHaveBeenCalledWith(expect.objectContaining({ id: "t9" }), "failed", "上游超时");
        expect(result).toMatchObject({ missing: 1, written: 0, failed: 1 });
    });
});
