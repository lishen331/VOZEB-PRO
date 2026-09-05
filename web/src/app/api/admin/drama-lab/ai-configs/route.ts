import { NextResponse } from "next/server";
import { postgresQuery } from "@/lib/server/database";
import { authorizeDramaLabAdmin, legacyReadOnly, serverError } from "../_lib";

type LegacyAiConfigRow = {
    id?: unknown;
    name?: unknown;
    provider?: unknown;
    service_type?: unknown;
    base_url?: unknown;
    model?: unknown;
    default_model?: unknown;
    is_default?: unknown;
    is_active?: unknown;
    created_at?: unknown;
    updated_at?: unknown;
    has_api_key?: unknown;
};

/** Return only the metadata needed by the compatibility table. */
function serializeLegacyAiConfig(row: LegacyAiConfigRow) {
    return {
        id: String(row.id || ""),
        name: String(row.name || ""),
        provider: String(row.provider || ""),
        service_type: String(row.service_type || "text"),
        base_url: String(row.base_url || ""),
        model: row.model == null ? null : String(row.model),
        default_model: row.default_model == null ? null : String(row.default_model),
        is_default: Boolean(row.is_default),
        is_active: row.is_active !== false,
        created_at: row.created_at,
        updated_at: row.updated_at,
        has_api_key: Boolean(row.has_api_key),
    };
}

export async function GET() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const result = await postgresQuery(
            `SELECT id, name, provider, service_type, base_url, model, default_model,
                    is_default, is_active, created_at, updated_at,
                    (api_key IS NOT NULL AND api_key <> '') AS has_api_key
             FROM drama_lab_ai_configs
            WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY service_type, priority DESC, created_at DESC`,
            [auth.user.id],
        );

        return NextResponse.json({
            code: 0,
            data: result.rows.map((row) => serializeLegacyAiConfig(row as LegacyAiConfigRow)),
            msg: "OK",
        });
    } catch (error) {
        console.error("Failed to fetch AI configs:", error);
        return serverError();
    }
}

export async function POST() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;
    return legacyReadOnly("历史 AI 配置仅支持查看，请到平台模型渠道维护实际运行配置");
}
