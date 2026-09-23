import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickLayoutRegenerateError, regenerateOneClickLayout } from "@/lib/server/one-click-film/layout-regenerate-service";
import { updateOneClickShot } from "@/lib/server/one-click-film/shot-crud";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 对应 L `POST /storyboards/:id/regenerate-layout-description`
 * （framePromptService.regenerateLayoutDescription）。
 *
 * L 会带上前后分镜的 layout_description 与本镜角色，让文本模型重算空间布局锚点，
 * 再写回 layout_description。系统提示词逐字抄自 L，清洗规则一致。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickLayoutRegenerateError("当前剧集不能为空", 400);
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickLayoutRegenerateError("一键成片项目不存在", 404);

        const episode = existing.episodes.find((item) => item.id === episodeId);
        if (!episode) throw new OneClickLayoutRegenerateError("分集不存在", 404);
        const shot = episode.shots.find((item) => item.id === shotId);
        if (!shot) throw new OneClickLayoutRegenerateError("分镜不存在", 404);

        const requestId = `one-click-film-layout:${id}:${episodeId}:${shotId}`;
        const result = await regenerateOneClickLayout({ project: existing, episode, shot }, { userId: user.id, origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)), cookie: request.headers.get("cookie") || "", requestId });

        const { project } = updateOneClickShot(existing, episodeId, shotId, { layoutDescription: result.layout });
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { layoutDescription: result.layout, model: result.model, channelId: result.channelId, project: saved }, msg: "布局描述已由 AI 重新生成并保存" });
    } catch (error) {
        const status = error instanceof OneClickLayoutRegenerateError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "布局描述重生成失败" }, { status });
    }
}
