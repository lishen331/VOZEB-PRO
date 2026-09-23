import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickCleanupError, removeOneClickMergeRecord } from "@/lib/server/one-click-film/generation-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 删除本集的成片记录，对应 L `DELETE /video-merges/:merge_id`。
 *
 * 纯数据清理，不调用模型，因此不涉及计费。
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; episodeId: string; recordId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, episodeId, recordId } = await params;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickCleanupError("一键成片项目不存在", 404);

        const result = removeOneClickMergeRecord(project, episodeId, recordId);
        if (!result.removed) return NextResponse.json({ code: 404, data: null, msg: "记录不存在" }, { status: 404 });

        const saved = await updateDramaProjectForUser(user.id, id, result.project);
        return NextResponse.json({ code: 0, data: { project: saved }, msg: "删除成功" });
    } catch (error) {
        const status = error instanceof OneClickCleanupError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "删除失败" }, { status });
    }
}
