import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioTask } from "./audio-task-store";

const mocks = vi.hoisted(() => ({
    refundGenerationCharge: vi.fn(),
    getAudioTask: vi.fn(),
    transitionAudioTask: vi.fn(),
}));

vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge: mocks.refundGenerationCharge }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask, transitionAudioTask: mocks.transitionAudioTask }));
vi.mock("@/lib/server/generation-channel", () => ({ generationModelId: vi.fn(() => "voice") }));

import { refundAudioTask } from "./audio-task-refund";

const task = {
    id: "audio-one",
    userId: "user",
    status: "error",
    createdAt: 1,
    updatedAt: 1,
    config: { baseUrl: "https://api.example.com/v1", apiKey: "secret", apiFormat: "openai", model: "voice" },
    prompt: "test",
    billing: { pointsCost: 8, billingReceiptId: "school:batch-a", refunded: false },
} satisfies AudioTask;

describe("audio task refunds", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.refundGenerationCharge.mockResolvedValue({ refunded: true });
        mocks.transitionAudioTask.mockImplementation(async (_task, _statuses, patch) => ({ ...task, ...patch }));
        mocks.getAudioTask.mockResolvedValue({ ...task, billing: { ...task.billing, refunded: true } });
    });

    it("marks the task refunded only after the idempotent points refund succeeds", async () => {
        const result = await refundAudioTask(task);

        expect(mocks.refundGenerationCharge).toHaveBeenCalledWith({ userId: "user", receiptId: "school:batch-a", model: "voice", usageKind: "audio", units: 1, idempotencyKey: "audio-task:audio-one:refund" });
        expect(mocks.refundGenerationCharge.mock.invocationCallOrder[0]).toBeLessThan(mocks.transitionAudioTask.mock.invocationCallOrder[0]);
        expect(result.billing?.refunded).toBe(true);
    });

    it("keeps the task refundable when the points refund fails", async () => {
        mocks.refundGenerationCharge.mockRejectedValue(new Error("database unavailable"));

        await expect(refundAudioTask(task)).rejects.toThrow("database unavailable");
        expect(mocks.transitionAudioTask).not.toHaveBeenCalled();
    });
});
