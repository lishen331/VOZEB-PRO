import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";
import { databaseNotConfiguredResponse } from "../../_lib";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(req, 64 * 1024);
        const { name, provider, service_type, base_url, api_key, default_model, is_default, is_active } = body;

        if (getDatabaseProvider() === "postgres") {
            await ensurePostgresSchema();
            // 如果设为默认，先取消同类型的其他默认配置
            if (is_default) {
                await postgresQuery(
                    `UPDATE drama_lab_ai_configs
                    SET is_default = false
                    WHERE user_id = $1 AND service_type = $2 AND is_default = true AND id != $3`,
                    [user.id, service_type, id],
                );
            }

            await postgresQuery(
                `UPDATE drama_lab_ai_configs
                SET name = $1, provider = $2, service_type = $3, base_url = $4,
                    api_key = CASE WHEN NULLIF($5, '') IS NULL THEN api_key ELSE $5 END,
                    default_model = $6, is_default = $7, is_active = $8, updated_at = NOW()
                WHERE id = $9 AND user_id = $10`,
                [name, provider, service_type, base_url, api_key || null, default_model || null, is_default || false, is_active !== false, id, user.id],
            );

            return NextResponse.json({
                code: 0,
                msg: "更新成功",
            });
        }

        return databaseNotConfiguredResponse();
    } catch (error) {
        console.error("Failed to update AI config:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        if (getDatabaseProvider() === "postgres") {
            await ensurePostgresSchema();
            await postgresQuery(`UPDATE drama_lab_ai_configs SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`, [id, user.id]);

            return NextResponse.json({
                code: 0,
                msg: "删除成功",
            });
        }

        return databaseNotConfiguredResponse();
    } catch (error) {
        console.error("Failed to delete AI config:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}
