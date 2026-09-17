import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { extractDramaLabTailFrame } from "@/lib/server/drama-lab-tail-frame-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 对应 L `POST /storyboards/:id/link-tail-frame`（tailFrameLinkService）。
 *
 * L 用 ffmpeg 从当前分镜已完成的视频里抽最后一帧，写成图片记录，再挂到下一个分镜的首帧上，
 * 以此实现首尾帧连续性。V 已有等价实现 `extractDramaLabTailFrame`（该服务无模块身份耦合），
 * 因此这里复用它，只把项目归属校验换成 one-click-film 前缀、不引入教学版阶段闸门。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const data = await extractDramaLabTailFrame({
            userId: user.id,
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            cookie: request.headers.get("cookie") || "",
            project,
            episodeId,
            shotId,
        });
        return NextResponse.json({ code: 0, data, msg: "视频尾帧已提取" });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "视频尾帧提取失败" }, { status });
    }
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
