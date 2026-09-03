import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAudioTask: vi.fn(),
    transitionAudioTask: vi.fn(),
    refundAudioTask: vi.fn(),
    recover: vi.fn(),
    getStoredGenerationTaskRecord: vi.fn(),
    scheduleGenerationTask: vi.fn(),
    recoverGenerationTaskFromUpstream: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask, transitionAudioTask: mocks.transitionAudioTask }));
vi.mock("@/lib/server/audio-task-refund", () => ({ refundAudioTask: mocks.refundAudioTask }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: vi.fn(), resolveInternalOrigin: vi.fn(() => "http://localhost") }));
vi.mock("@/lib/server/generation-channel", () => ({ generationModelId: vi.fn(() => "voice") }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.recover }));
vi.mock("@/lib/server/generation-task-store", () => ({ getStoredGenerationTaskRecord: mocks.getStoredGenerationTaskRecord }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.scheduleGenerationTask }));
vi.mock("@/lib/server/generation-task-user-recovery", () => ({ recoverGenerationTaskFromUpstream: mocks.recoverGenerationTaskFromUpstream }));

import { after } from "next/server";
import { GET, PATCH, POST } from "./route";

const task = {
    id: "audio-one",
    userId: "user",
    status: "running",
    config: { baseUrl: "https://api.example.com/v1", apiKey: "secret", apiFormat: "openai", model: "voice" },
    billing: { pointsCost: 8, billingReceiptId: "school:one", refunded: false },
};

describe("audio task cancellation refund", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user", pointsBalance: 100 });
        mocks.getAudioTask.mockResolvedValue(task);
        mocks.transitionAudioTask.mockImplementation(async (_task, _statuses, patch) => ({ ...task, ...patch }));
        mocks.refundAudioTask.mockImplementation(async (value) => ({ ...value, billing: { ...value.billing, refunded: true } }));
        mocks.getStoredGenerationTaskRecord.mockResolvedValue(undefined);
        mocks.scheduleGenerationTask.mockResolvedValue({ id: task.id });
        mocks.recoverGenerationTaskFromUpstream.mockResolvedValue(true);
    });

    it("schedules recovery for a running task", async () => {
        const response = await GET(new Request("http://localhost/api/audio-tasks/audio-one"), { params: Promise.resolve({ id: "audio-one" }) });

        expect(response.status).toBe(200);
        expect(after).toHaveBeenCalledWith(expect.any(Function));
    });

    it("returns the manual review reason without waking the task", async () => {
        mocks.getAudioTask.mockResolvedValue({ ...task, executionPhase: "needs_review", reviewReason: "音频提交结果无法确认" });

        const response = await GET(new Request("http://localhost/api/audio-tasks/audio-one"), { params: Promise.resolve({ id: "audio-one" }) });

        expect(after).not.toHaveBeenCalled();
        expect((await response.json()).task).toMatchObject({ needsReview: true, reviewReason: "音频提交结果无法确认" });
    });

    it("keeps billing refundable while cancellation awaits an upstream terminal state", async () => {
        const response = await PATCH(new Request("http://localhost/api/audio-tasks/audio-one", { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }), { params: Promise.resolve({ id: "audio-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.transitionAudioTask).toHaveBeenCalledWith(
            task,
            ["pending", "running"],
            expect.objectContaining({ status: "cancelled", billing: { pointsCost: 8, billingReceiptId: "school:one", refunded: false } }),
            expect.objectContaining({ executionPhase: "cancel_requested" }),
        );
        expect(mocks.refundAudioTask).not.toHaveBeenCalled();
        expect((await response.json()).task.billing.refunded).toBe(false);
    });

    it("wakes a pending task through its existing scheduler row without resubmitting", async () => {
        const pending = { ...task, status: "pending" as const, executionPhase: "created" as const };
        mocks.getAudioTask.mockResolvedValueOnce(pending).mockResolvedValueOnce({ ...pending, status: "running" as const });
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: "created", nextPollAt: 1 });

        const response = await POST(new Request("http://localhost/api/audio-tasks/audio-one", { method: "POST", body: JSON.stringify({ action: "recover" }) }), { params: Promise.resolve({ id: "audio-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("audio", "audio-one", expect.objectContaining({ nextPollAt: expect.any(Number), lastUpstreamStatus: "user_recovery_requested" }));
        expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ taskIds: ["audio-one"], userRequested: true }));
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });

    it("does not resubmit an audio task interrupted during submission", async () => {
        mocks.getAudioTask.mockResolvedValue({ ...task, executionPhase: "submitting" as const });
        mocks.getStoredGenerationTaskRecord.mockResolvedValue({ executionPhase: "submitting" });

        const response = await POST(new Request("http://localhost/api/audio-tasks/audio-one", { method: "POST", body: JSON.stringify({ action: "recover" }) }), { params: Promise.resolve({ id: "audio-one" }) });

        expect(response.status).toBe(409);
        expect(mocks.scheduleGenerationTask).not.toHaveBeenCalled();
        expect(mocks.recoverGenerationTaskFromUpstream).not.toHaveBeenCalled();
    });
});
