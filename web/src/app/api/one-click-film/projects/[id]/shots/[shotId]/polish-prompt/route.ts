import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickImagePolishError, polishOneClickImagePrompt } from "@/lib/server/one-click-film/image-polish-service";
import { updateOneClickShot } from "@/lib/server/one-click-film/shot-crud";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 对应 L `POST /storyboards/:id/polish-prompt`。
 *
 * L 的行为：读取本镜 image_prompt/action/dialogue 等字段，连同画风、资产名、前后镜上下文
 * 交给文本模型润色，把结果写回 `polished_prompt`。
 *
 * 这里复用同一套载荷组装（`buildOneClickImagePolishRequest`，系统提示词逐字抄自 L），
 * 落库走一键成片自有的 `updateOneClickShot`，不经由创作工坊。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickImagePolishError("当前剧集不能为空", 400);
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickImagePolishError("一键成片项目不存在", 404);

        const episode = existing.episodes.find((item) => item.id === episodeId);
        if (!episode) throw new OneClickImagePolishError("分集不存在", 404);
        const shot = episode.shots.find((item) => item.id === shotId);
        if (!shot) throw new OneClickImagePolishError("分镜不存在", 404);

        const requestId = `one-click-film-image-polish:${id}:${episodeId}:${shotId}`;
        const result = await polishOneClickImagePrompt({ project: existing, episode, shot }, { userId: user.id, origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)), cookie: request.headers.get("cookie") || "", requestId });

        // L 把润色结果写回 polished_prompt；经典单图生成会优先取它。
        const { project } = updateOneClickShot(existing, episodeId, shotId, { polishedPrompt: result.text });
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { polishedPrompt: result.text, model: result.model, channelId: result.channelId, project: saved }, msg: "图片提示词已润色" });
    } catch (error) {
        const status = error instanceof OneClickImagePolishError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "图片提示词润色失败" }, { status });
    }
}
