import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { updateOneClickShot } from "@/lib/server/one-click-film/shot-crud";
import { OneClickVideoPromptRebuildError, findOneClickRebuildTarget, rebuildOneClickVideoPrompt } from "@/lib/server/one-click-film/video-prompt-rebuild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 对应 L `POST /storyboards/:id/rebuild-video-prompt`
 * （episodeStoryboardService.rebuildVideoPromptForStoryboard）。
 *
 * 已核实该链路是纯本地模板重组、无 AI 调用，所以这里不涉及模型渠道与计费，
 * 只按 L 的段落顺序重算 videoPrompt 并落库。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickVideoPromptRebuildError("当前剧集不能为空");
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickVideoPromptRebuildError("一键成片项目不存在", 404);

        const { shot } = findOneClickRebuildTarget(existing, episodeId, shotId);
        const videoPrompt = rebuildOneClickVideoPrompt(existing, shot);
        const { project } = updateOneClickShot(existing, episodeId, shotId, { videoPrompt });
        const saved = await updateDramaProjectForUser(user.id, id, project);

        return NextResponse.json({ code: 0, data: { videoPrompt, project: saved }, msg: "已按最新规则重建视频提示词" });
    } catch (error) {
        const status = error instanceof OneClickVideoPromptRebuildError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "视频提示词重建失败" }, { status });
    }
}
