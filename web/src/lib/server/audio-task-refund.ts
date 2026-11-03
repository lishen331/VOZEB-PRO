import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { getAudioTask, transitionAudioTask, type AudioTask } from "@/lib/server/audio-task-store";
import { generationModelId } from "@/lib/server/generation-channel";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";

export async function refundAudioTask(task: AudioTask): Promise<AudioTask & { refundedPoints?: number }> {
    const billing = task.billing;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || (task.status !== "error" && task.status !== "cancelled") || !billing?.billingReceiptId || billing.refunded) return task;

    const refund = await refundGenerationCharge({ userId: task.userId, receiptId: billing.billingReceiptId, model: generationModelId(task.config), usageKind: "audio", units: 1, idempotencyKey: audioTaskRefundIdempotencyKey(task) });
    await transitionAudioTask(task, [task.status], {
        status: task.status,
        billing: { ...billing, refunded: true },
    });
    const settled = (await getAudioTask(task.id)) || task;
    // 把实际退回的积分带出去，路由层要告诉用户「已退回多少」。
    return { ...settled, refundedPoints: refund?.refundedPoints };
}

export function audioTaskRefundIdempotencyKey(task: Pick<AudioTask, "id" | "attemptNo">) {
    return task.attemptNo === undefined ? `audio-task:${task.id}:refund` : `audio-task:${task.id}:attempt:${task.attemptNo}:refund`;
}
