import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickShotCrudError, insertOneClickShotBefore } from "@/lib/server/one-click-film/shot-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 对应 L `POST /storyboards/:id/insert-before`（storyboardService.insertBeforeStoryboard）。
 * 目标及其后分镜序号 +1，在目标位插入空白分镜并继承 segment 信息。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickShotCrudError("当前剧集不能为空");
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickShotCrudError("一键成片项目不存在", 404);

        const { project, shot } = insertOneClickShotBefore(existing, episodeId, shotId);
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { shot, project: saved }, msg: "已在目标分镜前插入" }, { status: 201 });
    } catch (error) {
        const status = error instanceof OneClickShotCrudError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "插入分镜失败" }, { status });
    }
}
