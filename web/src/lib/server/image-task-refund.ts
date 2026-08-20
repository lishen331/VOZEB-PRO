import { getAuthSettings } from "@/lib/auth/store";
import { imageUnits } from "@/app/api/image-tasks/image-task-support";
import { generationModelId } from "@/lib/server/generation-channel";
import { getImageTask, updateImageTask, type ImageTask } from "@/lib/server/image-task-store";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";

export async function refundImageTask(task: ImageTask) {
    const billing = task.billing;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || (task.status !== "error" && task.status !== "cancelled") || !billing?.billingReceiptId || billing.refunded) return task;
    const settings = await getAuthSettings();
    await refundGenerationCharge({
        userId: task.userId,
        receiptId: billing.billingReceiptId,
        model: generationModelId(task.config),
        usageKind: "image",
        units: imageUnits(task.config.quality, settings.generationPointMultipliers.imageQuality),
        idempotencyKey: imageTaskRefundIdempotencyKey(task),
    });
    await updateImageTask(task.id, { billing: { ...billing, refunded: true } });
    return (await getImageTask(task.id)) || task;
}

export function imageTaskRefundIdempotencyKey(task: Pick<ImageTask, "id" | "attemptNo">) {
    return `image-task:${task.id}:attempt:${task.attemptNo || 1}:refund`;
}
