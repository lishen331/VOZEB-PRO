import { getDatabaseProvider, postgresQuery, withPostgresTransaction, type QueryExecutor } from "@/lib/server/database";

export const PRACTICE_CLEANUP_TABLES = [
    "canvas_projects",
    "drama_projects",
    "practice_sessions",
    "practice_copy_requests",
    "practice_script_projects",
    "practice_script_versions",
    "practice_script_entities",
    "practice_script_stages",
    "practice_script_agent_operations",
    "generation_tasks",
    "generation_webhook_events",
    "generation_log_assets",
    "generation_logs",
    "creative_assets",
    "creative_messages",
    "creative_conversations",
    "ip_usage_records",
] as const;

export type PracticeCleanupReport = {
    executed: boolean;
    statements: number;
    mediaCandidates: string[];
};

/**
 * Returns the ordered, bounded cleanup statements for practice-only data.
 * The statements intentionally do not delete local_media_assets: media is
 * reference-counted and is removed only after a separate cross-domain scan.
 */
export function buildPracticeCleanupStatements() {
    return [
        `CREATE TEMP TABLE practice_cleanup_canvas ON COMMIT DROP AS
         SELECT id FROM canvas_projects WHERE execution_profile = 'open-source-practice'`,
        `CREATE TEMP TABLE practice_cleanup_drama ON COMMIT DROP AS
         SELECT id FROM drama_projects WHERE execution_profile = 'open-source-practice'`,
        `CREATE TEMP TABLE practice_cleanup_tasks ON COMMIT DROP AS
         SELECT id FROM generation_tasks WHERE execution_profile = 'open-source-practice'`,
        `CREATE TEMP TABLE practice_cleanup_logs ON COMMIT DROP AS
         SELECT id FROM generation_logs
         WHERE source = 'practice' OR task_id IN (SELECT id FROM practice_cleanup_tasks)`,
        `CREATE TEMP TABLE practice_cleanup_conversations ON COMMIT DROP AS
         SELECT id FROM creative_conversations
         WHERE project_id IN (SELECT id FROM practice_cleanup_canvas)
            OR project_id IN (SELECT id FROM practice_cleanup_drama)
            OR source = 'canvas' AND project_id IN (SELECT id FROM practice_cleanup_canvas)
            OR source = 'drama' AND project_id IN (SELECT id FROM practice_cleanup_drama)`,
        `CREATE TEMP TABLE practice_cleanup_scripts ON COMMIT DROP AS
         SELECT id FROM practice_script_projects`,
        `DELETE FROM generation_webhook_events
         WHERE task_id IN (SELECT id FROM practice_cleanup_tasks)`,
        `DELETE FROM generation_log_assets
         WHERE generation_log_id IN (SELECT id FROM practice_cleanup_logs)`,
        `DELETE FROM generation_logs
         WHERE id IN (SELECT id FROM practice_cleanup_logs)`,
        `DELETE FROM generation_tasks
         WHERE id IN (SELECT id FROM practice_cleanup_tasks)`,
        `DELETE FROM creative_assets
         WHERE conversation_id IN (SELECT id FROM practice_cleanup_conversations)`,
        `DELETE FROM creative_messages
         WHERE conversation_id IN (SELECT id FROM practice_cleanup_conversations)`,
        `DELETE FROM creative_conversations
         WHERE id IN (SELECT id FROM practice_cleanup_conversations)`,
        `DELETE FROM practice_sessions`,
        `DELETE FROM practice_copy_requests`,
        `DELETE FROM practice_script_agent_operations
         WHERE project_id IN (SELECT id FROM practice_cleanup_scripts)`,
        `DELETE FROM practice_script_stages
         WHERE project_id IN (SELECT id FROM practice_cleanup_scripts)`,
        `DELETE FROM practice_script_entities
         WHERE project_id IN (SELECT id FROM practice_cleanup_scripts)`,
        `DELETE FROM practice_script_versions
         WHERE project_id IN (SELECT id FROM practice_cleanup_scripts)`,
        `DELETE FROM practice_script_projects
         WHERE id IN (SELECT id FROM practice_cleanup_scripts)`,
        `DELETE FROM ip_usage_records
         WHERE target_type = 'practice'`,
        `DELETE FROM canvas_projects
         WHERE id IN (SELECT id FROM practice_cleanup_canvas)`,
        `DELETE FROM drama_projects
         WHERE id IN (SELECT id FROM practice_cleanup_drama)`,
    ] as const;
}

export async function cleanupPracticePostgresData(executor?: QueryExecutor): Promise<PracticeCleanupReport> {
    if (getDatabaseProvider() !== "postgres") return { executed: false, statements: 0, mediaCandidates: [] };
    const run = async (client: QueryExecutor) => {
        const statements = buildPracticeCleanupStatements();
        for (const statement of statements) await client.query(statement);
        return { executed: true, statements: statements.length, mediaCandidates: [] };
    };
    return executor ? run(executor) : withPostgresTransaction(run);
}

export async function listPracticeMediaCandidates() {
    if (getDatabaseProvider() !== "postgres") return [];
    const result = await postgresQuery<{ storage_key: string }>(
        `SELECT storage_key
         FROM local_media_assets
         WHERE source IN ('practice', 'image-task', 'video-task', 'audio-task')
            OR task_id IN (SELECT id FROM generation_tasks WHERE execution_profile = 'open-source-practice')
            OR project_id IN (
                SELECT id FROM canvas_projects WHERE execution_profile = 'open-source-practice'
                UNION ALL
                SELECT id FROM drama_projects WHERE execution_profile = 'open-source-practice'
            )`,
    );
    return result.rows.map((row) => row.storage_key).filter(Boolean);
}
