import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickPhotographyInferenceError, inferOneClickEpisodePhotography } from "@/lib/server/one-click-film/photography-inference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { episodeId?: unknown; overwrite?: unknown };

/**
 * 批量推断本集分镜的摄影参数，对应 L `POST /storyboards/batch-infer-params`。
 *
 * 纯本地规则推断（无 AI 调用），所以不涉及模型渠道与计费。
 * `overwrite=false`（默认）只补缺失字段；`true` 覆盖已有值。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await params;
        const body = await readJsonBody<Body>(request, 32 * 1024).catch(() => ({}) as Body);
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
        if (!episodeId) throw new OneClickPhotographyInferenceError("当前剧集不能为空");

        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickPhotographyInferenceError("一键成片项目不存在", 404);

        const result = inferOneClickEpisodePhotography(existing, episodeId, body.overwrite === true);
        if (!result.updated) {
            return NextResponse.json({ code: 0, data: { total: result.total, updated: 0, project: existing }, msg: "没有需要补全的摄影参数" });
        }

        const saved = await updateDramaProjectForUser(user.id, id, result.project);
        return NextResponse.json({ code: 0, data: { total: result.total, updated: result.updated, project: saved }, msg: `已推断 ${result.updated} 个分镜的摄影参数` });
    } catch (error) {
        const status = error instanceof OneClickPhotographyInferenceError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "摄影参数推断失败" }, { status });
    }
}
