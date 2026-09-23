import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickShotCrudError, deleteOneClickShot, updateOneClickShot, type OneClickShotPatch } from "@/lib/server/one-click-film/shot-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; shotId: string }> };

async function resolveProject(userId: string, projectId: string) {
    const project = await getDramaProjectForUser(userId, projectId);
    if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickShotCrudError("一键成片项目不存在", 404);
    return project;
}

function episodeIdOf(request: Request) {
    const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
    if (!episodeId) throw new OneClickShotCrudError("当前剧集不能为空");
    return episodeId;
}

function failure(error: unknown, fallback: string) {
    const status = error instanceof OneClickShotCrudError ? error.status : 500;
    return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : fallback }, { status });
}

/**
 * 对应 L `PUT /storyboards/:id`（storyboardService.updateStoryboard）。
 * 只写白名单字段；角色/道具关联整体替换；不清除已保存的首尾帧提示词。
 */
export async function PUT(request: Request, { params }: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    const parsed = await readJsonBodyResult<OneClickShotPatch>(request, 256 * 1024);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });

    try {
        const { id, shotId } = await params;
        const episodeId = episodeIdOf(request);
        const existing = await resolveProject(user.id, id);
        const { project, shot } = updateOneClickShot(existing, episodeId, shotId, parsed.data || {});
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { shot, project: saved }, msg: "分镜已更新" });
    } catch (error) {
        return failure(error, "分镜更新失败");
    }
}

/** 对应 L `DELETE /storyboards/:id`。L 用 deleted_at 软删，V 直接移除元素并重排序号。 */
export async function DELETE(request: Request, { params }: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = episodeIdOf(request);
        const existing = await resolveProject(user.id, id);
        const project = deleteOneClickShot(existing, episodeId, shotId);
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { project: saved }, msg: "分镜已删除" });
    } catch (error) {
        return failure(error, "分镜删除失败");
    }
}
