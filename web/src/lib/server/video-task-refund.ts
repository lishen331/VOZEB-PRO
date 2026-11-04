import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { generationModelId } from "@/lib/server/generation-channel";
import { getVideoTask, updateVideoTask, type VideoTask } from "@/lib/server/video-task-store";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";

export async function refundVideoTask(task: VideoTask): Promise<VideoTask & { refundedPoints?: number }> {
    const upstream = task.upstream;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || (task.status !== "error" && task.status !== "cancelled") || upstream.pointsCost === undefined || !upstream.billingReceiptId || upstream.refunded) return task;
    const refund = await refundGenerationCharge({ userId: task.userId, receiptId: upstream.billingReceiptId, model: generationModelId(task.config), usageKind: "video", units: upstream.pointsUnits || 1, idempotencyKey: `video-task:${task.id}:refund` });
    await updateVideoTask(task.id, { upstream: { ...upstream, refunded: true } });
    const settled = (await getVideoTask(task.id)) || task;
    // 把实际退回的积分带出去，路由层要告诉用户「已退回多少」。
    return { ...settled, refundedPoints: refund?.refundedPoints };
}
