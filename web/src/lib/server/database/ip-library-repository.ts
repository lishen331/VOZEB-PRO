import type { QueryExecutor } from "./postgres";
import type {
    IpContentFileCreateInput,
    IpContentFilePatch,
    IpContentFileRecord,
    IpDetailRecord,
    IpDownloadCreateInput,
    IpDownloadRecord,
    IpDraftVersionInput,
    IpItemRecord,
    IpPackageCreateInput,
    IpPackagePatch,
    IpPackageRecord,
    IpSchoolGrantCreateInput,
    IpSchoolGrantRecord,
    IpSchoolGrantUpdateInput,
    IpSummaryRecord,
    IpUsageCreateInput,
    IpUsageRecord,
    IpVersionRecord,
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
    at?: string;
};

export type VisibleIpDetailInput = { userId: string; schoolId?: string; ipId: string; versionId?: string; at?: string };
export type IpUsageListInput = PageInput & { ipId?: string; versionId?: string; schoolId?: string; userId?: string; action?: string };
export type IpDownloadListInput = PageInput & { ipId?: string; versionId?: string; schoolId?: string; userId?: string; downloadType?: string; result?: string };
export type AdminIpListInput = PageInput & { keyword?: string; status?: string; visibility?: string };
export type IpGrantListInput = PageInput & { ipId?: string; grantId?: string; schoolId?: string; status?: string };

export class IpLibraryRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getIpPackage(ipId: string): Promise<IpPackageRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_packages WHERE id = $1", [ipId]);
        return result.rows[0] ? mapPackage(result.rows[0]) : null;
    }

    async createIpPackage(input: IpPackageCreateInput): Promise<IpPackageRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_packages (id, title, slug, summary, cover_asset_id, visibility, authorization_mode, status, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [input.id, input.title, input.slug, input.summary, input.coverAssetId || null, input.visibility, input.authorizationMode, input.status, input.createdByUserId || null],
        );
        return mapPackage(result.rows[0]);
    }

    async listIpPackages(input: AdminIpListInput = {}): Promise<PageResult<IpSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [input.keyword?.trim() || null, input.status || null, input.visibility || null];
        const where = `($1::text IS NULL OR package.title ILIKE '%' || $1 || '%' OR package.summary ILIKE '%' || $1 || '%' OR package.slug ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR package.status = $2) AND ($3::text IS NULL OR package.visibility = $3)`;
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_packages AS package WHERE ${where}`, values);
        values.push(pageSize, (page - 1) * pageSize);
        const result = await this.db.query(
            `SELECT package.*, COALESCE(version.version_number, 0) AS version_number,
                    COALESCE((SELECT COUNT(*)::integer FROM ip_items AS item WHERE item.version_id = version.id), 0) AS item_count
             FROM ip_packages AS package LEFT JOIN ip_versions AS version ON version.id = package.current_version_id
             WHERE ${where} ORDER BY package.updated_at DESC, package.id LIMIT $4 OFFSET $5`,
            values,
        );
        return pageResult(result.rows.map(mapSummary), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async updateIpPackage(ipId: string, patch: IpPackagePatch): Promise<IpPackageRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_packages AS package SET
                title = COALESCE($2, title), slug = COALESCE($3, slug), summary = COALESCE($4, summary),
                cover_asset_id = CASE WHEN $5 THEN $6 ELSE cover_asset_id END,
                visibility = COALESCE($7, visibility), authorization_mode = COALESCE($8, authorization_mode), status = COALESCE($9, status)
             WHERE id = $1 AND (
                NOT EXISTS (SELECT 1 FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id)
                OR (COALESCE($7, visibility) = visibility AND COALESCE($8, authorization_mode) = authorization_mode)
             ) RETURNING *`,
            [ipId, patch.title || null, patch.slug || null, patch.summary ?? null, patch.coverAssetId !== undefined, patch.coverAssetId || null, patch.visibility || null, patch.authorizationMode || null, patch.status || null],
        );
        return result.rows[0] ? mapPackage(result.rows[0]) : null;
    }

    async createIpContentFile(input: IpContentFileCreateInput): Promise<IpContentFileRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_content_files (
                id, ip_id, kind, original_name, extension, mime_type, byte_size, sha256,
                storage_provider, storage_key, external_storage_id, external_object_key,
                extracted_text, metadata_json, status, error_message, uploaded_by_user_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING *`,
            [
                input.id,
                input.ipId,
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

    async getIpContentFile(ipId: string, fileId: string): Promise<IpContentFileRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 AND id = $2", [ipId, fileId]);
        return result.rows[0] ? mapContentFile(result.rows[0]) : null;
    }

    async listIpContentFiles(ipId: string): Promise<IpContentFileRecord[]> {
        const result = await this.db.query("SELECT * FROM ip_content_files WHERE ip_id = $1 ORDER BY created_at, id", [ipId]);
        return result.rows.map(mapContentFile);
    }

    async updateIpContentFile(ipId: string, fileId: string, patch: IpContentFilePatch): Promise<IpContentFileRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_content_files SET
                status = CASE WHEN $3 THEN $4 ELSE status END,
                error_message = CASE WHEN $5 THEN $6 ELSE error_message END,
                metadata_json = CASE WHEN $7 THEN $8::jsonb ELSE metadata_json END,
                extracted_text = CASE WHEN $9 THEN $10 ELSE extracted_text END
             WHERE ip_id = $1 AND id = $2
             RETURNING *`,
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

    async deleteIpContentFile(ipId: string, fileId: string): Promise<boolean> {
        const result = await this.db.query(
            `DELETE FROM ip_content_files AS file
             WHERE file.ip_id = $1 AND file.id = $2
               AND NOT EXISTS (SELECT 1 FROM ip_versions AS version WHERE version.cover_file_id = file.id)
               AND NOT EXISTS (SELECT 1 FROM ip_items AS item WHERE item.file_id = file.id)
             RETURNING file.id`,
            [ipId, fileId],
        );
        return Boolean(result.rows[0]);
    }

    async createIpDraftVersion(ipId: string, input: IpDraftVersionInput): Promise<IpVersionRecord> {
        const items = input.items.map((item) => ({
            id: item.id,
            kind: item.kind,
            category: item.category,
            title: item.title,
            summary: item.summary,
            file_id: item.fileId || null,
            sort_order: item.sortOrder,
        }));
        const result = await this.db.query(
            `WITH requested_items AS (
                SELECT * FROM jsonb_to_recordset($10::jsonb)
                    AS item(id text, kind text, category text, title text, summary text, file_id text, sort_order integer)
             ), locked AS (
                SELECT package.id FROM ip_packages AS package
                WHERE package.id = $1
                  AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM ip_content_files AS file WHERE file.id = $5 AND file.ip_id = package.id AND file.status = 'ready'))
                  AND NOT EXISTS (
                      SELECT 1 FROM requested_items AS item
                      LEFT JOIN ip_content_files AS file ON file.id = item.file_id AND file.ip_id = package.id AND file.status = 'ready'
                      WHERE item.file_id IS NULL OR file.id IS NULL
                  )
                FOR UPDATE
             ), inserted_version AS (
                INSERT INTO ip_versions (id, ip_id, version_number, title, summary, cover_file_id, tags_json, source_note, change_note, status, created_by_user_id)
                SELECT $2, locked.id, COALESCE((SELECT MAX(version_number) FROM ip_versions WHERE ip_id = locked.id), 0) + 1,
                       $3, $4, $5, $6::jsonb, $7, $8, 'draft', $9
                FROM locked
                RETURNING *
             ), inserted_items AS (
                INSERT INTO ip_items (id, version_id, kind, category, title, summary, file_id, sort_order)
                SELECT item.id, version.id, item.kind, item.category, item.title, item.summary, item.file_id, item.sort_order
                FROM inserted_version AS version
                CROSS JOIN requested_items AS item
                RETURNING *
             )
             SELECT version.*, COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.created_at) FROM inserted_items AS item), '[]'::jsonb) AS items
             FROM inserted_version AS version`,
            [ipId, input.id, input.title, input.summary, input.coverFileId || null, jsonParam(input.tags || []), input.sourceNote || "", input.changeNote || "", input.createdByUserId || null, jsonParam(items)],
        );
        if (!result.rows[0]) throw new Error("IP 不存在，或内容文件未就绪");
        return mapVersion(result.rows[0]);
    }

    async updateIpDraftVersion(ipId: string, versionId: string, input: IpDraftVersionInput): Promise<IpVersionRecord> {
        const items = input.items.map((item) => ({
            id: item.id,
            kind: item.kind,
            category: item.category,
            title: item.title,
            summary: item.summary,
            file_id: item.fileId,
            sort_order: item.sortOrder,
        }));
        const result = await this.db.query(
            `WITH requested_items AS (
                SELECT * FROM jsonb_to_recordset($9::jsonb)
                    AS item(id text, kind text, category text, title text, summary text, file_id text, sort_order integer)
             ), target AS (
                SELECT version.id, version.ip_id FROM ip_versions AS version
                WHERE version.id = $2 AND version.ip_id = $1 AND version.status = 'draft'
                  AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM ip_content_files AS file WHERE file.id = $5 AND file.ip_id = version.ip_id AND file.status = 'ready'))
                  AND NOT EXISTS (
                      SELECT 1 FROM requested_items AS item
                      LEFT JOIN ip_content_files AS file ON file.id = item.file_id AND file.ip_id = version.ip_id AND file.status = 'ready'
                      WHERE item.file_id IS NULL OR file.id IS NULL
                  )
                FOR UPDATE
             ), updated_version AS (
                UPDATE ip_versions AS version
                SET title = $3, summary = $4, cover_file_id = $5, tags_json = $6::jsonb, source_note = $7, change_note = $8
                FROM target WHERE version.id = target.id
                RETURNING version.*
             ), deleted_items AS (
                DELETE FROM ip_items AS item USING updated_version AS version
                WHERE item.version_id = version.id
                RETURNING item.id
             ), inserted_items AS (
                INSERT INTO ip_items (id, version_id, kind, category, title, summary, file_id, sort_order)
                SELECT item.id, version.id, item.kind, item.category, item.title, item.summary, item.file_id, item.sort_order
                FROM updated_version AS version
                CROSS JOIN requested_items AS item
                WHERE (SELECT COUNT(*) FROM deleted_items) >= 0
                RETURNING *
             )
             SELECT version.*, COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.created_at) FROM inserted_items AS item), '[]'::jsonb) AS items
             FROM updated_version AS version`,
            [ipId, versionId, input.title, input.summary, input.coverFileId || null, jsonParam(input.tags), input.sourceNote, input.changeNote, jsonParam(items)],
        );
        if (!result.rows[0]) throw new Error("IP 草稿版本不存在，或内容文件未就绪");
        return mapVersion(result.rows[0]);
    }

    async publishIpVersion(ipId: string, versionId: string): Promise<IpVersionRecord> {
        const result = await this.db.query(
            `WITH target AS (
                SELECT version.* FROM ip_versions AS version
                JOIN ip_packages AS package ON package.id = version.ip_id
                WHERE version.id = $2 AND version.ip_id = $1 AND version.status = 'draft'
                  AND (version.cover_file_id IS NULL OR EXISTS (SELECT 1 FROM ip_content_files AS cover_file WHERE cover_file.id = version.cover_file_id AND cover_file.ip_id = version.ip_id AND cover_file.status = 'ready'))
                  AND NOT EXISTS (SELECT 1 FROM ip_items AS item LEFT JOIN ip_content_files AS file ON file.id = item.file_id AND file.ip_id = version.ip_id AND file.status = 'ready' WHERE item.version_id = version.id AND file.id IS NULL)
                FOR UPDATE OF version, package
             ), manifest AS (
                SELECT target.id,
                       jsonb_build_object(
                           'ipId', target.ip_id,
                           'versionId', target.id,
                           'versionNumber', target.version_number,
                           'title', target.title,
                           'summary', target.summary,
                           'coverFileId', target.cover_file_id,
                           'tags', target.tags_json,
                           'sourceNote', target.source_note,
                           'changeNote', target.change_note,
                           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                               'id', item.id,
                               'kind', item.kind,
                               'category', item.category,
                               'title', item.title,
                               'summary', item.summary,
                               'fileId', item.file_id,
                               'sortOrder', item.sort_order
                           ) ORDER BY item.sort_order, item.created_at) FROM ip_items AS item WHERE item.version_id = target.id), '[]'::jsonb)
                       ) AS value
                FROM target
             ), published AS (
                UPDATE ip_versions AS version
                SET status = 'published', manifest_json = manifest.value, published_at = now()
                FROM manifest
                WHERE version.id = manifest.id
                RETURNING version.*
             ), updated_package AS (
                UPDATE ip_packages AS package
                SET current_version_id = published.id, status = 'published'
                FROM published
                WHERE package.id = $1
                RETURNING package.id
             )
             SELECT published.* FROM published JOIN updated_package ON true`,
            [ipId, versionId],
        );
        if (!result.rows[0]) throw new Error("IP 草稿版本不存在");
        return { ...mapVersion(result.rows[0]), items: await this.listVersionItems(versionId) };
    }

    async listVisibleIps(input: VisibleIpListInput): Promise<PageResult<IpSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        if (input.scope === "school" && !input.schoolId) return pageResult([], 0, page, pageSize);
        const at = input.at || new Date().toISOString();
        const values: unknown[] = [input.userId, input.scope, input.schoolId || null, at, input.keyword?.trim() || null, input.kind || null, input.category || null];
        const where = visibleWhere();
        const count = await this.db.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM ip_packages AS package JOIN users AS account ON account.id = $1 AND account.status = 'active' JOIN ip_versions AS version ON version.id = package.current_version_id AND version.status = 'published' WHERE ${where}`,
            values,
        );
        values.push(pageSize, (page - 1) * pageSize);
        const result = await this.db.query(
            `SELECT package.*, version.version_number,
                    version.title AS published_title, version.summary AS published_summary,
                    version.cover_file_id, version.tags_json,
                    (SELECT COUNT(*)::integer FROM ip_items AS item_count WHERE item_count.version_id = version.id) AS item_count,
                    CASE WHEN $2::text = 'school' THEN (SELECT school_grant.mode FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3::text AND school_grant.status = 'active' AND school_grant.member_access_enabled AND school_grant.starts_at <= $4::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $4::timestamptz) ORDER BY school_grant.created_at DESC LIMIT 1) END AS grant_mode
             FROM ip_packages AS package
             JOIN users AS account ON account.id = $1 AND account.status = 'active'
             JOIN ip_versions AS version ON version.id = package.current_version_id AND version.status = 'published'
             WHERE ${where}
             ORDER BY package.updated_at DESC, package.id
             LIMIT $8 OFFSET $9`,
            values,
        );
        return pageResult(result.rows.map(mapSummary), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async getVisibleIp(input: VisibleIpDetailInput): Promise<IpDetailRecord | null> {
        const at = input.at || new Date().toISOString();
        const result = await this.db.query(
            `SELECT package.*,
                    CASE WHEN package.visibility = 'school' THEN (SELECT school_grant.mode FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3 AND school_grant.status = 'active' AND school_grant.member_access_enabled AND school_grant.starts_at <= $5::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $5::timestamptz) ORDER BY school_grant.created_at DESC LIMIT 1) END AS grant_mode,
                    version.id AS visible_version_id
             FROM ip_packages AS package
             JOIN users AS account ON account.id = $1 AND account.status = 'active'
             JOIN ip_versions AS version ON version.ip_id = package.id AND version.id = COALESCE($4, package.current_version_id) AND version.status = 'published'
             WHERE package.id = $2 AND package.status = 'published'
               AND (
                   package.visibility = 'public'
                   OR (package.visibility = 'school' AND $3 IS NOT NULL
                       AND EXISTS (SELECT 1 FROM schools AS school JOIN school_memberships AS membership ON membership.school_id = school.id WHERE school.id = $3 AND school.status = 'active' AND membership.user_id = $1 AND membership.status = 'active')
                       AND EXISTS (SELECT 1 FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3 AND school_grant.status = 'active' AND school_grant.member_access_enabled AND school_grant.starts_at <= $5::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $5::timestamptz)))
               )`,
            [input.userId, input.ipId, input.schoolId || null, input.versionId || null, at],
        );
        const row = result.rows[0];
        if (!row) return null;
        const version = await this.getIpVersion(input.ipId, stringValue(row.visible_version_id));
        return version ? { ...mapPackage(row), version, ...(optionalString(row.grant_mode) ? { grantMode: optionalString(row.grant_mode) as IpDetailRecord["grantMode"] } : {}) } : null;
    }

    async getIpVersion(ipId: string, versionId: string): Promise<IpVersionRecord | null> {
        const result = await this.db.query("SELECT * FROM ip_versions WHERE id = $2 AND ip_id = $1", [ipId, versionId]);
        return result.rows[0] ? { ...mapVersion(result.rows[0]), items: await this.listVersionItems(versionId) } : null;
    }

    async listIpVersions(ipId: string, input: PageInput = {}): Promise<PageResult<IpVersionRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const count = await this.db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM ip_versions WHERE ip_id = $1", [ipId]);
        const result = await this.db.query(
            `SELECT version.*, COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.created_at, item.id) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items
             FROM ip_versions AS version LEFT JOIN ip_items AS item ON item.version_id = version.id
             WHERE version.ip_id = $1 GROUP BY version.id ORDER BY version.version_number DESC LIMIT $2 OFFSET $3`,
            [ipId, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapVersion), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async createSchoolGrant(input: IpSchoolGrantCreateInput): Promise<IpSchoolGrantRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_school_grants (
                id, ip_id, school_id, mode, status, starts_at, ends_at, note,
                member_access_enabled, member_access_updated_by_user_id, member_access_updated_at, created_by_user_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
                input.id,
                input.ipId,
                input.schoolId,
                input.mode,
                input.status,
                input.startsAt,
                input.endsAt || null,
                input.note,
                input.memberAccessEnabled || false,
                input.memberAccessUpdatedByUserId || null,
                input.memberAccessUpdatedAt || null,
                input.createdByUserId || null,
            ],
        );
        return mapGrant(result.rows[0]);
    }

    async updateSchoolGrant(ipId: string, grantId: string, patch: IpSchoolGrantUpdateInput): Promise<IpSchoolGrantRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_school_grants
             SET status = COALESCE($3, status),
                 ends_at = CASE WHEN $4 THEN $5::timestamptz ELSE ends_at END,
                 note = COALESCE($6, note),
                 member_access_enabled = CASE WHEN $7 THEN $8 ELSE member_access_enabled END,
                 member_access_updated_by_user_id = CASE WHEN $7 THEN $9 ELSE member_access_updated_by_user_id END,
                 member_access_updated_at = CASE WHEN $7 THEN $10::timestamptz ELSE member_access_updated_at END,
                 updated_at = $11::timestamptz
             WHERE ip_id = $1 AND id = $2
             RETURNING *`,
            [
                ipId,
                grantId,
                patch.status || null,
                patch.endsAt !== undefined,
                patch.endsAt || null,
                patch.note ?? null,
                patch.memberAccessEnabled !== undefined,
                patch.memberAccessEnabled || false,
                patch.memberAccessUpdatedByUserId || null,
                patch.memberAccessUpdatedAt || null,
                patch.updatedAt,
            ],
        );
        return result.rows[0] ? mapGrant(result.rows[0]) : null;
    }

    async listSchoolGrants(input: IpGrantListInput): Promise<PageResult<IpSchoolGrantRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [input.ipId || null, input.grantId || null, input.schoolId || null, input.status || null];
        const where = "($1::text IS NULL OR school_grant.ip_id = $1) AND ($2::text IS NULL OR school_grant.id = $2) AND ($3::text IS NULL OR school_grant.school_id = $3) AND ($4::text IS NULL OR school_grant.status = $4)";
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_school_grants AS school_grant WHERE ${where}`, values);
        values.push(pageSize, (page - 1) * pageSize);
        const result = await this.db.query(`SELECT school_grant.* FROM ip_school_grants AS school_grant WHERE ${where} ORDER BY school_grant.created_at DESC, school_grant.id LIMIT $5 OFFSET $6`, values);
        return pageResult(result.rows.map(mapGrant), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async recordIpDownload(input: IpDownloadCreateInput): Promise<IpDownloadRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_download_records (id, ip_id, version_id, item_id, school_id, user_id, download_type, result)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [input.id, input.ipId, input.versionId, input.itemId || null, input.schoolId || null, input.userId, input.downloadType, input.result],
        );
        return mapDownload(result.rows[0]);
    }

    async listIpDownloads(input: IpDownloadListInput = {}): Promise<PageResult<IpDownloadRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [];
        const filters: string[] = [];
        addFilter(filters, values, "record.ip_id", input.ipId);
        addFilter(filters, values, "record.version_id", input.versionId);
        addFilter(filters, values, "record.school_id", input.schoolId);
        addFilter(filters, values, "record.user_id", input.userId);
        addFilter(filters, values, "record.download_type", input.downloadType);
        addFilter(filters, values, "record.result", input.result);
        const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_download_records AS record ${where}`, values);
        values.push(pageSize, (page - 1) * pageSize);
        const result = await this.db.query(`SELECT record.* FROM ip_download_records AS record ${where} ORDER BY record.created_at DESC, record.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return pageResult(result.rows.map(mapDownload), numberValue(count.rows[0]?.count), page, pageSize);
    }

    async recordIpUsage(input: IpUsageCreateInput): Promise<IpUsageRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_usage_records (id, ip_id, version_id, item_ids_json, school_id, user_id, action, target_type, target_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
             WHERE ip_usage_records.ip_id = EXCLUDED.ip_id
               AND ip_usage_records.version_id = EXCLUDED.version_id
               AND ip_usage_records.item_ids_json = EXCLUDED.item_ids_json
               AND ip_usage_records.school_id IS NOT DISTINCT FROM EXCLUDED.school_id
               AND ip_usage_records.user_id = EXCLUDED.user_id
               AND ip_usage_records.action = EXCLUDED.action
               AND ip_usage_records.target_type = EXCLUDED.target_type
               AND ip_usage_records.target_id = EXCLUDED.target_id
             RETURNING *`,
            [input.id, input.ipId, input.versionId, jsonParam(input.itemIds), input.schoolId || null, input.userId, input.action, input.targetType, input.targetId],
        );
        if (!result.rows[0]) throw new Error("IP 使用记录冲突");
        return mapUsage(result.rows[0]);
    }

    async recordIpUsages(inputs: IpUsageCreateInput[]): Promise<IpUsageRecord[]> {
        if (!inputs.length) return [];
        const values: unknown[] = [];
        const rows = inputs.map((input) => {
            const offset = values.length;
            values.push(input.id, input.ipId, input.versionId, jsonParam(input.itemIds), input.schoolId || null, input.userId, input.action, input.targetType, input.targetId);
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
        });
        const result = await this.db.query(
            `INSERT INTO ip_usage_records (id, ip_id, version_id, item_ids_json, school_id, user_id, action, target_type, target_id)
             VALUES ${rows.join(", ")}
             ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
             WHERE ip_usage_records.ip_id = EXCLUDED.ip_id
               AND ip_usage_records.version_id = EXCLUDED.version_id
               AND ip_usage_records.item_ids_json = EXCLUDED.item_ids_json
               AND ip_usage_records.school_id IS NOT DISTINCT FROM EXCLUDED.school_id
               AND ip_usage_records.user_id = EXCLUDED.user_id
               AND ip_usage_records.action = EXCLUDED.action
               AND ip_usage_records.target_type = EXCLUDED.target_type
               AND ip_usage_records.target_id = EXCLUDED.target_id
             RETURNING *`,
            values,
        );
        if (result.rows.length !== inputs.length) throw new Error("IP 使用记录冲突");
        return result.rows.map(mapUsage);
    }

    async listIpUsage(input: IpUsageListInput = {}): Promise<PageResult<IpUsageRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values: unknown[] = [];
        const filters: string[] = [];
        addFilter(filters, values, "record.ip_id", input.ipId);
        addFilter(filters, values, "record.version_id", input.versionId);
        addFilter(filters, values, "record.school_id", input.schoolId);
        addFilter(filters, values, "record.user_id", input.userId);
        addFilter(filters, values, "record.action", input.action);
        const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ip_usage_records AS record ${where}`, values);
        values.push(pageSize, (page - 1) * pageSize);
        const result = await this.db.query(`SELECT record.* FROM ip_usage_records AS record ${where} ORDER BY record.created_at DESC, record.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return pageResult(result.rows.map(mapUsage), numberValue(count.rows[0]?.count), page, pageSize);
    }

    private async listVersionItems(versionId: string): Promise<IpItemRecord[]> {
        const result = await this.db.query("SELECT * FROM ip_items WHERE version_id = $1 ORDER BY sort_order, created_at, id", [versionId]);
        return result.rows.map(mapItem);
    }
}

function visibleWhere() {
    return `package.status = 'published'
        AND (($2::text = 'public' AND package.visibility = 'public') OR ($2::text = 'school' AND package.visibility = 'school' AND $3::text IS NOT NULL
            AND EXISTS (SELECT 1 FROM schools AS school JOIN school_memberships AS membership ON membership.school_id = school.id WHERE school.id = $3::text AND school.status = 'active' AND membership.user_id = $1 AND membership.status = 'active')
            AND EXISTS (SELECT 1 FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3::text AND school_grant.status = 'active' AND school_grant.member_access_enabled AND school_grant.starts_at <= $4::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $4::timestamptz))))
        AND ($5::text IS NULL OR package.title ILIKE '%' || $5::text || '%' OR package.summary ILIKE '%' || $5::text || '%')
        AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM ip_items AS item WHERE item.version_id = version.id AND item.kind = $6::text))
        AND ($7::text IS NULL OR EXISTS (SELECT 1 FROM ip_items AS item WHERE item.version_id = version.id AND item.category = $7::text))`;
}

function addFilter(filters: string[], values: unknown[], column: string, value: string | undefined) {
    if (!value) return;
    values.push(value);
    filters.push(`${column} = $${values.length}`);
}

function mapPackage(row: Record<string, unknown>): IpPackageRecord {
    return {
        id: stringValue(row.id),
        title: stringValue(row.title),
        slug: stringValue(row.slug),
        summary: stringValue(row.summary),
        coverAssetId: optionalString(row.cover_asset_id),
        visibility: row.visibility === "school" ? "school" : "public",
        authorizationMode: row.authorization_mode === "exclusive" ? "exclusive" : "multi_school",
        status: row.status === "published" || row.status === "disabled" ? row.status : "draft",
        currentVersionId: optionalString(row.current_version_id),
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapSummary(row: Record<string, unknown>): IpSummaryRecord {
    const rawTags = jsonValue(row.tags_json);
    return {
        ...mapPackage(row),
        ...(optionalString(row.published_title) ? { title: optionalString(row.published_title)! } : {}),
        ...(row.published_summary !== undefined ? { summary: stringValue(row.published_summary) } : {}),
        versionNumber: numberValue(row.version_number),
        itemCount: numberValue(row.item_count),
        coverFileId: optionalString(row.cover_file_id),
        tags: Array.isArray(rawTags) ? rawTags.filter((item): item is string => typeof item === "string") : [],
        ...(optionalString(row.grant_mode) ? { grantMode: optionalString(row.grant_mode) as IpSummaryRecord["grantMode"] } : {}),
    };
}

function mapVersion(row: Record<string, unknown>): IpVersionRecord {
    const rawItems = Array.isArray(row.items) ? row.items : [];
    const rawTags = jsonValue(row.tags_json);
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        versionNumber: numberValue(row.version_number),
        title: stringValue(row.title),
        summary: stringValue(row.summary),
        coverFileId: optionalString(row.cover_file_id),
        tags: Array.isArray(rawTags) ? rawTags.filter((item): item is string => typeof item === "string") : [],
        sourceNote: stringValue(row.source_note),
        changeNote: stringValue(row.change_note),
        status: row.status === "published" || row.status === "disabled" ? row.status : "draft",
        manifest: jsonValue(row.manifest_json),
        publishedAt: optionalIso(row.published_at),
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        items: rawItems.map((item) => mapItem(item as Record<string, unknown>)),
    };
}

function mapItem(row: Record<string, unknown>): IpItemRecord {
    return {
        id: stringValue(row.id),
        versionId: stringValue(row.version_id),
        kind: row.kind === "image" || row.kind === "audio" || row.kind === "video" ? row.kind : "text",
        category: stringValue(row.category) as IpItemRecord["category"],
        title: stringValue(row.title),
        summary: stringValue(row.summary),
        fileId: stringValue(row.file_id),
        textContent: optionalString(row.text_content),
        assetId: optionalString(row.asset_id),
        sortOrder: numberValue(row.sort_order),
        createdAt: isoValue(row.created_at),
    };
}

function mapGrant(row: Record<string, unknown>): IpSchoolGrantRecord {
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        schoolId: stringValue(row.school_id),
        mode: row.mode === "exclusive" ? "exclusive" : "multi_school",
        status: row.status === "suspended" || row.status === "revoked" || row.status === "expired" ? row.status : "active",
        startsAt: isoValue(row.starts_at),
        endsAt: optionalIso(row.ends_at),
        note: stringValue(row.note),
        memberAccessEnabled: row.member_access_enabled === true,
        memberAccessUpdatedByUserId: optionalString(row.member_access_updated_by_user_id),
        memberAccessUpdatedAt: optionalIso(row.member_access_updated_at),
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapContentFile(row: Record<string, unknown>): IpContentFileRecord {
    const value = jsonValue(row.metadata_json);
    const rawMetadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const metadata: IpContentFileRecord["metadata"] = {};
    if (typeof rawMetadata.width === "number") metadata.width = rawMetadata.width;
    if (typeof rawMetadata.height === "number") metadata.height = rawMetadata.height;
    if (typeof rawMetadata.durationSeconds === "number") metadata.durationSeconds = rawMetadata.durationSeconds;
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
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
        status: row.status === "ready" || row.status === "failed" ? row.status : "processing",
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
        versionId: stringValue(row.version_id),
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
        versionId: stringValue(row.version_id),
        itemIds: Array.isArray(row.item_ids_json) ? row.item_ids_json.filter((item): item is string => typeof item === "string") : [],
        schoolId: optionalString(row.school_id),
        userId: stringValue(row.user_id),
        action: row.action === "download_item" || row.action === "download_package" ? row.action : "reference",
        targetType: row.target_type === "drama" || row.target_type === "practice" || row.target_type === "download" ? row.target_type : "canvas",
        targetId: stringValue(row.target_id),
        createdAt: isoValue(row.created_at),
    };
}
