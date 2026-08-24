import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { listDramaProjectSummaries } from "@/lib/server/drama-project-store";
import { getDatabaseProvider, postgresQuery } from "@/lib/server/database";

type DramaProjectJson = {
    title?: string;
    summary?: string;
    style?: string;
    ratio?: string;
    episodes?: unknown[];
    characters?: unknown[];
    scenes?: unknown[];
    createdAt?: string;
    updatedAt?: string;
};
type AdminDramaProjectRow = { id: string; user_id: string; project_json: DramaProjectJson; status: "active" | "archived"; created_at: string; updated_at: string };

export async function GET(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") as "active" | "archived" | undefined;

    try {
        // 获取所有用户的项目（管理员权限）
        if (getDatabaseProvider() === "postgres") {
            const offset = (page - 1) * limit;
            const searchClause = search ? `AND (project_json->>'title' ILIKE $3 OR project_json->>'summary' ILIKE $3)` : "";
            const statusClause = status ? `AND status = ${search ? "$4" : "$3"}` : "";
            const params: unknown[] = [limit, offset];
            if (search) params.push(`%${search}%`);
            if (status) params.push(status);

            const result = await postgresQuery<AdminDramaProjectRow>(
                `SELECT
                    id,
                    user_id,
                    project_json,
                    status,
                    created_at,
                    updated_at
                FROM drama_projects
                WHERE 1=1 ${searchClause} ${statusClause}
                ORDER BY updated_at DESC
                LIMIT $1 OFFSET $2`,
                params,
            );

            const countResult = await postgresQuery<{ count: string }>(
                `SELECT COUNT(*)::text as count FROM drama_projects WHERE 1=1 ${searchClause} ${statusClause}`,
                search || status ? (search && status ? [`%${search}%`, status] : search ? [`%${search}%`] : [status]) : [],
            );

            const items = result.rows.map((row) => {
                const projectData = row.project_json;
                return {
                    id: row.id,
                    title: projectData.title || "未命名项目",
                    userId: row.user_id,
                    summary: projectData.summary || "",
                    style: projectData.style || "",
                    ratio: projectData.ratio || "9:16",
                    status: row.status || "active",
                    episodeCount: projectData.episodes?.length || 0,
                    characterCount: projectData.characters?.length || 0,
                    sceneCount: projectData.scenes?.length || 0,
                    createdAt: projectData.createdAt || row.created_at,
                    updatedAt: projectData.updatedAt || row.updated_at,
                };
            });

            return NextResponse.json({
                code: 0,
                data: {
                    items,
                    total: parseInt(countResult.rows[0]?.count || "0", 10),
                    page,
                    limit,
                },
                msg: "OK",
            });
        }

        return NextResponse.json({ code: 500, msg: "Database not configured" }, { status: 500 });
    } catch (error) {
        console.error("Failed to fetch drama projects:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}
