import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickShotCrudError, createOneClickShot, type OneClickShotPatch } from "@/lib/server/one-click-film/shot-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 对应 L `POST /storyboards`（storyboardService.createStoryboard）。
 * POST /api/one-click-film/projects/:id/shots?episodeId=:episodeId
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    const parsed = await readJsonBodyResult<OneClickShotPatch>(request, 256 * 1024);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });

    try {
        const { id } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickShotCrudError("当前剧集不能为空");
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickShotCrudError("一键成片项目不存在", 404);

        const { project, shot } = createOneClickShot(existing, episodeId, parsed.data || {});
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { shot, project: saved }, msg: "分镜已创建" }, { status: 201 });
    } catch (error) {
        const status = error instanceof OneClickShotCrudError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜创建失败" }, { status });
    }
}
