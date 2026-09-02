import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";
import { legacyReadOnly } from "../_lib";

export async function GET() {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        if (getDatabaseProvider() === "postgres") {
            await ensurePostgresSchema();
            const result = await postgresQuery(
                `SELECT id, name, provider, service_type, base_url, model, default_model,
                        is_default, is_active, settings, created_at, updated_at,
                        (api_key IS NOT NULL AND api_key <> '') AS has_api_key
                 FROM drama_lab_ai_configs
                WHERE user_id = $1 AND deleted_at IS NULL
                ORDER BY service_type, priority DESC, created_at DESC`,
                [user.id],
            );

            return NextResponse.json({
                code: 0,
                data: result.rows,
                msg: "OK",
            });
        }

        return NextResponse.json({ code: 500, msg: "Database not configured" }, { status: 500 });
    } catch (error) {
        console.error("Failed to fetch AI configs:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST() {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    return legacyReadOnly("历史 AI 配置仅支持查看，请到平台模型渠道维护实际运行配置");
}
