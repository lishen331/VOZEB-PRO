import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getSettings: vi.fn(),
    refund: vi.fn(),
    updateTask: vi.fn(),
}));

vi.mock("@/lib/auth/store", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth/store")>()),
    getAuthSettings: mocks.getSettings,
}));
vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge: mocks.refund }));
vi.mock("@/lib/server/image-task-store", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/image-task-store")>()),
    updateImageTask: mocks.updateTask,
}));

import { GenerationSubmissionSafeFailure, GenerationSubmissionUncertainError } from "@/lib/server/generation-submission-error";
import { parseChargedImageResponse, parseImageSubmissionJson } from "./image-task-support";

describe("image submission billing state", () => {
    const task = { id: "image-billing", userId: "user-one", attemptNo: 1, config: { model: "image-model", quality: "high" } } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getSettings.mockResolvedValue({ generationPointMultipliers: { imageQuality: { high: 2 } } });
        mocks.updateTask.mockResolvedValue(task);
        mocks.refund.mockResolvedValue(undefined);
    });

    it("persists a charge when a 2xx submission body is invalid", async () => {
        const response = new Response("not-json", { status: 200, headers: { "x-vozeb-pro-points-cost": "1.5", "x-vozeb-pro-billing-receipt-id": "receipt-invalid" } });

        await expect(parseImageSubmissionJson(task, response)).rejects.toBeInstanceOf(GenerationSubmissionUncertainError);
        expect(mocks.updateTask).toHaveBeenCalledWith("image-billing", { billing: { pointsCost: 1.5, billingReceiptId: "receipt-invalid", refunded: false } });
        expect(mocks.refund).not.toHaveBeenCalled();
    });

    it("keeps an uncertain structured result charged, but refunds a definitive parse failure", async () => {
        const uncertainResponse = Response.json({}, { headers: { "x-vozeb-pro-points-cost": "2", "x-vozeb-pro-billing-receipt-id": "receipt-uncertain" } });
        await expect(
            parseChargedImageResponse(task, uncertainResponse, async () => {
                throw new GenerationSubmissionUncertainError("missing task id");
            }),
        ).rejects.toBeInstanceOf(GenerationSubmissionUncertainError);
        expect(mocks.updateTask).toHaveBeenCalledWith("image-billing", { billing: { pointsCost: 2, billingReceiptId: "receipt-uncertain", refunded: false } });
        expect(mocks.refund).not.toHaveBeenCalled();

        mocks.updateTask.mockClear();
        const failedResponse = Response.json({}, { headers: { "x-vozeb-pro-points-cost": "3", "x-vozeb-pro-billing-receipt-id": "receipt-failed" } });
        await expect(
            parseChargedImageResponse(task, failedResponse, async () => {
                throw new GenerationSubmissionSafeFailure("provider rejected");
            }),
        ).rejects.toBeInstanceOf(GenerationSubmissionSafeFailure);
        expect(mocks.refund).toHaveBeenCalledWith({
            userId: "user-one",
            receiptId: "receipt-failed",
            model: "image-model",
            usageKind: "image",
            units: 2,
            idempotencyKey: "image-task:image-billing:attempt:1:response-refund",
        });
    });
});
