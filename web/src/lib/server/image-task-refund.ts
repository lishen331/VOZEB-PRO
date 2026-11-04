import { getAuthSettings } from "@/lib/auth/store";
import { imageUnits } from "@/app/api/image-tasks/image-task-support";
import { generationModelId } from "@/lib/server/generation-channel";
import { getImageTask, updateImageTask, type ImageTask } from "@/lib/server/image-task-store";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";

export async function refundImageTask(task: ImageTask): Promise<ImageTask & { refundedPoints?: number }> {
    const billing = task.billing;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || (task.status !== "error" && task.status !== "cancelled") || !billing?.billingReceiptId || billing.refunded) return task;
    const settings = await getAuthSettings();
    const refund = await refundGenerationCharge({
        userId: task.userId,
        receiptId: billing.billingReceiptId,
        model: generationModelId(task.config),
        usageKind: "image",
        units: imageUnits(task.config, settings.generationPointMultipliers),
        idempotencyKey: imageTaskRefundIdempotencyKey(task),
    });
    await updateImageTask(task.id, { billing: { ...billing, refunded: true } });
    const settled = (await getImageTask(task.id)) || task;
    // 把实际退回的积分带出去，路由层要告诉用户「已退回多少」。
    return { ...settled, refundedPoints: refund?.refundedPoints };
}

export function imageTaskRefundIdempotencyKey(task: Pick<ImageTask, "id" | "attemptNo">) {
    return `image-task:${task.id}:attempt:${task.attemptNo || 1}:refund`;
}
