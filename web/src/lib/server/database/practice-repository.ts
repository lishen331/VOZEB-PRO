import type { QueryExecutor } from "./postgres";
import type { PracticeTenantScope } from "@/lib/server/practice-tenant-scope";
import type { PageInput, PageResult, PracticeCopyRequestInput, PracticeCopyRequestRecord, PracticeSessionCreateInput, PracticeSessionRecord, PracticeSessionStatus, PullFilmVersionRecord } from "./repository-types";
import { isoValue, jsonParam, jsonValue, normalizePage, normalizePageSize, optionalIso, optionalString, stringValue } from "./repository-utils";

export type PracticeSessionListInput = PageInput & { projectId?: string; projectKind?: "canvas" | "drama"; module?: PracticeSessionRecord["module"] };

export class PracticeRepository {
    constructor(private readonly db: QueryExecutor) {}

    async createPracticeSession(input: PracticeSessionCreateInput) {
        const result = await this.db.query(
            `INSERT INTO practice_sessions (id, user_id, school_id, project_id, project_kind, module, mode, title, client_request_id, execution_profile, prompt_json, input_json, task_refs, selected_logical_model_id, workflow_code, workflow_version, workflow_config_fingerprint, workflow_adapter_version, error_code, error_message, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open-source-practice', $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20)
             ON CONFLICT (school_id, user_id, client_request_id) DO UPDATE SET updated_at = practice_sessions.updated_at
             RETURNING *`,
            [
                input.id,
                input.userId,
                input.schoolId || null,
                input.projectId || null,
                input.projectKind,
                input.module,
                input.mode || "workflow",
                input.title || "练习会话",
                input.clientRequestId || input.id,
                jsonParam(input.prompt),
                jsonParam(input.input),
                jsonParam(input.taskRefs),
                input.selectedLogicalModelId || null,
                input.workflowCode || null,
                input.workflowVersion || null,
                input.workflowConfigFingerprint || null,
                input.workflowAdapterVersion || null,
                input.errorCode || null,
                input.errorMessage || null,
                input.status,
            ],
        );
        return mapPracticeSession(result.rows[0]);
    }

    async getPracticeSessionByClientRequest(scope: PracticeTenantScope, clientRequestId: string) {
        const result = await this.db.query("SELECT * FROM practice_sessions WHERE school_id = $1 AND user_id = $2 AND client_request_id = $3", [scope.schoolId, scope.ownerUserId, clientRequestId]);
        return result.rows[0] ? mapPracticeSession(result.rows[0]) : null;
    }

    async claimPracticeSessionDispatch(scope: PracticeTenantScope, id: string) {
        const result = await this.db.query(
            `UPDATE practice_sessions
             SET status = 'running'
             WHERE school_id = $1 AND user_id = $2 AND id = $3 AND status = 'queued' AND task_refs = '[]'::jsonb
             RETURNING *`,
            [scope.schoolId, scope.ownerUserId, id],
        );
        return result.rows[0] ? mapPracticeSession(result.rows[0]) : null;
    }

    async resetPracticeSessionForRetry(scope: PracticeTenantScope, id: string) {
        const result = await this.db.query(
            `UPDATE practice_sessions
             SET status = 'queued', task_refs = '[]'::jsonb, error_code = NULL, error_message = NULL
             WHERE school_id = $1 AND user_id = $2 AND id = $3 AND (status IN ('failed', 'cancelled') OR (status = 'running' AND task_refs = '[]'::jsonb))
             RETURNING *`,
            [scope.schoolId, scope.ownerUserId, id],
        );
        return result.rows[0] ? mapPracticeSession(result.rows[0]) : null;
    }

    async updatePracticeSession(scope: PracticeTenantScope, id: string, patch: Partial<Pick<PracticeSessionRecord, "status" | "taskRefs" | "prompt" | "input" | "title" | "selectedLogicalModelId" | "errorCode" | "errorMessage">>) {
        const current = await this.getPracticeSessionForUser(scope, id);
        if (!current) return null;
        const values: unknown[] = [scope.schoolId, scope.ownerUserId, id];
        const assignments: string[] = [];
        const add = (column: string, value: unknown, cast = "") => {
            values.push(value);
            assignments.push(`${column} = $${values.length}${cast}`);
        };
        if (patch.status !== undefined) add("status", patch.status);
        if (Object.prototype.hasOwnProperty.call(patch, "taskRefs")) add("task_refs", patch.taskRefs === undefined ? null : jsonParam(patch.taskRefs), "::jsonb");
        if (patch.prompt !== undefined) add("prompt_json", jsonParam(patch.prompt), "::jsonb");
        if (patch.input !== undefined) add("input_json", jsonParam(patch.input), "::jsonb");
        if (patch.title !== undefined) add("title", patch.title || null);
        if (patch.selectedLogicalModelId !== undefined) add("selected_logical_model_id", patch.selectedLogicalModelId || null);
        if (Object.prototype.hasOwnProperty.call(patch, "errorCode")) add("error_code", patch.errorCode || null);
        if (Object.prototype.hasOwnProperty.call(patch, "errorMessage")) add("error_message", patch.errorMessage || null);
        if (!assignments.length) return current;
        const result = await this.db.query(
            `UPDATE practice_sessions
             SET ${assignments.join(", ")}
             WHERE school_id = $1 AND user_id = $2 AND id = $3
             RETURNING *`,
            values,
        );
        return result.rows[0] ? mapPracticeSession(result.rows[0]) : null;
    }

    async getPracticeSessionForUser(scope: PracticeTenantScope, id: string) {
        const result = await this.db.query("SELECT * FROM practice_sessions WHERE school_id = $1 AND user_id = $2 AND id = $3", [scope.schoolId, scope.ownerUserId, id]);
        return result.rows[0] ? mapPracticeSession(result.rows[0]) : null;
    }

    async listPracticeSessionsForUser(scope: PracticeTenantScope, input: PracticeSessionListInput = {}): Promise<PageResult<PracticeSessionRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `WITH filtered AS (
                SELECT * FROM practice_sessions
                WHERE school_id = $1 AND user_id = $2
                  AND ($3::text IS NULL OR project_id = $3)
                  AND ($4::text IS NULL OR project_kind = $4)
                  AND ($5::text IS NULL OR module = $5)
            ), page_items AS (
                SELECT * FROM filtered ORDER BY updated_at DESC, id ASC LIMIT $6 OFFSET $7
            )
            SELECT page_items.*, totals.total_count
            FROM (SELECT count(*)::integer AS total_count FROM filtered) totals
            LEFT JOIN page_items ON TRUE
            ORDER BY page_items.updated_at DESC NULLS LAST, page_items.id ASC`,
            [scope.schoolId, scope.ownerUserId, input.projectId || null, input.projectKind || null, input.module || null, pageSize, (page - 1) * pageSize],
        );
        return {
            items: result.rows.filter((row) => row.id).map(mapPracticeSession),
            total: Number(result.rows[0]?.total_count) || 0,
            page,
            pageSize,
        };
    }

    async deletePracticeSession(scope: PracticeTenantScope, id: string): Promise<void> {
        await this.db.query("DELETE FROM practice_sessions WHERE school_id = $1 AND user_id = $2 AND id = $3", [scope.schoolId, scope.ownerUserId, id]);
    }

    async claimCopyRequest(input: PracticeCopyRequestInput) {
        const result = await this.db.query(
            `INSERT INTO practice_copy_requests (user_id, client_request_id, source_work_id, source_version_id, project_kind, project_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, client_request_id) DO UPDATE SET updated_at = practice_copy_requests.updated_at
             RETURNING *`,
            [input.userId, input.clientRequestId, input.sourceWorkId, input.sourceVersionId, input.projectKind, input.projectId],
        );
        return mapPracticeCopyRequest(result.rows[0]);
    }

    async createPracticeProjectCopy(input: {
        userId: string;
        kind: "canvas" | "drama";
        projectId: string;
        conversationId: string;
        title: string;
        projectJson: unknown;
        createdAt: string;
        updatedAt: string;
        sourceWorkId: string;
        sourceVersionId: string;
        executionProfile: "open-source-practice";
    }) {
        await this.db.query(
            `INSERT INTO creative_conversations (id, user_id, surface, source, project_id, title, status, created_at, updated_at, last_message_at)
             VALUES ($1, $2, $3, $3, $4, $5, 'active', $6, $6, $6)`,
            [input.conversationId, input.userId, input.kind, input.projectId, input.title || "新对话", new Date(input.createdAt)],
        );
        if (input.kind === "canvas") {
            await this.db.query(
                `INSERT INTO canvas_projects (id, user_id, title, project_json, execution_profile, practice_source_work_id, practice_source_version_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4::jsonb, 'open-source-practice', $5, $6, $7, $8)`,
                [input.projectId, input.userId, input.title, JSON.stringify(input.projectJson), input.sourceWorkId, input.sourceVersionId, new Date(input.createdAt), new Date(input.updatedAt)],
            );
        } else {
            await this.db.query(
                `INSERT INTO drama_projects (id, user_id, title, status, project_json, execution_profile, practice_source_work_id, practice_source_version_id, created_at, updated_at)
                 VALUES ($1, $2, $3, 'active', $4::jsonb, 'open-source-practice', $5, $6, $7, $8)`,
                [input.projectId, input.userId, input.title, JSON.stringify(input.projectJson), input.sourceWorkId, input.sourceVersionId, new Date(input.createdAt), new Date(input.updatedAt)],
            );
        }
    }

    async getPullFilmVersion(workId: string, versionId: string, forUpdate = false): Promise<PullFilmVersionRecord | null> {
        const result = await this.db.query(
            `SELECT work_id, id AS version_id, pull_film_enabled, pull_film_snapshot, pull_film_enabled_at, pull_film_enabled_by_user_id
             FROM published_work_versions
             WHERE work_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`,
            [workId, versionId],
        );
        return result.rows[0] ? mapPullFilmVersion(result.rows[0]) : null;
    }

    async setPullFilmVersion(input: { workId: string; versionId: string; enabled: boolean; snapshot?: unknown; enabledAt?: string; enabledByUserId?: string }) {
        const result = await this.db.query(
            `UPDATE published_work_versions
             SET pull_film_enabled = $3,
                 pull_film_snapshot = $4::jsonb,
                 pull_film_enabled_at = $5::timestamptz,
                 pull_film_enabled_by_user_id = $6
             WHERE work_id = $1 AND id = $2
             RETURNING work_id, id AS version_id, pull_film_enabled, pull_film_snapshot, pull_film_enabled_at, pull_film_enabled_by_user_id`,
            [input.workId, input.versionId, input.enabled, input.snapshot === undefined ? null : JSON.stringify(input.snapshot), input.enabled ? input.enabledAt || new Date().toISOString() : null, input.enabled ? input.enabledByUserId || null : null],
        );
        return result.rows[0] ? mapPullFilmVersion(result.rows[0]) : null;
    }
}

function mapPracticeSession(row: Record<string, unknown>): PracticeSessionRecord {
    return {
        id: stringValue(row.id),
        userId: stringValue(row.user_id),
        ...(optionalString(row.school_id) ? { schoolId: optionalString(row.school_id) } : {}),
        projectId: optionalString(row.project_id),
        projectKind: row.project_kind === "drama" ? "drama" : "canvas",
        module: practiceModule(row.module),
        mode: row.mode === "manual" ? "manual" : "workflow",
        title: optionalString(row.title) || "练习会话",
        clientRequestId: stringValue(row.client_request_id),
        executionProfile: "open-source-practice",
        prompt: jsonValue(row.prompt_json),
        input: jsonValue(row.input_json),
        taskRefs: jsonValue(row.task_refs),
        ...(optionalString(row.selected_logical_model_id) ? { selectedLogicalModelId: optionalString(row.selected_logical_model_id) } : {}),
        ...(optionalString(row.workflow_code) ? { workflowCode: optionalString(row.workflow_code) } : {}),
        ...(Number.isSafeInteger(Number(row.workflow_version)) && Number(row.workflow_version) > 0 ? { workflowVersion: Number(row.workflow_version) } : {}),
        ...(optionalString(row.workflow_config_fingerprint) ? { workflowConfigFingerprint: optionalString(row.workflow_config_fingerprint) } : {}),
        ...(Number.isSafeInteger(Number(row.workflow_adapter_version)) && Number(row.workflow_adapter_version) > 0 ? { workflowAdapterVersion: Number(row.workflow_adapter_version) } : {}),
        ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code) } : {}),
        ...(optionalString(row.error_message) ? { errorMessage: optionalString(row.error_message) } : {}),
        status: practiceSessionStatus(row.status),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapPracticeCopyRequest(row: Record<string, unknown>): PracticeCopyRequestRecord {
    return {
        userId: stringValue(row.user_id),
        clientRequestId: stringValue(row.client_request_id),
        sourceWorkId: stringValue(row.source_work_id),
        sourceVersionId: stringValue(row.source_version_id),
        projectKind: row.project_kind === "drama" ? "drama" : "canvas",
        projectId: stringValue(row.project_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapPullFilmVersion(row: Record<string, unknown>): PullFilmVersionRecord {
    return {
        workId: stringValue(row.work_id),
        versionId: stringValue(row.version_id),
        enabled: row.pull_film_enabled === true,
        snapshot: row.pull_film_snapshot == null ? undefined : jsonValue(row.pull_film_snapshot),
        enabledAt: optionalIso(row.pull_film_enabled_at),
        enabledByUserId: optionalString(row.pull_film_enabled_by_user_id),
    };
}

function practiceModule(value: unknown): PracticeSessionRecord["module"] {
    return value === "character" || value === "scene" || value === "prop" || value === "storyboard-image" || value === "storyboard-video" || value === "dubbing" || value === "music" ? value : "script";
}

function practiceSessionStatus(value: unknown): PracticeSessionStatus {
    return value === "draft" || value === "running" || value === "success" || value === "failed" || value === "cancelled" ? value : "queued";
}
