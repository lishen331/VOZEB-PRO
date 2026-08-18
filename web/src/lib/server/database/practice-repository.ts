import type { QueryExecutor } from "./postgres";
import type { PageInput, PageResult, PracticeCopyRequestInput, PracticeCopyRequestRecord, PracticeSessionCreateInput, PracticeSessionRecord, PracticeSessionStatus, PullFilmVersionRecord } from "./repository-types";
import { isoValue, jsonParam, jsonValue, normalizePage, normalizePageSize, optionalIso, optionalString, stringValue } from "./repository-utils";

export type PracticeSessionListInput = PageInput & { projectId?: string; projectKind?: "canvas" | "drama"; module?: PracticeSessionRecord["module"] };

export class PracticeRepository {
    constructor(private readonly db: QueryExecutor) {}

    async createPracticeSession(input: PracticeSessionCreateInput) {
        const result = await this.db.query(
            `INSERT INTO practice_sessions (id, user_id, project_id, project_kind, module, execution_profile, prompt_json, input_json, task_refs, status)
             VALUES ($1, $2, $3, $4, $5, 'open-source-practice', $6::jsonb, $7::jsonb, $8::jsonb, $9)
             RETURNING *`,
            [input.id, input.userId, input.projectId || null, input.projectKind, input.module, jsonParam(input.prompt), jsonParam(input.input), jsonParam(input.taskRefs), input.status],
        );
        return mapPracticeSession(result.rows[0]);
    }

    async getPracticeSessionForUser(userId: string, id: string) {
        const result = await this.db.query("SELECT * FROM practice_sessions WHERE user_id = $1 AND id = $2", [userId, id]);
        return result.rows[0] ? mapPracticeSession(result.rows[0]) : null;
    }

    async listPracticeSessionsForUser(userId: string, input: PracticeSessionListInput = {}): Promise<PageResult<PracticeSessionRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `WITH filtered AS (
                SELECT * FROM practice_sessions
                WHERE user_id = $1
                  AND ($2::text IS NULL OR project_id = $2)
                  AND ($3::text IS NULL OR project_kind = $3)
                  AND ($4::text IS NULL OR module = $4)
            ), page_items AS (
                SELECT * FROM filtered ORDER BY updated_at DESC, id ASC LIMIT $5 OFFSET $6
            )
            SELECT page_items.*, totals.total_count
            FROM (SELECT count(*)::integer AS total_count FROM filtered) totals
            LEFT JOIN page_items ON TRUE
            ORDER BY page_items.updated_at DESC NULLS LAST, page_items.id ASC`,
            [userId, input.projectId || null, input.projectKind || null, input.module || null, pageSize, (page - 1) * pageSize],
        );
        return {
            items: result.rows.filter((row) => row.id).map(mapPracticeSession),
            total: Number(result.rows[0]?.total_count) || 0,
            page,
            pageSize,
        };
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
        projectId: optionalString(row.project_id),
        projectKind: row.project_kind === "drama" ? "drama" : "canvas",
        module: practiceModule(row.module),
        executionProfile: "open-source-practice",
        prompt: jsonValue(row.prompt_json),
        input: jsonValue(row.input_json),
        taskRefs: jsonValue(row.task_refs),
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
    return value === "storyboard-image" || value === "storyboard-video" || value === "dubbing" || value === "music" ? value : "script";
}

function practiceSessionStatus(value: unknown): PracticeSessionStatus {
    return value === "draft" || value === "running" || value === "success" || value === "failed" || value === "cancelled" ? value : "queued";
}
