import type { JsonValue } from "./repository-types";
import type { QueryExecutor } from "./postgres";
import type { PracticeTenantScope } from "../practice-tenant-scope";
import type { ScriptAgentKey, ScriptRunEventType, ScriptRunItemStatus, ScriptRunStatus, ScriptRunType } from "../script-agent-domain";

export type ScriptAgentRunRecord = {
    id: string;
    schoolId: string;
    ownerUserId: string;
    projectId: string;
    chatSessionId?: string;
    runType: ScriptRunType;
    stageKey?: string;
    status: ScriptRunStatus;
    clientRequestId: string;
    configSnapshot: Record<string, unknown>;
    progress: Record<string, unknown>;
    startedAt?: string;
    completedAt?: string;
    lastEventSequence: number;
    errorCode?: string;
    errorMessage?: string;
    createdAt: string;
};
export type ScriptRunItemRecord = { id: string; runId: string; itemType: string; itemKey: string; status: ScriptRunItemStatus; attemptNo: number; artifactId?: string; errorCode?: string; errorMessage?: string };
export type ScriptRunEventRecord = { id: string; runId: string; sequence: number; type: ScriptRunEventType; data: Record<string, unknown>; createdAt: string };
export type ScriptAgentProfileRecord = {
    agentKey: ScriptAgentKey;
    name: string;
    enabled: boolean;
    primaryLogicalModelId: string;
    fallbackLogicalModelId: string;
    endpointId?: string;
    temperature?: number;
    reasoningMode: string;
    outputPolicy: Record<string, unknown>;
    timeoutConfig: Record<string, unknown>;
    batchConfig: Record<string, unknown>;
    toolAllowlist: string[];
    skillBindings: string[];
    version: number;
};

export class ScriptAgentRepository {
    constructor(private readonly db: QueryExecutor) {}

    async createRun(scope: PracticeTenantScope, input: { id: string; projectId: string; chatSessionId?: string; runType: ScriptRunType; stageKey?: string; clientRequestId: string; configSnapshot: Record<string, unknown> }) {
        const result = await this.db.query(
            `INSERT INTO practice_script_runs (id, school_id, owner_user_id, project_id, chat_session_id, run_type, stage_key, status, client_request_id, config_snapshot)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'planning', $8, $9::jsonb)
             ON CONFLICT (school_id, owner_user_id, client_request_id) DO UPDATE SET client_request_id = EXCLUDED.client_request_id
             RETURNING *`,
            [input.id, scope.schoolId, scope.ownerUserId, input.projectId, input.chatSessionId || null, input.runType, input.stageKey || null, input.clientRequestId, JSON.stringify(input.configSnapshot)],
        );
        return mapRun(result.rows[0]);
    }

    async getRun(scope: PracticeTenantScope, projectId: string, runId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM practice_script_runs WHERE id = $1 AND school_id = $2 AND owner_user_id = $3 AND project_id = $4${forUpdate ? " FOR UPDATE" : ""}`, [runId, scope.schoolId, scope.ownerUserId, projectId]);
        return result.rows[0] ? mapRun(result.rows[0]) : null;
    }

    async claimRun(scope: PracticeTenantScope, projectId: string, runId: string) {
        const result = await this.db.query("UPDATE practice_script_runs SET status = 'running', started_at = COALESCE(started_at, now()) WHERE id = $1 AND school_id = $2 AND owner_user_id = $3 AND project_id = $4 AND status = 'planning' RETURNING *", [
            runId,
            scope.schoolId,
            scope.ownerUserId,
            projectId,
        ]);
        return result.rows[0] ? mapRun(result.rows[0]) : null;
    }

    async updateRun(scope: PracticeTenantScope, projectId: string, runId: string, patch: { status?: ScriptRunStatus; progress?: Record<string, unknown>; startedAt?: string; completedAt?: string; errorCode?: string; errorMessage?: string }) {
        const result = await this.db.query(
            `UPDATE practice_script_runs SET status = COALESCE($5, status), progress_json = COALESCE($6::jsonb, progress_json), started_at = COALESCE($7::timestamptz, started_at), completed_at = COALESCE($8::timestamptz, completed_at), error_code = $9, error_message = $10
             WHERE id = $1 AND school_id = $2 AND owner_user_id = $3 AND project_id = $4 RETURNING *`,
            [runId, scope.schoolId, scope.ownerUserId, projectId, patch.status || null, patch.progress ? JSON.stringify(patch.progress) : null, patch.startedAt || null, patch.completedAt || null, patch.errorCode || null, patch.errorMessage || null],
        );
        return result.rows[0] ? mapRun(result.rows[0]) : null;
    }

    async appendRunEvent(scope: PracticeTenantScope, projectId: string, runId: string, type: ScriptRunEventType, data: Record<string, unknown>, eventId: string) {
        const result = await this.db.query(
            `WITH scoped_run AS (
                UPDATE practice_script_runs SET last_event_sequence = last_event_sequence + 1
                WHERE id = $2 AND school_id = $3 AND owner_user_id = $4 AND project_id = $5
                RETURNING id, last_event_sequence
             )
             INSERT INTO practice_script_run_events (id, run_id, sequence, public_event_type, public_payload)
             SELECT $1, id, last_event_sequence, $6, $7::jsonb FROM scoped_run RETURNING *`,
            [eventId, runId, scope.schoolId, scope.ownerUserId, projectId, type, JSON.stringify(data)],
        );
        return result.rows[0] ? mapEvent(result.rows[0]) : null;
    }

    async listRunEvents(scope: PracticeTenantScope, projectId: string, runId: string, afterSequence = 0, limit = 200) {
        const result = await this.db.query(
            `SELECT e.* FROM practice_script_run_events e JOIN practice_script_runs r ON r.id = e.run_id
             WHERE e.run_id = $1 AND r.school_id = $2 AND r.owner_user_id = $3 AND r.project_id = $4 AND e.sequence > $6
             ORDER BY e.sequence ASC LIMIT $5`,
            [runId, scope.schoolId, scope.ownerUserId, projectId, Math.min(500, Math.max(1, limit)), Math.max(0, afterSequence)],
        );
        return result.rows.map(mapEvent);
    }

    async createRunItem(scope: PracticeTenantScope, projectId: string, input: ScriptRunItemRecord) {
        const result = await this.db.query(
            `INSERT INTO practice_script_run_items (id, run_id, item_type, item_key, status, attempt_no, artifact_id, error_code, error_message)
             SELECT $1, r.id, $6, $7, $8, $9, $10, $11, $12 FROM practice_script_runs r
             WHERE r.id = $2 AND r.school_id = $3 AND r.owner_user_id = $4 AND r.project_id = $5
             ON CONFLICT (run_id, item_type, item_key, attempt_no) DO UPDATE SET item_key = EXCLUDED.item_key RETURNING *`,
            [input.id, input.runId, scope.schoolId, scope.ownerUserId, projectId, input.itemType, input.itemKey, input.status, input.attemptNo, input.artifactId || null, input.errorCode || null, input.errorMessage || null],
        );
        return result.rows[0] ? mapItem(result.rows[0]) : null;
    }

    async listRunItems(scope: PracticeTenantScope, projectId: string, runId: string, status?: ScriptRunItemStatus) {
        const result = await this.db.query(
            `SELECT i.* FROM practice_script_run_items i JOIN practice_script_runs r ON r.id = i.run_id
             WHERE i.run_id = $1 AND r.school_id = $2 AND r.owner_user_id = $3 AND r.project_id = $4 AND ($5::text IS NULL OR i.status = $5)
             ORDER BY i.item_key ASC, i.attempt_no DESC`,
            [runId, scope.schoolId, scope.ownerUserId, projectId, status || null],
        );
        return result.rows.map(mapItem);
    }

    async updateRunItem(scope: PracticeTenantScope, projectId: string, runId: string, itemId: string, patch: { status: ScriptRunItemStatus; artifactId?: string; errorCode?: string; errorMessage?: string }) {
        const result = await this.db.query(
            `UPDATE practice_script_run_items i SET status = $6, artifact_id = $7, error_code = $8, error_message = $9,
                 started_at = CASE WHEN $6 = 'running' THEN now() ELSE started_at END,
                 completed_at = CASE WHEN $6 IN ('success', 'failed', 'stopped') THEN now() ELSE completed_at END
             FROM practice_script_runs r WHERE i.run_id = r.id AND i.id = $1 AND r.id = $2 AND r.school_id = $3 AND r.owner_user_id = $4 AND r.project_id = $5 RETURNING i.*`,
            [itemId, runId, scope.schoolId, scope.ownerUserId, projectId, patch.status, patch.artifactId || null, patch.errorCode || null, patch.errorMessage || null],
        );
        return result.rows[0] ? mapItem(result.rows[0]) : null;
    }

    async saveArtifact(scope: PracticeTenantScope, input: { id: string; projectId: string; artifactType: string; artifactKey: string; status: string; content: Record<string, unknown>; contentText?: string; sourceRunId: string }) {
        const result = await this.db.query(
            `INSERT INTO practice_script_artifacts (id, school_id, owner_user_id, project_id, artifact_type, artifact_key, status, version, content_json, content_text, source_run_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE((SELECT MAX(version) + 1 FROM practice_script_artifacts WHERE project_id = $4 AND artifact_type = $5 AND artifact_key = $6), 1), $8::jsonb, $9, $10)
             RETURNING *`,
            [input.id, scope.schoolId, scope.ownerUserId, input.projectId, input.artifactType, input.artifactKey, input.status, JSON.stringify(input.content), input.contentText || null, input.sourceRunId],
        );
        return result.rows[0] || null;
    }

    async listLatestArtifacts(scope: PracticeTenantScope, projectId: string) {
        const result = await this.db.query(
            `SELECT DISTINCT ON (artifact_type, artifact_key) * FROM practice_script_artifacts
             WHERE school_id = $1 AND owner_user_id = $2 AND project_id = $3
             ORDER BY artifact_type, artifact_key, version DESC`,
            [scope.schoolId, scope.ownerUserId, projectId],
        );
        return result.rows;
    }

    async listRuns(scope: PracticeTenantScope, projectId: string, statuses?: ScriptRunStatus[]) {
        const result = await this.db.query(
            `SELECT * FROM practice_script_runs WHERE school_id = $1 AND owner_user_id = $2 AND project_id = $3
             AND ($4::text[] IS NULL OR status = ANY($4::text[])) ORDER BY created_at DESC LIMIT 50`,
            [scope.schoolId, scope.ownerUserId, projectId, statuses?.length ? statuses : null],
        );
        return result.rows.map(mapRun);
    }

    async createChatSession(scope: PracticeTenantScope, input: { id: string; projectId: string; title: string }) {
        const result = await this.db.query("INSERT INTO practice_script_chat_sessions (id, school_id, owner_user_id, project_id, title) VALUES ($1, $2, $3, $4, $5) RETURNING *", [input.id, scope.schoolId, scope.ownerUserId, input.projectId, input.title]);
        return result.rows[0] || null;
    }

    async listChatSessions(scope: PracticeTenantScope, projectId: string) {
        const result = await this.db.query("SELECT * FROM practice_script_chat_sessions WHERE school_id = $1 AND owner_user_id = $2 AND project_id = $3 AND deleted_at IS NULL ORDER BY updated_at DESC", [scope.schoolId, scope.ownerUserId, projectId]);
        return result.rows;
    }

    async saveChatMessage(scope: PracticeTenantScope, input: { id: string; sessionId: string; projectId: string; role: "user" | "assistant"; agentKey?: ScriptAgentKey; publicContent: string; sourceRunId?: string }) {
        const result = await this.db.query(
            `INSERT INTO practice_script_chat_messages (id, session_id, project_id, role, agent_key, public_content, source_run_id)
             SELECT $1, s.id, s.project_id, $5, $6, $7, $8 FROM practice_script_chat_sessions s
             WHERE s.id = $2 AND s.project_id = $3 AND s.school_id = $4 AND s.owner_user_id = $9 RETURNING *`,
            [input.id, input.sessionId, input.projectId, scope.schoolId, input.role, input.agentKey || null, input.publicContent, input.sourceRunId || null, scope.ownerUserId],
        );
        return result.rows[0] || null;
    }

    async listChatMessages(scope: PracticeTenantScope, projectId: string, sessionId: string) {
        const result = await this.db.query(
            `SELECT m.* FROM practice_script_chat_messages m JOIN practice_script_chat_sessions s ON s.id = m.session_id
             WHERE m.session_id = $1 AND m.project_id = $2 AND s.school_id = $3 AND s.owner_user_id = $4 ORDER BY m.created_at ASC, m.id ASC`,
            [sessionId, projectId, scope.schoolId, scope.ownerUserId],
        );
        return result.rows;
    }

    async getAgentProfile(agentKey: ScriptAgentKey) {
        const result = await this.db.query("SELECT * FROM practice_script_agent_profiles WHERE agent_key = $1 AND enabled = true", [agentKey]);
        return result.rows[0] ? mapProfile(result.rows[0]) : null;
    }
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const optional = (value: unknown) => text(value) || undefined;
const json = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : text(value));
function mapRun(row: Record<string, unknown>): ScriptAgentRunRecord {
    return {
        id: text(row.id),
        schoolId: text(row.school_id),
        ownerUserId: text(row.owner_user_id),
        projectId: text(row.project_id),
        chatSessionId: optional(row.chat_session_id),
        runType: text(row.run_type) as ScriptRunType,
        stageKey: optional(row.stage_key),
        status: text(row.status) as ScriptRunStatus,
        clientRequestId: text(row.client_request_id),
        configSnapshot: json(row.config_snapshot),
        progress: json(row.progress_json),
        startedAt: optional(row.started_at),
        completedAt: optional(row.completed_at),
        lastEventSequence: Number(row.last_event_sequence || 0),
        errorCode: optional(row.error_code),
        errorMessage: optional(row.error_message),
        createdAt: iso(row.created_at),
    };
}
function mapItem(row: Record<string, unknown>): ScriptRunItemRecord {
    return {
        id: text(row.id),
        runId: text(row.run_id),
        itemType: text(row.item_type),
        itemKey: text(row.item_key),
        status: text(row.status) as ScriptRunItemStatus,
        attemptNo: Number(row.attempt_no || 0),
        artifactId: optional(row.artifact_id),
        errorCode: optional(row.error_code),
        errorMessage: optional(row.error_message),
    };
}
function mapEvent(row: Record<string, unknown>): ScriptRunEventRecord {
    return { id: text(row.id), runId: text(row.run_id), sequence: Number(row.sequence || 0), type: text(row.public_event_type) as ScriptRunEventType, data: json(row.public_payload), createdAt: iso(row.created_at) };
}
function mapProfile(row: Record<string, unknown>): ScriptAgentProfileRecord {
    return {
        agentKey: text(row.agent_key) as ScriptAgentKey,
        name: text(row.name),
        enabled: row.enabled !== false,
        primaryLogicalModelId: text(row.primary_logical_model_id),
        fallbackLogicalModelId: text(row.fallback_logical_model_id),
        endpointId: optional(row.endpoint_id),
        temperature: row.temperature === null || row.temperature === undefined ? undefined : Number(row.temperature),
        reasoningMode: text(row.reasoning_mode),
        outputPolicy: json(row.output_policy),
        timeoutConfig: json(row.timeout_config),
        batchConfig: json(row.batch_config),
        toolAllowlist: strings(row.tool_allowlist),
        skillBindings: strings(row.skill_bindings),
        version: Number(row.version || 1),
    };
}
