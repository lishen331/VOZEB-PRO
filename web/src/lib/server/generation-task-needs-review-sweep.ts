import { getAuthSettings } from "@/lib/auth/store-settings-actions";
import { getDatabaseProvider, ensurePostgresSchema, postgresQuery } from "@/lib/server/database";
import { getAudioTask } from "@/lib/server/audio-task-store";
import { markAudioTaskFailed } from "@/lib/server/audio-task-runtime";
import { getImageTask } from "@/lib/server/image-task-store";
import { markImageTaskFailed } from "@/lib/server/image-task-runtime";
import { getTextTask } from "@/lib/server/text-task-store";
import { markTextTaskFailed } from "@/lib/server/text-task-runtime";
import { getVideoTask } from "@/lib/server/video-task-store";
import { failVideoTaskFromWorker } from "@/lib/server/video-task-runtime";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";

/** needs_review 任务超过这个时长仍无人工处理，才允许自动结案退款。2026-10-28 决策：全局阈值，不分任务类型。 */
export const NEEDS_REVIEW_AUTO_REFUND_GRACE_MS = 2 * 60 * 60_000;
const NEEDS_REVIEW_AUTO_REFUND_REASON = "超过人工确认时限（2小时），系统自动结案并退款";

type SweepableTaskType = "text" | "image" | "video" | "audio";

export type NeedsReviewSweepResult = { scanned: number; closed: number; skipped: number };

export async function sweepStaleNeedsReviewTasks(input: { now?: number } = {}): Promise<NeedsReviewSweepResult> {
    const settings = await getAuthSettings();
    if (!settings.generationCostControl.needsReviewAutoRefundEnabled) return { scanned: 0, closed: 0, skipped: 0 };
    if (getDatabaseProvider() !== "postgres") return { scanned: 0, closed: 0, skipped: 0 };

    const now = input.now ?? Date.now();
    const staleBefore = new Date(now - NEEDS_REVIEW_AUTO_REFUND_GRACE_MS);
    await ensurePostgresSchema();
    // expires_at > now() 必须过滤：过期行 getXTask 永远查不到，会原地卡死 LIMIT 窗口，
    // 让排在它们后面的真正可处理任务永远排不上号（2026-10-30 staging 实测 429 条过期行卡死整条队列）。
    const result = await postgresQuery<{ id: string; task_type: string }>(
        `SELECT id, task_type FROM generation_tasks
         WHERE execution_phase = 'needs_review' AND task_type IN ('text', 'image', 'video', 'audio') AND updated_at < $1 AND expires_at > now()
         ORDER BY updated_at ASC, id ASC
         LIMIT 200`,
        [staleBefore.toISOString()],
    );

    let closed = 0;
    let skipped = 0;
    for (const row of result.rows) {
        const type = row.task_type as SweepableTaskType;
        const handled = await closeStaleNeedsReviewTask(type, row.id);
        if (handled) closed += 1;
        else skipped += 1;
    }
    return { scanned: result.rows.length, closed, skipped };
}

/** 重新核实当前真实状态后才结案，防止和人工审核或并发的 worker 恢复流程打架。 */
async function closeStaleNeedsReviewTask(type: SweepableTaskType, id: string): Promise<boolean> {
    if (type === "text") {
        const task = await getTextTask(id);
        if (!task || (task.status !== "pending" && task.status !== "running") || task.executionPhase !== "needs_review") return false;
        await markTextTaskFailed(task, NEEDS_REVIEW_AUTO_REFUND_REASON);
        await closeNeedsReviewPhase("text", id);
        return true;
    }
    if (type === "image") {
        const task = await getImageTask(id);
        if (!task || (task.status !== "pending" && task.status !== "running") || task.executionPhase !== "needs_review") return false;
        await markImageTaskFailed(task, NEEDS_REVIEW_AUTO_REFUND_REASON);
        await closeNeedsReviewPhase("image", id);
        return true;
    }
    if (type === "audio") {
        const task = await getAudioTask(id);
        if (!task || (task.status !== "pending" && task.status !== "running") || task.executionPhase !== "needs_review") return false;
        await markAudioTaskFailed(task, NEEDS_REVIEW_AUTO_REFUND_REASON);
        await closeNeedsReviewPhase("audio", id);
        return true;
    }
    const task = await getVideoTask(id);
    if (!task || task.status !== "running" || task.executionPhase !== "needs_review") return false;
    await failVideoTaskFromWorker(task, NEEDS_REVIEW_AUTO_REFUND_REASON);
    await closeNeedsReviewPhase("video", id);
    return true;
}

/** mark*TaskFailed 只改 status，不动 execution_phase；照搬 confirm_failed 人工审核路径的收尾动作。 */
function closeNeedsReviewPhase(type: SweepableTaskType, id: string) {
    return scheduleGenerationTask(type, id, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "needs_review_auto_refunded" });
}
