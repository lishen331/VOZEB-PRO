import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { AnnouncementRecord, GenerationKind, GenerationLogAssetRecord, GenerationLogRecord, GenerationStatus, PageInput, PageResult, PromptRecord, PromptScope } from "./repository-shared";
import { CREATE_OVERVIEW_RECENT_ASSET_LIMIT, type CreateOverviewAsset, type CreateOverviewTask } from "@/lib/create-workbench-overview";
import { mapAnnouncement, mapGenerationLog, mapGenerationLogAsset, mapPrompt } from "./repository-record-mappers";
import { jsonParam, normalizePage, normalizePageSize, pageResult } from "./repository-shared";

export type GenerationLogOverviewBucket = { key: string; value: number };
export type GenerationLogOverviewAggregate = {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    activeUsers: number;
    daily: GenerationLogOverviewBucket[];
    models: GenerationLogOverviewBucket[];
    sources: GenerationLogOverviewBucket[];
    kinds: GenerationLogOverviewBucket[];
};
export type GenerationLogCreateOverview = { runningTasks: CreateOverviewTask[]; recentAssets: CreateOverviewAsset[] };

/** 成功率分组：分母只含 success/failed，pending 单独计数。 */
export type GenerationLogSuccessRateGroup = { key: string; total: number; success: number; failed: number; pending: number };
export type GenerationLogSuccessRateAggregate = {
    kinds: GenerationLogSuccessRateGroup[];
    channels: GenerationLogSuccessRateGroup[];
    profiles: GenerationLogSuccessRateGroup[];
    topFailureReason: string;
    topFailureCount: number;
};

export class AnnouncementsRepository {
    constructor(private readonly db: QueryExecutor) {}

    async list(includeDisabled = false) {
        const result = await this.db.query("SELECT * FROM announcements WHERE ($1::boolean = true OR enabled = true) ORDER BY created_at DESC", [includeDisabled]);
        return result.rows.map(mapAnnouncement);
    }

    async getById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM announcements WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapAnnouncement(result.rows[0]) : null;
    }

    async upsert(announcement: AnnouncementRecord) {
        const result = await this.db.query(
            `
            INSERT INTO announcements (id, title, content, enabled, popup_home, popup_after_login, starts_at, ends_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                enabled = EXCLUDED.enabled,
                popup_home = EXCLUDED.popup_home,
                popup_after_login = EXCLUDED.popup_after_login,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at
            RETURNING *
            `,
            [
                announcement.id,
                announcement.title,
                announcement.content,
                announcement.enabled,
                announcement.popupHome,
                announcement.popupAfterLogin,
                announcement.startsAt || null,
                announcement.endsAt || null,
                announcement.createdAt,
                announcement.updatedAt,
            ],
        );
        return mapAnnouncement(result.rows[0]);
    }

    async delete(id: string) {
        const result = await this.db.query("DELETE FROM announcements WHERE id = $1", [id]);
        return result.rowCount || 0;
    }
}

export class PromptsRepository {
    constructor(private readonly db: QueryExecutor) {}

    async list(input: PageInput & { scope: PromptScope; ownerUserId?: string; keyword?: string; category?: string; tags?: string[]; random?: boolean }): Promise<PageResult<PromptRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const tags = input.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) || [];
        const result = await this.db.query(
            `
            SELECT *, count(*) OVER() AS total_count
            FROM prompts
            WHERE scope = $1
              AND ($1 = 'library' OR owner_user_id = $2)
              AND ($3 = '' OR lower(title) LIKE $4 OR lower(prompt) LIKE $4 OR lower(category) LIKE $4 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS prompt_tag WHERE lower(prompt_tag) LIKE $4))
              AND ($5 = '' OR category = $5)
              AND ($6::text[] IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS prompt_tag WHERE prompt_tag = ANY($6::text[])))
            ORDER BY ${input.random ? "random()" : "updated_at DESC"}
            LIMIT $7 OFFSET $8
            `,
            [input.scope, input.ownerUserId || null, keyword, `%${keyword}%`, input.category || "", tags.length ? tags : null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapPrompt), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async facets(input: { scope: PromptScope; ownerUserId?: string; keyword?: string; category?: string }) {
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const params = [input.scope, input.ownerUserId || null, keyword, `%${keyword}%`, input.category || ""];
        const [tags, categories, scopeTotal] = await Promise.all([
            this.db.query(
                `
                SELECT DISTINCT prompt_tag AS tag
                FROM prompts
                CROSS JOIN LATERAL jsonb_array_elements_text(prompts.tags) AS prompt_tag
                WHERE scope = $1
                  AND ($1 = 'library' OR owner_user_id = $2)
                  AND ($3 = '' OR lower(title) LIKE $4 OR lower(prompt) LIKE $4 OR lower(category) LIKE $4 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(prompts.tags) AS keyword_tag WHERE lower(keyword_tag) LIKE $4))
                  AND ($5 = '' OR category = $5)
                ORDER BY tag ASC
                `,
                params,
            ),
            this.db.query(
                `
                SELECT DISTINCT category
                FROM prompts
                WHERE scope = $1
                  AND ($1 = 'library' OR owner_user_id = $2)
                ORDER BY category ASC
                `,
                [input.scope, input.ownerUserId || null],
            ),
            this.db.query("SELECT count(*) AS total FROM prompts WHERE scope = $1 AND ($1 = 'library' OR owner_user_id = $2)", [input.scope, input.ownerUserId || null]),
        ]);
        return {
            tags: tags.rows.map((row) => String(row.tag || "")).filter(Boolean),
            categories: categories.rows.map((row) => String(row.category || "")).filter(Boolean),
            scopeTotal: Number(scopeTotal.rows[0]?.total || 0),
        };
    }

    async getById(id: string) {
        const result = await this.db.query("SELECT * FROM prompts WHERE id = $1", [id]);
        return result.rows[0] ? mapPrompt(result.rows[0]) : null;
    }

    async hasSeedSource(source: string) {
        const result = await this.db.query("SELECT 1 FROM prompt_seed_sources WHERE source = $1 LIMIT 1", [source]);
        return Boolean(result.rows[0]);
    }

    async replaceSeededPrompts(sourcePrefixes: string[], source: string, prompts: PromptRecord[]) {
        for (const sourcePrefix of sourcePrefixes) {
            await this.db.query("DELETE FROM prompts WHERE source LIKE $1", [`${sourcePrefix}%`]);
            await this.db.query("DELETE FROM prompt_seed_sources WHERE source LIKE $1", [`${sourcePrefix}%`]);
        }
        await this.db.query("INSERT INTO prompt_seed_sources (source) VALUES ($1) ON CONFLICT (source) DO NOTHING", [source]);
        for (const prompt of prompts) await this.upsert(prompt);
    }

    async upsert(prompt: PromptRecord) {
        const result = await this.db.query(
            `
            INSERT INTO prompts (id, scope, owner_user_id, title, cover_url, prompt, tags, category, preview, github_url, source, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
                scope = EXCLUDED.scope,
                owner_user_id = EXCLUDED.owner_user_id,
                title = EXCLUDED.title,
                cover_url = EXCLUDED.cover_url,
                prompt = EXCLUDED.prompt,
                tags = EXCLUDED.tags,
                category = EXCLUDED.category,
                preview = EXCLUDED.preview,
                github_url = EXCLUDED.github_url,
                source = EXCLUDED.source,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            `,
            [prompt.id, prompt.scope, prompt.ownerUserId || null, prompt.title, prompt.coverUrl, prompt.prompt, jsonParam(prompt.tags), prompt.category, prompt.preview, prompt.githubUrl || null, prompt.source || null, prompt.createdAt, prompt.updatedAt],
        );
        return mapPrompt(result.rows[0]);
    }

    async delete(id: string) {
        const result = await this.db.query("DELETE FROM prompts WHERE id = $1", [id]);
        return result.rowCount || 0;
    }
}

export class GenerationLogsRepository {
    constructor(private readonly db: QueryExecutor) {}

    async list(
        input: PageInput & { userId?: string; kind?: GenerationKind; source?: string; status?: GenerationStatus; keyword?: string; startAt?: string; endAt?: string; includeTaskContext?: boolean; executionProfile?: string } = {},
    ): Promise<PageResult<GenerationLogRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        // Channel names and execution profiles are admin-only. User-facing reads keep the plain select.
        const taskContext = input.includeTaskContext
            ? `LEFT JOIN generation_tasks task ON task.id = log.task_id
               LEFT JOIN system_model_channels channel ON channel.id = task.channel_id`
            : "";
        const taskColumns = input.includeTaskContext ? ", task.execution_profile AS task_execution_profile, channel.name AS task_channel_name" : "";
        const profileFilter = input.includeTaskContext ? "AND ($11::text IS NULL OR task.execution_profile = $11)" : "";
        const result = await this.db.query(
            `
            SELECT log.*, count(*) OVER() AS total_count${taskColumns}
            FROM generation_logs log
            ${taskContext}
            WHERE ($1::text IS NULL OR log.user_id = $1)
              AND ($2::text IS NULL OR log.kind = $2)
              AND ($3::text IS NULL OR log.source = $3)
              AND ($4::text IS NULL OR log.status = $4)
              AND ($5 = '' OR lower(log.title) LIKE $6 OR lower(log.prompt) LIKE $6 OR lower(log.model) LIKE $6 OR lower(log.username) LIKE $6 OR lower(log.display_name) LIKE $6 OR lower(log.summary) LIKE $6)
              AND ($7::timestamptz IS NULL OR log.created_at >= $7)
              AND ($8::timestamptz IS NULL OR log.created_at <= $8)
              ${profileFilter}
            ORDER BY log.created_at DESC, log.id ASC
            LIMIT $9 OFFSET $10
            `,
            [
                input.userId || null,
                input.kind || null,
                input.source || null,
                input.status || null,
                keyword,
                `%${keyword}%`,
                input.startAt || null,
                input.endAt || null,
                pageSize,
                (page - 1) * pageSize,
                ...(input.includeTaskContext ? [input.executionProfile || null] : []),
            ],
        );
        const logs = await this.attachAssets(result.rows.map(mapGenerationLog));
        return pageResult(logs, Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async getOverviewAggregate(input: { startAt: string; endAt: string; timeZone: string }): Promise<GenerationLogOverviewAggregate> {
        const result = await this.db.query<Record<string, unknown>>(
            `
            WITH scoped AS MATERIALIZED (
                SELECT
                    user_id,
                    status,
                    coalesce(nullif(btrim(model), ''), '未记录模型') AS model_key,
                    source AS source_key,
                    kind AS kind_key,
                    to_char(created_at AT TIME ZONE $3::text, 'YYYY-MM-DD') AS day_key
                FROM generation_logs
                WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
            )
            SELECT
                count(*)::int AS total_calls,
                count(*) FILTER (WHERE status = 'success')::int AS success_calls,
                count(*) FILTER (WHERE status = 'failed')::int AS failed_calls,
                count(DISTINCT nullif(user_id, ''))::int AS active_users,
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', bucket_key, 'value', bucket_value) ORDER BY bucket_key), '[]'::jsonb)
                    FROM (SELECT day_key AS bucket_key, count(*)::int AS bucket_value FROM scoped GROUP BY day_key) buckets
                ) AS daily,
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', bucket_key, 'value', bucket_value) ORDER BY bucket_value DESC, bucket_key), '[]'::jsonb)
                    FROM (
                        SELECT model_key AS bucket_key, count(*)::int AS bucket_value
                        FROM scoped
                        GROUP BY model_key
                        ORDER BY bucket_value DESC, bucket_key
                        LIMIT 6
                    ) buckets
                ) AS models,
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', bucket_key, 'value', bucket_value) ORDER BY bucket_value DESC, bucket_key), '[]'::jsonb)
                    FROM (SELECT source_key AS bucket_key, count(*)::int AS bucket_value FROM scoped GROUP BY source_key) buckets
                ) AS sources,
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', bucket_key, 'value', bucket_value) ORDER BY bucket_value DESC, bucket_key), '[]'::jsonb)
                    FROM (SELECT kind_key AS bucket_key, count(*)::int AS bucket_value FROM scoped GROUP BY kind_key) buckets
                ) AS kinds
            FROM scoped
            `,
            [input.startAt, input.endAt, input.timeZone],
        );
        const row = result.rows[0] || {};
        return {
            totalCalls: Number(row.total_calls || 0),
            successCalls: Number(row.success_calls || 0),
            failedCalls: Number(row.failed_calls || 0),
            activeUsers: Number(row.active_users || 0),
            daily: overviewBuckets(row.daily),
            models: overviewBuckets(row.models),
            sources: overviewBuckets(row.sources),
            kinds: overviewBuckets(row.kinds),
        };
    }

    /**
     * 生成成功率：一次查询按 kind / channel / executionProfile 分组计数。
     * 渠道与执行环境来自任务的关联表，与调用记录列表同一套 JOIN，保证口径一致。
     */
    async getSuccessRateAggregate(input: { startAt: string; endAt: string }): Promise<GenerationLogSuccessRateAggregate> {
        const result = await this.db.query<Record<string, unknown>>(
            `
            WITH scoped AS MATERIALIZED (
                SELECT
                    log.kind AS kind_key,
                    log.status AS status_key,
                    coalesce(nullif(btrim(channel.name), ''), '未记录渠道') AS channel_key,
                    coalesce(nullif(btrim(task.execution_profile), ''), 'production') AS profile_key,
                    nullif(btrim(coalesce(log.error, '')), '') AS reason_key
                FROM generation_logs log
                LEFT JOIN generation_tasks task ON task.id = log.task_id
                LEFT JOIN system_model_channels channel ON channel.id = task.channel_id
                WHERE log.created_at >= $1::timestamptz AND log.created_at < $2::timestamptz
                  AND log.kind IN ('image', 'video', 'text', 'audio')
            )
            SELECT
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'total', t, 'success', s, 'failed', f, 'pending', p) ORDER BY t DESC, k), '[]'::jsonb)
                    FROM (
                        SELECT
                            kind_key AS k,
                            count(*)::int AS t,
                            count(*) FILTER (WHERE status_key = 'success')::int AS s,
                            count(*) FILTER (WHERE status_key = 'failed')::int AS f,
                            count(*) FILTER (WHERE status_key = 'pending')::int AS p
                        FROM scoped GROUP BY kind_key
                    ) rows
                ) AS kinds,
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'total', t, 'success', s, 'failed', f, 'pending', p) ORDER BY t DESC, k), '[]'::jsonb)
                    FROM (
                        SELECT
                            channel_key AS k,
                            count(*)::int AS t,
                            count(*) FILTER (WHERE status_key = 'success')::int AS s,
                            count(*) FILTER (WHERE status_key = 'failed')::int AS f,
                            count(*) FILTER (WHERE status_key = 'pending')::int AS p
                        FROM scoped GROUP BY channel_key
                    ) rows
                ) AS channels,
                (
                    SELECT coalesce(jsonb_agg(jsonb_build_object('key', k, 'total', t, 'success', s, 'failed', f, 'pending', p) ORDER BY t DESC, k), '[]'::jsonb)
                    FROM (
                        SELECT
                            profile_key AS k,
                            count(*)::int AS t,
                            count(*) FILTER (WHERE status_key = 'success')::int AS s,
                            count(*) FILTER (WHERE status_key = 'failed')::int AS f,
                            count(*) FILTER (WHERE status_key = 'pending')::int AS p
                        FROM scoped GROUP BY profile_key
                    ) rows
                ) AS profiles,
                coalesce((SELECT reason_key FROM scoped WHERE status_key = 'failed' AND reason_key IS NOT NULL GROUP BY reason_key ORDER BY count(*) DESC, reason_key LIMIT 1), '') AS top_reason,
                coalesce((SELECT count(*)::int FROM scoped WHERE status_key = 'failed' AND reason_key = (SELECT reason_key FROM scoped WHERE status_key = 'failed' AND reason_key IS NOT NULL GROUP BY reason_key ORDER BY count(*) DESC, reason_key LIMIT 1)), 0) AS top_reason_count
            `,
            [input.startAt, input.endAt],
        );
        const row = result.rows[0] || {};
        return {
            kinds: successRateGroups(row.kinds),
            channels: successRateGroups(row.channels),
            profiles: successRateGroups(row.profiles),
            topFailureReason: String(row.top_reason || ""),
            topFailureCount: Number(row.top_reason_count || 0),
        };
    }

    async getCreateOverview(userId: string): Promise<GenerationLogCreateOverview> {
        const result = await this.db.query<Record<string, unknown>>(
            `
            WITH running_rows AS (
                SELECT
                    id,
                    kind,
                    source,
                    COALESCE(NULLIF(btrim(title), ''), CASE WHEN kind = 'video' THEN '视频生成' ELSE '图片生成' END) AS title,
                    created_at
                FROM generation_logs
                WHERE user_id = $1 AND status = 'pending'
                ORDER BY created_at DESC
                LIMIT 4
            ),
            asset_candidates AS (
                SELECT
                    CONCAT(log.id, '-', asset.sort_order) AS id,
                    asset.type AS kind,
                    COALESCE(NULLIF(btrim(log.title), ''), CASE WHEN asset.type = 'video' THEN '生成视频' ELSE '生成图片' END) AS title,
                    COALESCE(NULLIF(asset.server_url, ''), NULLIF(asset.url, ''), NULLIF(asset.remote_url, '')) AS url,
                    log.created_at,
                    asset.sort_order
                FROM generation_logs log
                JOIN generation_log_assets asset ON asset.generation_log_id = log.id
                WHERE log.user_id = $1
                  AND log.status = 'success'
                  AND asset.type IN ('image', 'video')
                  AND COALESCE(NULLIF(asset.server_url, ''), NULLIF(asset.url, ''), NULLIF(asset.remote_url, '')) IS NOT NULL
                  AND COALESCE(NULLIF(asset.server_url, ''), NULLIF(asset.url, ''), NULLIF(asset.remote_url, '')) !~* '^(data|blob):'
            ),
            ranked_assets AS (
                SELECT
                    id,
                    kind,
                    title,
                    url,
                    created_at,
                    sort_order,
                    ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_at DESC, sort_order ASC) AS duplicate_rank
                FROM asset_candidates
            ),
            recent_rows AS (
                SELECT id, kind, title, url, created_at, sort_order
                FROM ranked_assets
                WHERE duplicate_rank = 1
                ORDER BY created_at DESC, sort_order ASC
                LIMIT $2::integer
            )
            SELECT
                COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'source', source, 'title', title, 'createdAt', created_at) ORDER BY created_at DESC)
                    FROM running_rows
                ), '[]'::jsonb) AS running_tasks,
                COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'title', title, 'url', url, 'createdAt', created_at) ORDER BY created_at DESC, sort_order ASC)
                    FROM recent_rows
                ), '[]'::jsonb) AS recent_assets
            `,
            [userId, CREATE_OVERVIEW_RECENT_ASSET_LIMIT],
        );
        const row = result.rows[0] || {};
        return {
            runningTasks: jsonObjects(row.running_tasks)
                .flatMap((item): CreateOverviewTask[] => {
                    const id = textValue(item.id);
                    if (!id) return [];
                    return [{ id, kind: item.kind === "video" ? "video" : "image", source: textValue(item.source), title: textValue(item.title), createdAt: isoValue(item.createdAt) }];
                })
                .slice(0, 4),
            recentAssets: jsonObjects(row.recent_assets)
                .flatMap((item): CreateOverviewAsset[] => {
                    const id = textValue(item.id);
                    const url = textValue(item.url);
                    if (!id || !url || /^(data|blob):/i.test(url)) return [];
                    return [{ id, kind: item.kind === "video" ? "video" : "image", title: textValue(item.title), url, createdAt: isoValue(item.createdAt) }];
                })
                .slice(0, CREATE_OVERVIEW_RECENT_ASSET_LIMIT),
        };
    }

    /** Admin trace only. Returns the task row even after diagnostic retention has cleared it. */
    async getTaskTrace(taskId: string) {
        const result = await this.db.query<{ execution_profile: string; channel_id: string | null; diagnostic_events: unknown; diagnostic_expires_at: string | Date | null }>(
            "SELECT execution_profile, channel_id, diagnostic_events, diagnostic_expires_at FROM generation_tasks WHERE id = $1",
            [taskId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            executionProfile: row.execution_profile === "open-source-practice" ? ("open-source-practice" as const) : ("production" as const),
            channelId: row.channel_id || undefined,
            events: Array.isArray(row.diagnostic_events) ? row.diagnostic_events : [],
            diagnosticsExpired: row.diagnostic_expires_at ? new Date(row.diagnostic_expires_at).getTime() <= Date.now() : false,
        };
    }

    async getChannelNames(ids: string[]) {
        const channelIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
        if (!channelIds.length) return new Map<string, string>();
        const result = await this.db.query<{ id: string; name: string }>("SELECT id, name FROM system_model_channels WHERE id = ANY($1::text[])", [channelIds]);
        return new Map(result.rows.map((row) => [row.id, row.name]));
    }

    async getById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM generation_logs WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return (await this.attachAssets(result.rows.map(mapGenerationLog)))[0] || null;
    }

    async getByIds(ids: string[], userId?: string, forUpdate = false) {
        if (!ids.length) return [];
        const result = await this.db.query(`SELECT * FROM generation_logs WHERE id = ANY($1::text[]) AND ($2::text IS NULL OR user_id = $2) ORDER BY created_at DESC, id ASC${forUpdate ? " FOR UPDATE" : ""}`, [ids, userId || null]);
        return this.attachAssets(result.rows.map(mapGenerationLog));
    }

    async listByUserIdBatch(userId: string, batchSize: number, forUpdate = false) {
        const targetUserId = userId.trim();
        if (!targetUserId) return [];
        if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("generation log batch size must be a positive safe integer");
        const result = await this.db.query(
            `SELECT * FROM generation_logs
             WHERE user_id = $1
             ORDER BY created_at DESC, id ASC
             LIMIT $2::integer${forUpdate ? " FOR UPDATE" : ""}`,
            [targetUserId, batchSize],
        );
        return this.attachAssets(result.rows.map(mapGenerationLog));
    }

    async listByUserAndAssetUrls(userId: string, urls: string[]) {
        if (!urls.length) return [];
        const result = await this.db.query(
            `SELECT DISTINCT gl.* FROM generation_logs gl
             JOIN generation_log_assets asset ON asset.generation_log_id = gl.id
             WHERE gl.user_id = $1 AND COALESCE(NULLIF(asset.server_url, ''), asset.url) = ANY($2::text[])
             ORDER BY gl.created_at DESC, gl.id ASC`,
            [userId, urls],
        );
        return this.attachAssets(result.rows.map(mapGenerationLog));
    }

    async upsert(log: GenerationLogRecord) {
        const result = await this.db.query(
            `
            INSERT INTO generation_logs (
                id, user_id, conversation_id, username, display_name, kind, source, status, title, prompt, model, summary,
                duration_ms, count, success_count, fail_count, request_snapshot, task_id, error, created_at, updated_at, completed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, $21, $22)
            ON CONFLICT (id) DO UPDATE SET
                conversation_id = EXCLUDED.conversation_id,
                username = EXCLUDED.username,
                display_name = EXCLUDED.display_name,
                status = EXCLUDED.status,
                title = EXCLUDED.title,
                prompt = EXCLUDED.prompt,
                model = EXCLUDED.model,
                summary = EXCLUDED.summary,
                duration_ms = EXCLUDED.duration_ms,
                count = EXCLUDED.count,
                success_count = EXCLUDED.success_count,
                fail_count = EXCLUDED.fail_count,
                request_snapshot = EXCLUDED.request_snapshot,
                task_id = EXCLUDED.task_id,
                error = EXCLUDED.error,
                completed_at = EXCLUDED.completed_at
            WHERE generation_logs.user_id = EXCLUDED.user_id
            RETURNING *
            `,
            [
                log.id,
                log.userId,
                log.conversationId || null,
                log.username,
                log.displayName,
                log.kind,
                log.source,
                log.status,
                log.title,
                log.prompt,
                log.model,
                log.summary,
                log.durationMs,
                log.count,
                log.successCount,
                log.failCount,
                JSON.stringify(log.requestSnapshot || {}),
                log.taskId || null,
                log.error || null,
                log.createdAt,
                log.updatedAt,
                log.completedAt || null,
            ],
        );
        if (!result.rows[0]) throw new Error("generation log id belongs to another user");
        await this.replaceAssets(log.id, log.assets);
        return { ...mapGenerationLog(result.rows[0]), assets: log.assets };
    }

    async delete(ids: string[]) {
        if (!ids.length) return 0;
        const result = await this.db.query("DELETE FROM generation_logs WHERE id = ANY($1::text[])", [ids]);
        return result.rowCount || 0;
    }

    private async attachAssets(logs: GenerationLogRecord[]) {
        if (!logs.length) return logs;
        const result = await this.db.query("SELECT * FROM generation_log_assets WHERE generation_log_id = ANY($1::text[]) ORDER BY generation_log_id ASC, sort_order ASC", [logs.map((log) => log.id)]);
        const byLogId = new Map<string, GenerationLogAssetRecord[]>();
        for (const row of result.rows) {
            const list = byLogId.get(row.generation_log_id) || [];
            list.push(mapGenerationLogAsset(row));
            byLogId.set(row.generation_log_id, list);
        }
        return logs.map((log) => ({ ...log, assets: byLogId.get(log.id) || [] }));
    }

    private async replaceAssets(logId: string, assets: GenerationLogAssetRecord[]) {
        await this.db.query("DELETE FROM generation_log_assets WHERE generation_log_id = $1", [logId]);
        for (const [index, asset] of assets.entries()) {
            await this.db.query(
                `
                INSERT INTO generation_log_assets (generation_log_id, type, url, remote_url, server_url, mime_type, width, height, bytes, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `,
                [logId, asset.type, asset.url, asset.remoteUrl || null, asset.serverUrl || null, asset.mimeType || null, asset.width || null, asset.height || null, asset.bytes || null, index],
            );
        }
    }
}

function overviewBuckets(value: unknown): GenerationLogOverviewBucket[] {
    const items = typeof value === "string" ? safeJsonArray(value) : value;
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            const source = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
            return { key: String(source.key || "").trim(), value: Math.max(0, Number(source.value) || 0) };
        })
        .filter((item) => Boolean(item.key) && item.value > 0);
}

function successRateGroups(value: unknown): GenerationLogSuccessRateGroup[] {
    const items = typeof value === "string" ? safeJsonArray(value) : value;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
        const source = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        const key = String(source.key || "").trim();
        if (!key) return [];
        const success = Math.max(0, Number(source.success) || 0);
        const failed = Math.max(0, Number(source.failed) || 0);
        const pending = Math.max(0, Number(source.pending) || 0);
        // total 用于排序，不参与成功率分母：分母只含 success + failed。
        return [{ key, total: success + failed + pending, success, failed, pending }];
    });
}

function jsonObjects(value: unknown): Record<string, unknown>[] {
    const items = typeof value === "string" ? safeJsonArray(value) : value;
    return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function textValue(value: unknown) {
    return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
}

function isoValue(value: unknown) {
    const date = value instanceof Date ? value : new Date(textValue(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function safeJsonArray(value: string) {
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
