import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";

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

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await readJsonBody<Record<string, unknown>>(req, 64 * 1024);
        const { name, provider, service_type, base_url, api_key, default_model, is_default, is_active } = body;

        if (!name || !provider || !service_type || !base_url) {
            return NextResponse.json({ code: 400, msg: "Missing required fields" }, { status: 400 });
        }

        const id = `ai-config-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        if (getDatabaseProvider() === "postgres") {
            await ensurePostgresSchema();
            // 如果设为默认，先取消同类型的其他默认配置
            if (is_default) {
                await postgresQuery(
                    `UPDATE drama_lab_ai_configs
                    SET is_default = false
                    WHERE user_id = $1 AND service_type = $2 AND is_default = true`,
                    [user.id, service_type],
                );
            }

            await postgresQuery(
                `INSERT INTO drama_lab_ai_configs (
                    id, user_id, service_type, provider, name, base_url, api_key,
                    default_model, is_default, is_active, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
                [id, user.id, service_type, provider, name, base_url, api_key || null, default_model || null, is_default || false, is_active !== false],
            );

            return NextResponse.json({
                code: 0,
                data: { id },
                msg: "配置创建成功",
            });
        }

        return NextResponse.json({ code: 500, msg: "Database not configured" }, { status: 500 });
    } catch (error) {
        console.error("Failed to create AI config:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}
