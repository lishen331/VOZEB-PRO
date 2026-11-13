import { ensureAudioGenerationLog } from "@/lib/server/audio-task-runtime";
import { getAudioTask } from "@/lib/server/audio-task-store";
import { getGenerationLogForUser } from "@/lib/server/generation-log-store";
import { listStoredGenerationTaskRecords, type StoredGenerationTaskRecord } from "@/lib/server/generation-task-store";

/*
 * 一次性回填：画布 / Agent / 短剧的音频任务在修复前不写调用记录，
 * 这里按任务表找出「已结束但没有对应日志」的音频任务，补齐调用记录。
 *
 * - 只读任务表，不重建任务、不扣费、不碰上游。
 * - 幂等：复用 ensureAudioGenerationLog 里 `audio-task:<id>` 的存在性检查。
 * - 有界：分页扫描、按 limit 截断，不把整表读进 Node。
 */

const BACKFILL_PAGE_SIZE = 100;
const MAX_BACKFILL_LIMIT = 500;

export type AudioLogBackfillResult = {
    dryRun: boolean;
    limit: number;
    scanned: number;
    missing: number;
    written: number;
    failed: number;
    sample: Array<{ taskId: string; status: "success" | "error"; title: string }>;
};

export async function backfillAudioGenerationLogs(input: { dryRun?: boolean; limit?: number } = {}): Promise<AudioLogBackfillResult> {
    const limit = Math.min(MAX_BACKFILL_LIMIT, Math.max(1, Math.floor(Number(input.limit) || MAX_BACKFILL_LIMIT)));
    const dryRun = input.dryRun === true;
    const result: AudioLogBackfillResult = { dryRun, limit, scanned: 0, missing: 0, written: 0, failed: 0, sample: [] };

    for (const status of ["success", "error"] as const) {
        for await (const record of missingAudioTaskRecords(status, limit, result)) {
            result.missing += 1;
            if (result.sample.length < 10) result.sample.push({ taskId: record.id, status: record.status === "success" ? "success" : "error", title: String(record.payload.prompt || "").slice(0, 40) });
            if (dryRun) continue;
            const task = await getAudioTask(record.id);
            if (!task) {
                result.failed += 1;
                continue;
            }
            await ensureAudioGenerationLog(task, record.status === "success" ? "success" : "failed", task.error);
            // ensureAudioGenerationLog 内部吞掉写库异常，用一次回读确认真的写进去了。
            const written = await getGenerationLogForUser(record.userId, `audio-task:${record.id}`);
            if (written) result.written += 1;
            else result.failed += 1;
        }
    }
    return result;
}

/** 分页扫描某状态的音频任务，只产出「还没有 audio-task:<id> 日志」的那些，凑够 limit 就停。 */
async function* missingAudioTaskRecords(status: "success" | "error", limit: number, result: AudioLogBackfillResult): AsyncGenerator<StoredGenerationTaskRecord> {
    let found = 0;
    let page = 1;
    for (;;) {
        const listing = await listStoredGenerationTaskRecords({ type: "audio", status, page, pageSize: BACKFILL_PAGE_SIZE, includeAll: false });
        if (!listing.items.length) return;
        for (const record of listing.items) {
            result.scanned += 1;
            if (await getGenerationLogForUser(record.userId, `audio-task:${record.id}`)) continue;
            yield record;
            found += 1;
            if (found >= limit) return;
        }
        if (page * BACKFILL_PAGE_SIZE >= listing.total) return;
        page += 1;
    }
}
