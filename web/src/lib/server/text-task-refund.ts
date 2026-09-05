import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { generationModelId } from "@/lib/server/generation-channel";
import { getTextTask, updateTextTask, type TextTask } from "@/lib/server/text-task-store";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";

export async function refundTextTask(task: TextTask) {
    const billing = task.billing;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || (task.status !== "error" && task.status !== "cancelled") || !billing?.billingReceiptId || billing.refunded) return task;
    await refundGenerationCharge({ userId: task.userId, receiptId: billing.billingReceiptId, model: generationModelId(task.config), usageKind: "text", units: 1, idempotencyKey: textTaskRefundIdempotencyKey(task) });
    await updateTextTask(task.id, { billing: { ...billing, refunded: true } });
    return (await getTextTask(task.id)) || task;
}

export function textTaskRefundIdempotencyKey(task: Pick<TextTask, "id" | "attemptNo">) {
    return `text-task:${task.id}:attempt:${task.attemptNo || 1}:refund`;
}
