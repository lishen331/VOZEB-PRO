import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { acceptDramaLabFirstFrameCandidate } from "@/lib/server/drama-lab-tail-frame-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 把上一镜提取出的尾帧候选正式应用为当前分镜的首帧，
 * 即 L `link-tail-frame` 的后半段（更新下一分镜的 first_frame_image_id）。
 *
 * 与创作工坊同一份 `acceptDramaLabFirstFrameCandidate` 实现，保证语义等价；
 * 差别只有项目归属校验，不走教学版阶段闸门。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const search = new URL(request.url).searchParams;
        const episodeId = search.get("episodeId")?.trim() || "";
        const candidateId = search.get("candidateId")?.trim() || "";
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });
        if (!candidateId) return NextResponse.json({ code: 400, data: null, msg: "候选首帧不能为空" }, { status: 400 });
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const data = await acceptDramaLabFirstFrameCandidate({
            userId: user.id,
            project,
            episodeId,
            shotId,
            candidateId,
            replaceExisting: search.get("replaceExisting") === "true",
        });
        return NextResponse.json({ code: 0, data, msg: "候选首帧已应用" });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "候选首帧应用失败" }, { status });
    }
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
