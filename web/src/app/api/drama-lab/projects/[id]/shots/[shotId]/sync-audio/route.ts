import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabAudioError, assertAudioTaskBinding, syncDramaLabAudioTask } from "@/lib/server/drama-lab-audio-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || "";
        const kind = new URL(request.url).searchParams.get("kind") === "narration" ? "narration" : "dialogue";
        if (!episodeId || !taskId) throw new DramaLabAudioError("剧集和音频任务不能为空");
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        if (!project) throw new DramaLabAudioError("短剧项目不存在", 404);
        const shot = project.episodes.find((episode) => episode.id === episodeId)?.shots.find((item) => item.id === shotId);
        if (!shot) throw new DramaLabAudioError("短剧镜头不存在", 404);
        assertAudioTaskBinding(shot, kind, taskId);
        const updated = await syncDramaLabAudioTask({ userId: user.id, projectOwnerUserId: ownerUserId, project, episodeId, shotId, taskId, kind });
        const updatedShot = updated.episodes.find((episode) => episode.id === episodeId)?.shots.find((item) => item.id === shotId);
        return NextResponse.json({ code: 0, data: { shot: updatedShot, project: updated }, msg: "短剧音频状态已同步" });
    } catch (error) {
        const status = error instanceof DramaLabAudioError || error instanceof DramaProjectStoreError || isDramaLabCollaborationError(error) ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "短剧音频状态同步失败" }, { status });
    }
}
