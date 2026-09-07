import type { QueryExecutor } from "./postgres";
import type {
    IpContentFileCreateInput,
    IpContentFilePatch,
    IpContentFileRecord,
    IpDetailRecord,
    IpDownloadCreateInput,
    IpDownloadRecord,
    IpFileCleanupRecord,
    IpItemInput,
    IpItemRecord,
    IpPackageCreateInput,
    IpPackagePatch,
    IpPackageRecord,
    IpSchoolGrantCreateInput,
    IpSchoolGrantRecord,
    IpSchoolGrantUpdateInput,
    IpSubIpCreateInput,
    IpSubIpDetailRecord,
    IpSubIpPatch,
    IpSubIpRecord,
    IpSummaryRecord,
    IpUsageCreateInput,
    IpUsageRecord,
    PageInput,
    PageResult,
} from "./repository-types";
import { isoValue, jsonParam, jsonValue, normalizePage, normalizePageSize, numberValue, optionalIso, optionalString, pageResult, stringValue } from "./repository-utils";

export type VisibleIpListInput = PageInput & {
    userId: string;
    schoolId?: string;
    scope: "public" | "school";
    keyword?: string;
    kind?: string;
    category?: string;
    tags?: string[];
    at?: string;
};
export type VisibleIpDetailInput = { userId: string; schoolId?: string; ipId: string; subIpId?: string; at?: string };
export type IpUsageListInput = PageInput & { ipId?: string; subIpId?: string; schoolId?: string; userId?: string; action?: string };
export type IpDownloadListInput = PageInput & { ipId?: string; subIpId?: string; schoolId?: string; userId?: string; downloadType?: string; result?: string };
export type AdminIpListInput = PageInput & { keyword?: string; status?: string; visibility?: string };
export type IpGrantListInput = PageInput & { ipId?: string; subIpId?: string; grantId?: string; schoolId?: string; status?: string };
export type IpGrantConflictInput = { ipId: string; subIpId: string; schoolId: string; mode: string; startsAt: string; endsAt?: string; excludeGrantId?: string };
type TransactionRunner = <T>(operation: (db: QueryExecutor) => Promise<T>) => Promise<T>;

export class IpLibraryRepository {
    constructor(
        private readonly db: QueryExecutor,
        private readonly transaction: TransactionRunner = (operation) => operation(db),
    ) {}

    async getIpPackage(ipId: string): Promise<IpPackageRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_packages WHERE id = $1", [ipId]);
        return result.rows[0] ? mapPackage(result.rows[0]) : null;
    }

    async getIpPackageBySlug(slug: string, excludeIpId?: string): Promise<IpPackageRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_packages WHERE lower(slug) = lower($1) AND ($2::text IS NULL OR id <> $2) LIMIT 1", [slug, excludeIpId || null]);
        return result.rows[0] ? mapPackage(result.rows[0]) : null;
    }

    async createIpPackage(input: IpPackageCreateInput): Promise<IpPackageRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_packages (id, title, slug, summary, cover_file_id, visibility, status, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [input.id, input.title, input.slug, input.summary, input.coverFileId || null, input.visibility, input.status, input.createdByUserId || null],
        );
        return mapPackage(result.rows[0]);
    }

    async updateIpPackage(ipId: string, patch: IpPackagePatch): Promise<IpPackageRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_packages SET title = COALESCE($2, title), slug = COALESCE($3, slug), summary = COALESCE($4, summary),
                cover_file_id = CASE WHEN $5 THEN $6 ELSE cover_file_id END, visibility = COALESCE($7, visibility), status = COALESCE($8, status)
             WHERE id = $1 RETURNING *`,
            [ipId, patch.title || null, patch.slug || null, patch.summary ?? null, patch.coverFileId !== undefined, patch.coverFileId || null, patch.visibility || null, patch.status || null],
        );
        return result.rows[0] ? mapPackage(result.rows[0]) : null;
    }

    async listIpPackages(input: AdminIpListInput = {}): Promise<PageResult<IpSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [input.keyword?.trim() || null, input.status || null, input.visibility || null, pageSize, (page - 1) * pageSize];
        const where = `($1::text IS NULL OR package.title ILIKE '%' || $1 || '%' OR package.summary ILIKE '%' || $1 || '%' OR package.slug ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR package.status = $2) AND ($3::text IS NULL OR package.visibility = $3)`;
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_packages AS package WHERE ${where}`, values.slice(0, 3));
        const result = await this.db.query(
            `SELECT package.*, COUNT(sub_ip.id)::integer AS sub_ip_count,
                    COALESCE((array_agg(sub_ip.id ORDER BY sub_ip.sort_order, sub_ip.created_at, sub_ip.id) FILTER (WHERE sub_ip.cover_file_id IS NOT NULL))[1],
                             (array_agg(sub_ip.id ORDER BY sub_ip.sort_order, sub_ip.created_at, sub_ip.id))[1]) AS cover_sub_ip_id,
                    COALESCE((array_agg(sub_ip.cover_file_id ORDER BY sub_ip.sort_order, sub_ip.created_at, sub_ip.id) FILTER (WHERE sub_ip.cover_file_id IS NOT NULL))[1], package.cover_file_id) AS summary_cover_file_id
             FROM ip_packages AS package LEFT JOIN ip_sub_ips AS sub_ip ON sub_ip.ip_id = package.id
             WHERE ${where} GROUP BY package.id ORDER BY package.updated_at DESC, package.id LIMIT $4 OFFSET $5`,
            values,
        );
        return pageResult(result.rows.map(mapSummary), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async getIpDetail(ipId: string): Promise<IpDetailRecord | null> {
        const packageRecord = await this.getIpPackage(ipId);
        if (!packageRecord) return null;
        return { ...packageRecord, subIps: await this.listSubIpDetails(ipId) };
    }

    async deleteIpPackage(ipId: string): Promise<IpContentFileRecord[] | "has-school-grants" | null> {
        return this.withIpPackageLock(ipId, async (db) => {
            const found = await db.query("SELECT id FROM ip_packages WHERE id = $1", [ipId]);
            if (!found.rows[0]) return null;
            const grants = await db.query("SELECT id FROM ip_school_grants WHERE ip_id = $1 LIMIT 1 FOR UPDATE", [ipId]);
            if (grants.rows[0]) return "has-school-grants";
            const files = await db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 FOR UPDATE", [ipId]);
            await enqueueFiles(db, files.rows);
            await db.query("DELETE FROM ip_packages WHERE id = $1", [ipId]);
            return files.rows.map(mapContentFile);
        });
    }

    async getIpSubIp(ipId: string, subIpId: string): Promise<IpSubIpDetailRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_sub_ips WHERE ip_id = $1 AND id = $2", [ipId, subIpId]);
        return result.rows[0] ? { ...mapSubIp(result.rows[0]), items: await this.listSubIpItems(subIpId) } : null;
    }

    async createIpSubIp(ipId: string, input: IpSubIpCreateInput): Promise<IpSubIpDetailRecord> {
        return this.withIpPackageLock(ipId, async (db) => {
            const result = await db.query(
                `INSERT INTO ip_sub_ips (id, ip_id, title, summary, cover_file_id, tags_json, source_note, sort_order, created_by_user_id)
                 SELECT $2, package.id, $3, $4, $5, $6::jsonb, $7, COALESCE($8, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM ip_sub_ips WHERE ip_id = package.id)), $9
                 FROM ip_packages AS package WHERE package.id = $1 RETURNING *`,
                [ipId, input.id, input.title, input.summary, input.coverFileId || null, jsonParam(input.tags), input.sourceNote, input.sortOrder ?? null, input.createdByUserId || null],
            );
            if (!result.rows[0]) throw new Error("IP 不存在");
            return { ...mapSubIp(result.rows[0]), items: [] };
        });
    }

    async updateIpSubIp(ipId: string, subIpId: string, patch: IpSubIpPatch): Promise<IpSubIpRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_sub_ips SET title = COALESCE($3, title), summary = COALESCE($4, summary),
                cover_file_id = CASE WHEN $5 THEN $6 ELSE cover_file_id END, tags_json = CASE WHEN $7 THEN $8::jsonb ELSE tags_json END,
                source_note = COALESCE($9, source_note), sort_order = COALESCE($10, sort_order)
             WHERE ip_id = $1 AND id = $2 RETURNING *`,
            [ipId, subIpId, patch.title || null, patch.summary ?? null, patch.coverFileId !== undefined, patch.coverFileId || null, patch.tags !== undefined, jsonParam(patch.tags || []), patch.sourceNote ?? null, patch.sortOrder ?? null],
        );
        return result.rows[0] ? mapSubIp(result.rows[0]) : null;
    }

    async deleteIpSubIp(ipId: string, subIpId: string): Promise<IpContentFileRecord[] | "last-sub-ip" | null> {
        return this.withIpPackageLock(ipId, async (db) => {
            const sub = await db.query("SELECT id FROM ip_sub_ips WHERE ip_id = $1 AND id = $2 FOR UPDATE", [ipId, subIpId]);
            if (!sub.rows[0]) return null;
            const remaining = await db.query("SELECT id FROM ip_sub_ips WHERE ip_id = $1 AND id <> $2 LIMIT 1", [ipId, subIpId]);
            if (!remaining.rows[0]) return "last-sub-ip";
            const files = await db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 AND sub_ip_id = $2 FOR UPDATE", [ipId, subIpId]);
            await enqueueFiles(db, files.rows);
            await db.query("DELETE FROM ip_sub_ips WHERE ip_id = $1 AND id = $2", [ipId, subIpId]);
            return files.rows.map(mapContentFile);
        });
    }

    async replaceIpSubIpItems(ipId: string, subIpId: string, items: IpItemInput[]): Promise<IpItemRecord[] | null> {
        const requested = items.map((item) => ({ ...item }));
        return this.withIpPackageLock(ipId, async (db) => {
            const target = await db.query("SELECT id FROM ip_sub_ips WHERE ip_id = $1 AND id = $2 FOR UPDATE", [ipId, subIpId]);
            if (!target.rows[0]) return null;
            const valid = await db.query(
                `SELECT COUNT(*)::integer AS count FROM jsonb_to_recordset($3::jsonb) AS item(file_id text, kind text)
                 JOIN ip_content_files AS file ON file.id = item.file_id AND file.ip_id = $1 AND file.sub_ip_id = $2 AND file.kind = item.kind AND file.status = 'ready'`,
                [ipId, subIpId, jsonParam(requested.map((item) => ({ file_id: item.fileId, kind: item.kind })) as never)],
            );
            if (numberValue(valid.rows[0]?.count) !== requested.length) throw new Error("IP 内容文件不存在、跨子 IP、类型不匹配或尚未就绪");
            await db.query("DELETE FROM ip_items WHERE sub_ip_id = $1", [subIpId]);
            if (!requested.length) return [];
            const values: unknown[] = [];
            const rows = requested.map((item, index) => {
                const offset = values.length;
                values.push(item.id, subIpId, item.kind, item.category, item.title, item.summary, item.fileId, item.sortOrder ?? index);
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
            });
            const inserted = await db.query(`INSERT INTO ip_items (id, sub_ip_id, kind, category, title, summary, file_id, sort_order) VALUES ${rows.join(", ")} RETURNING *`, values);
            return inserted.rows.map(mapItem);
        });
    }

    async createIpContentFile(input: IpContentFileCreateInput): Promise<IpContentFileRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_content_files (id, ip_id, sub_ip_id, kind, original_name, extension, mime_type, byte_size, sha256, storage_provider, storage_key, external_storage_id, external_object_key, extracted_text, metadata_json, status, error_message, uploaded_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
            [
                input.id,
                input.ipId,
                input.subIpId,
                input.kind,
                input.originalName,
                input.extension,
                input.mimeType,
                input.byteSize,
                input.sha256,
                input.storageProvider,
                input.storageKey,
                input.externalStorageId || null,
                input.externalObjectKey || null,
                input.extractedText || null,
                jsonParam(input.metadata),
                input.status,
                input.errorMessage || null,
                input.uploadedByUserId || null,
            ],
        );
        return mapContentFile(result.rows[0]);
    }

    async getIpContentFile(ipId: string, fileId: string, subIpId?: string): Promise<IpContentFileRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 AND id = $2 AND ($3::text IS NULL OR sub_ip_id = $3)", [ipId, fileId, subIpId || null]);
        return result.rows[0] ? mapContentFile(result.rows[0]) : null;
    }

    async listIpContentFiles(ipId: string, subIpId?: string): Promise<IpContentFileRecord[]> {
        const result = await this.db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 AND ($2::text IS NULL OR sub_ip_id = $2) ORDER BY created_at, id", [ipId, subIpId || null]);
        return result.rows.map(mapContentFile);
    }

    async updateIpContentFile(ipId: string, fileId: string, patch: IpContentFilePatch): Promise<IpContentFileRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_content_files SET status = CASE WHEN $3 THEN $4 ELSE status END, error_message = CASE WHEN $5 THEN $6 ELSE error_message END,
                metadata_json = CASE WHEN $7 THEN $8::jsonb ELSE metadata_json END, extracted_text = CASE WHEN $9 THEN $10 ELSE extracted_text END
             WHERE ip_id = $1 AND id = $2 AND status <> 'deleting' RETURNING *`,
            [
                ipId,
                fileId,
                patch.status !== undefined,
                patch.status || null,
                patch.errorMessage !== undefined,
                patch.errorMessage || null,
                patch.metadata !== undefined,
                jsonParam(patch.metadata || {}),
                patch.extractedText !== undefined,
                patch.extractedText || null,
            ],
        );
        return result.rows[0] ? mapContentFile(result.rows[0]) : null;
    }

    async claimIpContentFileDeletion(ipId: string, fileId: string): Promise<IpContentFileRecord | null> {
        return this.withIpPackageLock(ipId, async (db) => {
            const file = await db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 AND id = $2 FOR UPDATE", [ipId, fileId]);
            if (!file.rows[0]) return null;
            const referenced = await db.query(`SELECT EXISTS (SELECT 1 FROM ip_packages WHERE cover_file_id = $1) OR EXISTS (SELECT 1 FROM ip_sub_ips WHERE cover_file_id = $1) OR EXISTS (SELECT 1 FROM ip_items WHERE file_id = $1) AS referenced`, [
                fileId,
            ]);
            if (referenced.rows[0]?.referenced === true) return null;
            const marked = await db.query("UPDATE ip_content_files SET status = 'deleting', error_message = NULL WHERE ip_id = $1 AND id = $2 AND status <> 'deleting' RETURNING *", [ipId, fileId]);
            return marked.rows[0] ? mapContentFile(marked.rows[0]) : mapContentFile(file.rows[0]);
        });
    }

    async finalizeIpContentFileDeletion(ipId: string, fileId: string): Promise<boolean> {
        const result = await this.db.query("DELETE FROM ip_content_files WHERE ip_id = $1 AND id = $2 AND status = 'deleting' RETURNING id", [ipId, fileId]);
        return Boolean(result.rows[0]);
    }

    async listVisibleIps(input: VisibleIpListInput): Promise<PageResult<IpSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        if (input.scope === "school" && !input.schoolId) return pageResult([], 0, page, pageSize);
        const rows = await this.visibleSubIpRows(input);
        const grouped = new Map<string, IpSummaryRecord>();
        for (const row of rows) {
            const current = grouped.get(stringValue(row.id));
            const summary = mapSummary(row);
            if (!current) grouped.set(summary.id, { ...summary, subIpCount: 1, accessibleSubIpCount: 1 });
            else {
                current.subIpCount += 1;
                current.accessibleSubIpCount = current.subIpCount;
                if (!current.coverFileId && summary.coverFileId) {
                    current.coverFileId = summary.coverFileId;
                    current.coverSubIpId = summary.coverSubIpId;
                }
            }
        }
        const items = [...grouped.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
        return pageResult(items.slice((page - 1) * pageSize, page * pageSize), items.length, page, pageSize);
    }

    async getVisibleIp(input: VisibleIpDetailInput): Promise<IpDetailRecord | null> {
        const packageRecord = await this.getIpPackage(input.ipId);
        if (!packageRecord || packageRecord.status !== "enabled") return null;
        const subRows = await this.visibleSubIpRows({ userId: input.userId, schoolId: input.schoolId, scope: packageRecord.visibility, ipId: input.ipId } as VisibleIpListInput, input.subIpId);
        if (!subRows.length) return null;
        return {
            ...packageRecord,
            subIps: await Promise.all(
                subRows.map(async (row) => ({ ...mapSubIp(row), items: await this.listSubIpItems(stringValue(row.sub_ip_id)), ...(optionalString(row.grant_mode) ? { grantMode: optionalString(row.grant_mode) as "multi_school" | "exclusive" } : {}) })),
            ),
        };
    }

    async createSchoolGrant(input: IpSchoolGrantCreateInput): Promise<IpSchoolGrantRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_school_grants (id, ip_id, sub_ip_id, school_id, mode, status, starts_at, ends_at, note, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [input.id, input.ipId, input.subIpId, input.schoolId, input.mode, input.status, input.startsAt, input.endsAt || null, input.note, input.createdByUserId || null],
        );
        return mapGrant(result.rows[0]);
    }

    async findConflictingSchoolGrant(input: IpGrantConflictInput): Promise<IpSchoolGrantRecord | null> {
        const result = await this.db.query(
            `SELECT * FROM ip_school_grants WHERE sub_ip_id = $1 AND status = 'active' AND ($6::text IS NULL OR id <> $6)
               AND (school_id = $2 OR mode = 'exclusive' OR $3::text = 'exclusive')
               AND tstzrange(starts_at, COALESCE(ends_at, 'infinity'::timestamptz), '[)') && tstzrange($4::timestamptz, COALESCE($5::timestamptz, 'infinity'::timestamptz), '[)')
             ORDER BY starts_at, id LIMIT 1`,
            [input.subIpId, input.schoolId, input.mode, input.startsAt, input.endsAt || null, input.excludeGrantId || null],
        );
        return result.rows[0] ? mapGrant(result.rows[0]) : null;
    }

    async updateSchoolGrant(ipId: string, grantId: string, patch: IpSchoolGrantUpdateInput): Promise<IpSchoolGrantRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_school_grants SET status = COALESCE($3, status), ends_at = CASE WHEN $4 THEN $5::timestamptz ELSE ends_at END,
                note = COALESCE($6, note), updated_at = $7::timestamptz WHERE ip_id = $1 AND id = $2 RETURNING *`,
            [ipId, grantId, patch.status || null, patch.endsAt !== undefined, patch.endsAt ?? null, patch.note ?? null, patch.updatedAt],
        );
        return result.rows[0] ? mapGrant(result.rows[0]) : null;
    }

    async listSchoolGrants(input: IpGrantListInput = {}): Promise<PageResult<IpSchoolGrantRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [input.ipId || null, input.subIpId || null, input.grantId || null, input.schoolId || null, input.status || null, pageSize, (page - 1) * pageSize];
        const where = "($1::text IS NULL OR ip_id = $1) AND ($2::text IS NULL OR sub_ip_id = $2) AND ($3::text IS NULL OR id = $3) AND ($4::text IS NULL OR school_id = $4) AND ($5::text IS NULL OR status = $5)";
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_school_grants WHERE ${where}`, values.slice(0, 5));
        const result = await this.db.query(`SELECT * FROM ip_school_grants WHERE ${where} ORDER BY created_at DESC, id LIMIT $6 OFFSET $7`, values);
        return pageResult(result.rows.map(mapGrant), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async recordIpDownload(input: IpDownloadCreateInput): Promise<IpDownloadRecord> {
        const result = await this.db.query("INSERT INTO ip_download_records (id, ip_id, sub_ip_id, item_id, school_id, user_id, download_type, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *", [
            input.id,
            input.ipId,
            input.subIpId,
            input.itemId || null,
            input.schoolId || null,
            input.userId,
            input.downloadType,
            input.result,
        ]);
        return mapDownload(result.rows[0]);
    }

    async listIpDownloads(input: IpDownloadListInput = {}): Promise<PageResult<IpDownloadRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [input.ipId || null, input.subIpId || null, input.schoolId || null, input.userId || null, input.downloadType || null, input.result || null, pageSize, (page - 1) * pageSize];
        const where =
            "($1::text IS NULL OR ip_id = $1) AND ($2::text IS NULL OR sub_ip_id = $2) AND ($3::text IS NULL OR school_id = $3) AND ($4::text IS NULL OR user_id = $4) AND ($5::text IS NULL OR download_type = $5) AND ($6::text IS NULL OR result = $6)";
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_download_records WHERE ${where}`, values.slice(0, 6));
        const result = await this.db.query(`SELECT * FROM ip_download_records WHERE ${where} ORDER BY created_at DESC, id LIMIT $7 OFFSET $8`, values);
        return pageResult(result.rows.map(mapDownload), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async recordIpUsage(input: IpUsageCreateInput): Promise<IpUsageRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_usage_records (id, ip_id, sub_ip_id, item_ids_json, school_id, user_id, action, target_type, target_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
             WHERE ip_usage_records.ip_id = EXCLUDED.ip_id AND ip_usage_records.sub_ip_id = EXCLUDED.sub_ip_id AND ip_usage_records.item_ids_json = EXCLUDED.item_ids_json
               AND ip_usage_records.school_id IS NOT DISTINCT FROM EXCLUDED.school_id AND ip_usage_records.user_id = EXCLUDED.user_id AND ip_usage_records.action = EXCLUDED.action
               AND ip_usage_records.target_type = EXCLUDED.target_type AND ip_usage_records.target_id = EXCLUDED.target_id RETURNING *`,
            [input.id, input.ipId, input.subIpId, jsonParam(input.itemIds), input.schoolId || null, input.userId, input.action, input.targetType, input.targetId],
        );
        if (!result.rows[0]) throw new Error("IP 使用记录冲突");
        return mapUsage(result.rows[0]);
    }

    async recordIpUsages(inputs: IpUsageCreateInput[]): Promise<IpUsageRecord[]> {
        return Promise.all(inputs.map((input) => this.recordIpUsage(input)));
    }

    async listIpUsage(input: IpUsageListInput = {}): Promise<PageResult<IpUsageRecord>> {
        return this.listRecords("ip_usage_records", input, mapUsage);
    }

    async listIpFileCleanupQueue(): Promise<IpFileCleanupRecord[]> {
        const result = await this.db.query("SELECT * FROM ip_file_cleanup_queue ORDER BY created_at, id");
        return result.rows.map(mapCleanupFile);
    }

    async removeIpFileCleanupQueueRecord(id: string): Promise<boolean> {
        const result = await this.db.query("DELETE FROM ip_file_cleanup_queue WHERE id = $1 RETURNING id", [id]);
        return Boolean(result.rows[0]);
    }

    private async listSubIpDetails(ipId: string): Promise<IpSubIpDetailRecord[]> {
        const result = await this.db.query("SELECT * FROM ip_sub_ips WHERE ip_id = $1 ORDER BY sort_order, created_at, id", [ipId]);
        return Promise.all(result.rows.map(async (row) => ({ ...mapSubIp(row), items: await this.listSubIpItems(stringValue(row.id)) })));
    }

    private async listSubIpItems(subIpId: string): Promise<IpItemRecord[]> {
        const result = await this.db.query("SELECT * FROM ip_items WHERE sub_ip_id = $1 ORDER BY sort_order, created_at, id", [subIpId]);
        return result.rows.map(mapItem);
    }

    private async visibleSubIpRows(input: VisibleIpListInput, onlySubIpId?: string) {
        const at = input.at || new Date().toISOString();
        const tags = input.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) || [];
        const school = input.scope === "school";
        const result = await this.db.query(
            `SELECT package.*, sub_ip.id AS sub_ip_id, sub_ip.ip_id AS sub_ip_ip_id, sub_ip.title AS sub_ip_title, sub_ip.summary AS sub_ip_summary, sub_ip.cover_file_id AS sub_ip_cover_file_id,
                    sub_ip.tags_json AS sub_ip_tags_json, sub_ip.source_note AS sub_ip_source_note, sub_ip.sort_order AS sub_ip_sort_order, sub_ip.created_by_user_id AS sub_ip_created_by_user_id,
                    sub_ip.created_at AS sub_ip_created_at, sub_ip.updated_at AS sub_ip_updated_at, school_grant.mode AS grant_mode
             FROM ip_packages AS package
             JOIN users AS account ON account.id = $1 AND account.status = 'active'
             JOIN ip_sub_ips AS sub_ip ON sub_ip.ip_id = package.id
             LEFT JOIN school_memberships AS membership ON membership.school_id = $2 AND membership.user_id = $1 AND membership.status = 'active'
             LEFT JOIN schools AS school ON school.id = $2 AND school.status = 'active'
             LEFT JOIN ip_school_grants AS school_grant ON school_grant.sub_ip_id = sub_ip.id AND school_grant.school_id = $2 AND school_grant.status = 'active'
                AND school_grant.starts_at <= $3::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $3::timestamptz)
             WHERE package.status = 'enabled' AND (($4::boolean = false AND package.visibility = 'public') OR ($4::boolean = true AND package.visibility = 'school' AND membership.user_id IS NOT NULL AND school.id IS NOT NULL AND school_grant.id IS NOT NULL))
               AND ($5::text IS NULL OR package.id = $5) AND ($6::text IS NULL OR sub_ip.id = $6)
               AND ($7::text IS NULL OR package.title ILIKE '%' || $7 || '%' OR package.summary ILIKE '%' || $7 || '%' OR sub_ip.title ILIKE '%' || $7 || '%' OR sub_ip.summary ILIKE '%' || $7 || '%')
               AND (($8::text IS NULL AND $9::text IS NULL) OR EXISTS (SELECT 1 FROM ip_items AS item WHERE item.sub_ip_id = sub_ip.id AND ($8::text IS NULL OR item.kind = $8) AND ($9::text IS NULL OR item.category = $9)))
               AND ($10::text[] IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(sub_ip.tags_json) AS tag(value) WHERE lower(tag.value) = ANY($10::text[])))
             ORDER BY package.updated_at DESC, package.id, sub_ip.sort_order, sub_ip.created_at, sub_ip.id`,
            [input.userId, input.schoolId || null, at, school, (input as VisibleIpListInput & { ipId?: string }).ipId || null, onlySubIpId || null, input.keyword?.trim() || null, input.kind || null, input.category || null, tags.length ? tags : null],
        );
        return result.rows;
    }

    private async listRecords<T extends IpDownloadRecord | IpUsageRecord>(
        table: "ip_download_records" | "ip_usage_records",
        input: { ipId?: string; subIpId?: string; schoolId?: string; userId?: string; page?: number; pageSize?: number },
        mapper: (row: Record<string, unknown>) => T,
    ): Promise<PageResult<T>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [input.ipId || null, input.subIpId || null, input.schoolId || null, input.userId || null, pageSize, (page - 1) * pageSize];
        const where = "($1::text IS NULL OR ip_id = $1) AND ($2::text IS NULL OR sub_ip_id = $2) AND ($3::text IS NULL OR school_id = $3) AND ($4::text IS NULL OR user_id = $4)";
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table} WHERE ${where}`, values.slice(0, 4));
        const result = await this.db.query(`SELECT * FROM ${table} WHERE ${where} ORDER BY created_at DESC, id LIMIT $5 OFFSET $6`, values);
        return pageResult(result.rows.map(mapper), numberValue(count.rows[0]?.count), page, pageSize);
    }

    private async withIpPackageLock<T>(ipId: string, operation: (db: QueryExecutor) => Promise<T>): Promise<T> {
        return this.transaction(async (db) => {
            await db.query("SELECT id FROM ip_packages WHERE id = $1 FOR UPDATE", [ipId]);
            return operation(db);
        });
    }
}

async function enqueueFiles(db: QueryExecutor, rows: Record<string, unknown>[]) {
    for (const row of rows) {
        await db.query("INSERT INTO ip_file_cleanup_queue (id, storage_provider, storage_key, external_storage_id, external_object_key) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [
            row.id,
            row.storage_provider,
            row.storage_key,
            row.external_storage_id || null,
            row.external_object_key || null,
        ]);
    }
}

function mapPackage(row: Record<string, unknown>): IpPackageRecord {
    return {
        id: stringValue(row.id),
        title: stringValue(row.title),
        slug: stringValue(row.slug),
        summary: stringValue(row.summary),
        coverFileId: optionalString(row.cover_file_id),
        visibility: row.visibility === "school" ? "school" : "public",
        status: row.status === "disabled" ? "disabled" : "enabled",
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapSummary(row: Record<string, unknown>): IpSummaryRecord {
    const subIpId = optionalString(row.sub_ip_id) || optionalString(row.cover_sub_ip_id);
    const coverFileId = optionalString(row.sub_ip_cover_file_id) || optionalString(row.summary_cover_file_id) || optionalString(row.cover_file_id);
    return { ...mapPackage(row), subIpCount: numberValue(row.sub_ip_count) || 1, accessibleSubIpCount: numberValue(row.accessible_sub_ip_count) || undefined, coverSubIpId: subIpId, ...(coverFileId ? { coverFileId } : {}) };
}
function mapSubIp(row: Record<string, unknown>): IpSubIpRecord {
    const tags = jsonValue(row.sub_ip_tags_json ?? row.tags_json);
    return {
        id: stringValue(row.sub_ip_id ?? row.id),
        ipId: stringValue(row.sub_ip_ip_id ?? row.ip_id),
        title: stringValue(row.sub_ip_title ?? row.title),
        summary: stringValue(row.sub_ip_summary ?? row.summary),
        coverFileId: optionalString(row.sub_ip_cover_file_id ?? row.cover_file_id),
        tags: Array.isArray(tags) ? tags.filter((item): item is string => typeof item === "string") : [],
        sourceNote: stringValue(row.sub_ip_source_note ?? row.source_note),
        sortOrder: numberValue(row.sub_ip_sort_order ?? row.sort_order),
        createdByUserId: optionalString(row.sub_ip_created_by_user_id ?? row.created_by_user_id),
        createdAt: isoValue(row.sub_ip_created_at ?? row.created_at),
        updatedAt: isoValue(row.sub_ip_updated_at ?? row.updated_at),
    };
}
function mapItem(row: Record<string, unknown>): IpItemRecord {
    return {
        id: stringValue(row.id),
        subIpId: stringValue(row.sub_ip_id),
        kind: row.kind === "image" || row.kind === "audio" || row.kind === "video" ? row.kind : "text",
        category: stringValue(row.category) as IpItemRecord["category"],
        title: stringValue(row.title),
        summary: stringValue(row.summary),
        fileId: stringValue(row.file_id),
        sortOrder: numberValue(row.sort_order),
        createdAt: isoValue(row.created_at),
    };
}
function mapGrant(row: Record<string, unknown>): IpSchoolGrantRecord {
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        subIpId: stringValue(row.sub_ip_id),
        schoolId: stringValue(row.school_id),
        mode: row.mode === "exclusive" ? "exclusive" : "multi_school",
        status: row.status === "suspended" || row.status === "revoked" || row.status === "expired" ? row.status : "active",
        startsAt: isoValue(row.starts_at),
        endsAt: optionalIso(row.ends_at),
        note: stringValue(row.note),
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapContentFile(row: Record<string, unknown>): IpContentFileRecord {
    const value = jsonValue(row.metadata_json);
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const metadata: IpContentFileRecord["metadata"] = {};
    if (typeof raw.width === "number") metadata.width = raw.width;
    if (typeof raw.height === "number") metadata.height = raw.height;
    if (typeof raw.durationSeconds === "number") metadata.durationSeconds = raw.durationSeconds;
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        subIpId: stringValue(row.sub_ip_id),
        kind: row.kind === "image" || row.kind === "audio" || row.kind === "video" ? row.kind : "text",
        originalName: stringValue(row.original_name),
        extension: stringValue(row.extension),
        mimeType: stringValue(row.mime_type),
        byteSize: numberValue(row.byte_size),
        sha256: stringValue(row.sha256),
        storageProvider: row.storage_provider === "object" ? "object" : "local",
        storageKey: stringValue(row.storage_key),
        externalStorageId: optionalString(row.external_storage_id),
        externalObjectKey: optionalString(row.external_object_key),
        extractedText: optionalString(row.extracted_text),
        metadata,
        status: row.status === "ready" || row.status === "failed" || row.status === "deleting" ? row.status : "processing",
        errorMessage: optionalString(row.error_message),
        uploadedByUserId: optionalString(row.uploaded_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapDownload(row: Record<string, unknown>): IpDownloadRecord {
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        subIpId: stringValue(row.sub_ip_id),
        itemId: optionalString(row.item_id),
        schoolId: optionalString(row.school_id),
        userId: stringValue(row.user_id),
        downloadType: row.download_type === "package" ? "package" : "item",
        result: row.result === "failed" ? "failed" : "succeeded",
        createdAt: isoValue(row.created_at),
    };
}
function mapUsage(row: Record<string, unknown>): IpUsageRecord {
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        subIpId: stringValue(row.sub_ip_id),
        itemIds: Array.isArray(row.item_ids_json) ? row.item_ids_json.filter((item): item is string => typeof item === "string") : [],
        schoolId: optionalString(row.school_id),
        userId: stringValue(row.user_id),
        action: row.action === "download_item" || row.action === "download_package" ? row.action : "reference",
        targetType: row.target_type === "drama" || row.target_type === "practice" || row.target_type === "download" ? row.target_type : "canvas",
        createdAt: isoValue(row.created_at),
        targetId: stringValue(row.target_id),
    };
}
function mapCleanupFile(row: Record<string, unknown>): IpFileCleanupRecord {
    return {
        id: stringValue(row.id),
        storageProvider: row.storage_provider === "object" ? "object" : "local",
        storageKey: stringValue(row.storage_key),
        externalStorageId: optionalString(row.external_storage_id),
        externalObjectKey: optionalString(row.external_object_key),
        createdAt: isoValue(row.created_at),
    };
}
