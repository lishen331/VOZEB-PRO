import type { QueryExecutor } from "./postgres";
import type {
    IpDetailRecord,
    IpDraftVersionInput,
    IpItemRecord,
    IpPackageCreateInput,
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

    async createIpDraftVersion(ipId: string, input: IpDraftVersionInput): Promise<IpVersionRecord> {
        const items = input.items.map((item) => ({
            id: item.id,
            kind: item.kind,
            category: item.category,
            title: item.title,
            summary: item.summary,
            text_content: item.textContent || null,
            asset_id: item.assetId || null,
            sort_order: item.sortOrder,
        }));
        const result = await this.db.query(
            `WITH inserted_version AS (
                INSERT INTO ip_versions (id, ip_id, version_number, title, summary, status, created_by_user_id)
                SELECT $2, locked.id, COALESCE((SELECT MAX(version_number) FROM ip_versions WHERE ip_id = locked.id), 0) + 1, $3, $4, 'draft', $5
                FROM (SELECT id FROM ip_packages WHERE id = $1 FOR UPDATE) AS locked
                RETURNING *
             ), inserted_items AS (
                INSERT INTO ip_items (id, version_id, kind, category, title, summary, text_content, asset_id, sort_order)
                SELECT item.id, version.id, item.kind, item.category, item.title, item.summary, item.text_content, item.asset_id, item.sort_order
                FROM inserted_version AS version
                CROSS JOIN jsonb_to_recordset($6::jsonb) AS item(id text, kind text, category text, title text, summary text, text_content text, asset_id text, sort_order integer)
                RETURNING *
             )
             SELECT version.*, COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.created_at) FROM inserted_items AS item), '[]'::jsonb) AS items
             FROM inserted_version AS version`,
            [ipId, input.id, input.title, input.summary, input.createdByUserId || null, jsonParam(items)],
        );
        if (!result.rows[0]) throw new Error("IP 不存在");
        return mapVersion(result.rows[0]);
    }

    async publishIpVersion(ipId: string, versionId: string): Promise<IpVersionRecord> {
        const result = await this.db.query(
            `WITH target AS (
                SELECT version.* FROM ip_versions AS version
                JOIN ip_packages AS package ON package.id = version.ip_id
                WHERE version.id = $2 AND version.ip_id = $1 AND version.status = 'draft'
                FOR UPDATE OF version, package
             ), manifest AS (
                SELECT target.id,
                       jsonb_build_object(
                           'ipId', target.ip_id,
                           'versionId', target.id,
                           'versionNumber', target.version_number,
                           'title', target.title,
                           'summary', target.summary,
                           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                               'id', item.id,
                               'kind', item.kind,
                               'category', item.category,
                               'title', item.title,
                               'summary', item.summary,
                               'assetId', item.asset_id,
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
                    (SELECT COUNT(*)::integer FROM ip_items AS item_count WHERE item_count.version_id = version.id) AS item_count,
                    CASE WHEN $2 = 'school' THEN (SELECT school_grant.mode FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3 AND school_grant.status = 'active' AND school_grant.starts_at <= $4::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $4::timestamptz) ORDER BY school_grant.created_at DESC LIMIT 1) END AS grant_mode
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
                    CASE WHEN package.visibility = 'school' THEN (SELECT school_grant.mode FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3 AND school_grant.status = 'active' AND school_grant.starts_at <= $5::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $5::timestamptz) ORDER BY school_grant.created_at DESC LIMIT 1) END AS grant_mode,
                    version.id AS visible_version_id
             FROM ip_packages AS package
             JOIN users AS account ON account.id = $1 AND account.status = 'active'
             JOIN ip_versions AS version ON version.ip_id = package.id AND version.id = COALESCE($4, package.current_version_id) AND version.status = 'published'
             WHERE package.id = $2 AND package.status = 'published'
               AND (
                   package.visibility = 'public'
                   OR (package.visibility = 'school' AND $3 IS NOT NULL
                       AND EXISTS (SELECT 1 FROM schools AS school JOIN school_memberships AS membership ON membership.school_id = school.id WHERE school.id = $3 AND school.status = 'active' AND membership.user_id = $1 AND membership.status = 'active')
                       AND EXISTS (SELECT 1 FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3 AND school_grant.status = 'active' AND school_grant.starts_at <= $5::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $5::timestamptz)))
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

    async createSchoolGrant(input: IpSchoolGrantCreateInput): Promise<IpSchoolGrantRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_school_grants (id, ip_id, school_id, mode, status, starts_at, ends_at, note, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [input.id, input.ipId, input.schoolId, input.mode, input.status, input.startsAt, input.endsAt || null, input.note, input.createdByUserId || null],
        );
        return mapGrant(result.rows[0]);
    }

    async updateSchoolGrant(ipId: string, grantId: string, patch: IpSchoolGrantUpdateInput): Promise<IpSchoolGrantRecord | null> {
        const result = await this.db.query(
            `UPDATE ip_school_grants
             SET status = COALESCE($3, status), ends_at = CASE WHEN $4 THEN $5::timestamptz ELSE ends_at END, note = COALESCE($6, note), updated_at = $7::timestamptz
             WHERE ip_id = $1 AND id = $2
             RETURNING *`,
            [ipId, grantId, patch.status || null, patch.endsAt !== undefined, patch.endsAt || null, patch.note ?? null, patch.updatedAt],
        );
        return result.rows[0] ? mapGrant(result.rows[0]) : null;
    }

    async recordIpUsage(input: IpUsageCreateInput): Promise<IpUsageRecord> {
        const result = await this.db.query(
            `INSERT INTO ip_usage_records (id, ip_id, version_id, item_ids_json, school_id, user_id, action, target_type, target_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [input.id, input.ipId, input.versionId, jsonParam(input.itemIds), input.schoolId || null, input.userId, input.action, input.targetType, input.targetId],
        );
        return mapUsage(result.rows[0]);
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
        AND (($2 = 'public' AND package.visibility = 'public') OR ($2 = 'school' AND package.visibility = 'school' AND $3 IS NOT NULL
            AND EXISTS (SELECT 1 FROM schools AS school JOIN school_memberships AS membership ON membership.school_id = school.id WHERE school.id = $3 AND school.status = 'active' AND membership.user_id = $1 AND membership.status = 'active')
            AND EXISTS (SELECT 1 FROM ip_school_grants AS school_grant WHERE school_grant.ip_id = package.id AND school_grant.school_id = $3 AND school_grant.status = 'active' AND school_grant.starts_at <= $4::timestamptz AND (school_grant.ends_at IS NULL OR school_grant.ends_at > $4::timestamptz))))
        AND ($5 IS NULL OR package.title ILIKE '%' || $5 || '%' OR package.summary ILIKE '%' || $5 || '%')
        AND ($6 IS NULL OR EXISTS (SELECT 1 FROM ip_items AS item WHERE item.version_id = version.id AND item.kind = $6))
        AND ($7 IS NULL OR EXISTS (SELECT 1 FROM ip_items AS item WHERE item.version_id = version.id AND item.category = $7))`;
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
    return { ...mapPackage(row), versionNumber: numberValue(row.version_number), itemCount: numberValue(row.item_count), ...(optionalString(row.grant_mode) ? { grantMode: optionalString(row.grant_mode) as IpSummaryRecord["grantMode"] } : {}) };
}

function mapVersion(row: Record<string, unknown>): IpVersionRecord {
    const rawItems = Array.isArray(row.items) ? row.items : [];
    return {
        id: stringValue(row.id),
        ipId: stringValue(row.ip_id),
        versionNumber: numberValue(row.version_number),
        title: stringValue(row.title),
        summary: stringValue(row.summary),
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
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
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
