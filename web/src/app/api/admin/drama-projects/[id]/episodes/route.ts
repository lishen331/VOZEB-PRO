import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { getDatabaseProvider, postgresQuery } from "@/lib/server/database";
import { databaseNotConfiguredResponse } from "../../../drama-lab/_lib";

type DramaProjectJson = { episodes?: unknown[] };
type DramaProjectRow = { project_json: DramaProjectJson };

/**
 * GET /api/admin/drama-projects/:id/episodes
 * 获取项目的所有分集
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        if (getDatabaseProvider() === "postgres") {
            const result = await postgresQuery<DramaProjectRow>(`SELECT project_json FROM drama_projects WHERE id = $1`, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ code: 404, msg: "Project not found" }, { status: 404 });
            }

            const projectData = result.rows[0].project_json;
            const episodes = projectData.episodes || [];

            return NextResponse.json({
                code: 0,
                data: { episodes },
                msg: "OK",
            });
        }

        return databaseNotConfiguredResponse();
    } catch (error) {
        console.error("Failed to fetch episodes:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}
