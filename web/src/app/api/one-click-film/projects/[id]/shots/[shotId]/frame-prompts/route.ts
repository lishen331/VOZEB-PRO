import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickFramePromptError, listOneClickFramePrompts } from "@/lib/server/one-click-film/frame-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 对应 L `GET /storyboards/:id/frame-prompts`。
 * GET /api/one-click-film/projects/:id/shots/:shotId/frame-prompts?episodeId=:episodeId
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickFramePromptError("当前剧集不能为空");
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickFramePromptError("一键成片项目不存在", 404);

        return NextResponse.json({ code: 0, data: { framePrompts: listOneClickFramePrompts(project, episodeId, shotId) }, msg: "OK" });
    } catch (error) {
        const status = error instanceof OneClickFramePromptError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "读取帧提示词失败" }, { status });
    }
}
