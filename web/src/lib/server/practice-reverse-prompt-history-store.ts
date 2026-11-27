import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, withPostgresTransaction } from "@/lib/server/database";
import type { ReversePromptHistoryRecord } from "@/lib/practice-reverse-prompt-history";

export const reversePromptHistoryEnabled = () => getDatabaseProvider() === "postgres";
type Scope = { userId: string; schoolId: string };
type HistoryRow = {
    id: string;
    created_at: Date;
    updated_at: Date;
    source_key: string | null;
    analysis_mode: string;
    extra_requirement: string;
    analysis_text: string;
    trial_status: ReversePromptHistoryRecord["trialStatus"] | null;
    success_id: string | null;
    success_prompt: string | null;
    success_asset_key: string | null;
    success_asset_scope: string | null;
    success_width: number | null;
    success_height: number | null;
    success_bytes: string | null;
    success_mime: string | null;
};
const pageSize = 20;
const fields = `h.id, h.created_at, h.updated_at, original.storage_key AS source_key, h.analysis_mode, h.extra_requirement, h.analysis_text,
    h.trial_status, h.success_id, h.success_prompt, image.storage_key AS success_asset_key, h.success_asset_scope, h.success_width, h.success_height,
    image.bytes::text AS success_bytes, image.mime_type AS success_mime`;
const readFrom = `FROM practice_reverse_prompt_history h
    LEFT JOIN local_media_assets original ON original.storage_key = h.source_key AND original.owner_user_id = h.user_id AND original.type = 'image' AND original.scope = 'reference' AND original.storage_class = 'permanent'
    LEFT JOIN local_media_assets image ON image.storage_key = h.success_asset_key AND image.owner_user_id = h.user_id AND image.type = 'image' AND image.scope = h.success_asset_scope AND image.storage_class = 'permanent'
    WHERE h.user_id = $1 AND h.school_id = $2 AND h.analysis_text IS NOT NULL`;

function assetUrl(kind: string, key: string) {
    return `/api/${kind}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function publicReversePromptHistory(row: HistoryRow): ReversePromptHistoryRecord {
    const { success_id: taskId, success_prompt: prompt, success_asset_key: storageKey } = row;
    const url = storageKey && assetUrl(row.success_asset_scope === "generation" ? "generation-log-assets" : "reference-assets", storageKey);
    return {
        id: row.id,
        createdAt: row.created_at.getTime(),
        updatedAt: row.updated_at.getTime(),
        ...(row.source_key && { sourceUrl: assetUrl("reference-assets", row.source_key) }),
        analysisMode: row.analysis_mode,
        extraRequirement: row.extra_requirement,
        analysisText: row.analysis_text,
        trialStatus: row.trial_status || undefined,
        ...(taskId &&
            prompt &&
            storageKey &&
            url && { trial: { taskId, prompt, image: { url, storageKey, width: row.success_width || 0, height: row.success_height || 0, bytes: Number(row.success_bytes) || 0, mimeType: row.success_mime || "image/png" } } }),
    };
}

export function readReversePromptHistoryCursor(value: string) {
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z):([\w-]{1,160})$/.exec(value);
    return match && Number.isFinite(Date.parse(match[1])) ? { at: match[1], id: match[2] } : null;
}

export async function listReversePromptHistory(scope: Scope, cursor: ReturnType<typeof readReversePromptHistoryCursor>) {
    if (!reversePromptHistoryEnabled()) return { records: [] };
    await ensurePostgresSchema();
    const { rows } = await postgresQuery<HistoryRow & { cursor_at: string }>(
        `SELECT ${fields}, to_char(h.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at ${readFrom}
         AND ($3::timestamptz IS NULL OR (h.updated_at, h.id) < ($3::timestamptz, $4::text))
         ORDER BY h.updated_at DESC, h.id DESC LIMIT $5`,
        [scope.userId, scope.schoolId, cursor?.at || null, cursor?.id || null, pageSize + 1],
    );
    const last = rows[pageSize - 1];
    return { records: rows.slice(0, pageSize).map(publicReversePromptHistory), nextCursor: rows.length > pageSize ? `${last.cursor_at}:${last.id}` : undefined };
}

export async function getReversePromptHistory(scope: Scope, id: string) {
    if (!reversePromptHistoryEnabled()) return null;
    await ensurePostgresSchema();
    const { rows } = await postgresQuery<HistoryRow>(`SELECT ${fields} ${readFrom} AND h.id = $3`, [scope.userId, scope.schoolId, id]);
    return rows[0] ? publicReversePromptHistory(rows[0]) : null;
}

export async function attachReversePromptHistory(scope: Scope, taskId: string, data: { sourceKey: string; mode: string; extraRequirement: string } | { historyId: string }) {
    if (!reversePromptHistoryEnabled()) return;
    await ensurePostgresSchema();
    await withPostgresTransaction(async (client) => {
        const trial = "historyId" in data;
        // Serialize attachment against the worker's terminal write (task lock first in both paths).
        const args = [taskId, scope.userId, scope.schoolId, trial ? "image" : "text"];
        const ownedTask = `id = $1 AND user_id = $2 AND school_id = $3 AND task_type = $4 AND execution_profile = 'open-source-practice'`;
        if (!(await client.query(`SELECT id FROM generation_tasks WHERE ${ownedTask} FOR UPDATE`, args)).rows[0]) throw new Error("练习任务无法关联历史");
        if (trial) {
            await client.query(
                `UPDATE practice_reverse_prompt_history h SET trial_id = t.id, trial_at = t.created_at, trial_status = 'pending', trial_prompt = t.payload->>'prompt', updated_at = GREATEST(h.updated_at, t.created_at)
                 FROM generation_tasks t WHERE t.id = $1 AND h.user_id = $2 AND h.school_id = $3 AND h.id = $4 AND h.analysis_text IS NOT NULL
                 AND (h.trial_id IS NULL OR (h.trial_at, h.trial_id) < (t.created_at, t.id))`,
                [taskId, scope.userId, scope.schoolId, data.historyId],
            );
        } else {
            await client.query(
                `INSERT INTO practice_reverse_prompt_history (id, user_id, school_id, created_at, updated_at, source_key, analysis_mode, extra_requirement)
                 SELECT t.id, t.user_id, t.school_id, t.created_at, t.created_at, $2, $3, $4 FROM generation_tasks t WHERE t.id = $1
                 ON CONFLICT (id) DO NOTHING`,
                [taskId, data.sourceKey, data.mode, data.extraRequirement],
            );
        }
        // If completion preceded attachment, replay its status through the same idempotent trigger.
        await client.query(`UPDATE generation_tasks SET status = status WHERE ${ownedTask} AND status IN ('success','error','cancelled')`, args);
    });
}
