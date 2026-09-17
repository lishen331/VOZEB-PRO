import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { getOrCreateDramaLabEpisodeCanvasForUser } from "@/lib/server/drama-lab-episode-canvas-service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    const { id } = await params;
    const project = await getDramaProjectForUser(user.id, id);
    if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, msg: "项目不存在" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const episodeId = typeof body.episodeId === "string" ? body.episodeId : "";
    try {
        const result = await getOrCreateDramaLabEpisodeCanvasForUser(user.id, id, episodeId);
        return NextResponse.json({ code: 0, data: { canvasId: result.project.id }, msg: "OK" });
    } catch (error) {
        return NextResponse.json({ code: 400, msg: error instanceof Error ? error.message : "画布创建失败" }, { status: 400 });
    }
}
