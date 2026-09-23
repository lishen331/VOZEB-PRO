import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, withPostgresTransaction } from "@/lib/server/database";
import { appendDiagnosticEvent, MEDIA_DIAGNOSTIC_RETENTION_MS, type MediaDiagnosticEvent } from "./media-task-diagnostics";

export type MediaDiagnosticContext = { type: "image" | "video"; taskId: string; userId: string; projectId?: string; channelId?: string; model?: string; surface?: string };

// Separate columns prevent task payload replacement from losing trace events.
export async function persistMediaDiagnostic(context: MediaDiagnosticContext, event: Record<string, unknown>) {
    if (context.surface !== "canvas" || process.env.CANVAS_MEDIA_DIAGNOSTICS === "0" || getDatabaseProvider() !== "postgres") return;
    try {
        await ensurePostgresSchema();
        await withPostgresTransaction(async (client) => {
            await client.query("SET LOCAL lock_timeout = '250ms'");
            await client.query("SET LOCAL statement_timeout = '1000ms'");
            const row = (
                await client.query<{ diagnostic_events: MediaDiagnosticEvent[]; status: string; updated_at?: string; diagnostic_expires_at?: string }>(
                    "SELECT diagnostic_events, status, updated_at, diagnostic_expires_at FROM generation_tasks WHERE id=$1 AND task_type=$2 AND user_id=$3 AND surface='canvas' AND expires_at>now() FOR UPDATE",
                    [context.taskId, context.type, context.userId],
                )
            ).rows[0];
            if (!row) return;
            const events = appendDiagnosticEvent(row.diagnostic_events || [], { ...context, ...event });
            if (JSON.stringify(events) === JSON.stringify(row.diagnostic_events || [])) return;
            const ttl = row.status === "success" ? 3 * 86400000 : MEDIA_DIAGNOSTIC_RETENTION_MS;
            await client.query("UPDATE generation_tasks SET diagnostic_events=$4::jsonb, diagnostic_expires_at=$5 WHERE id=$1 AND task_type=$2 AND user_id=$3", [
                context.taskId,
                context.type,
                context.userId,
                JSON.stringify(events),
                new Date(Math.min(Date.now() + ttl, row.diagnostic_expires_at ? new Date(row.diagnostic_expires_at).getTime() : Infinity, row.status === "success" && row.updated_at ? new Date(row.updated_at).getTime() + ttl : Infinity)),
            ]);
        });
    } catch {
        console.warn("Media diagnostic persistence unavailable", { taskId: context.taskId });
    }
}

/** Only the task owner may associate an internal proxy call with this trace. */
export async function resolveMediaDiagnosticContext(taskId: string, userId: string, channelId: string): Promise<MediaDiagnosticContext | undefined> {
    if (!taskId || taskId.length > 120 || process.env.CANVAS_MEDIA_DIAGNOSTICS === "0" || getDatabaseProvider() !== "postgres") return;
    try {
        await ensurePostgresSchema();
        const row = (
            await postgresQuery<{ task_type: "image" | "video"; project_id: string; model: string }>(
                "SELECT task_type, project_id, payload->'config'->>'model' AS model FROM generation_tasks WHERE id=$1 AND user_id=$2 AND surface='canvas' AND task_type IN ('image','video') AND payload->'config'->>'channelId'=$3 AND expires_at>now()",
                [taskId, userId, channelId],
            )
        ).rows[0];
        return row ? { type: row.task_type, taskId, userId, channelId, projectId: row.project_id, model: row.model, surface: "canvas" } : undefined;
    } catch {
        return;
    }
}

export async function cleanupMediaDiagnostics(limit: number) {
    if (getDatabaseProvider() !== "postgres") return;
    try {
        await ensurePostgresSchema();
        await postgresQuery(
            `WITH expired AS (SELECT id FROM generation_tasks WHERE diagnostic_expires_at<=now() ORDER BY diagnostic_expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)
            UPDATE generation_tasks SET diagnostic_events='[]'::jsonb, diagnostic_expires_at=NULL FROM expired WHERE generation_tasks.id=expired.id`,
            [Math.max(1, Math.min(500, limit))],
        );
    } catch {
        console.warn("Media diagnostic cleanup unavailable");
    }
}
