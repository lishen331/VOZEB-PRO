import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { OneClickUpscaleError, upscaleOneClickStoryboardImage } from "@/lib/server/one-click-film/storyboard-upscale";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 分镜图 2 倍超分，对应 L `POST /storyboards/:id/upscale`。
 *
 * 纯本地 sharp 处理，不调用模型，因此不涉及模型渠道与计费。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickUpscaleError("当前剧集不能为空");

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickUpscaleError("一键成片项目不存在", 404);

        const result = await upscaleOneClickStoryboardImage({
            userId: user.id,
            project,
            episodeId,
            shotId,
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            cookie: request.headers.get("cookie") || "",
        });
        return NextResponse.json({ code: 0, data: result, msg: `分镜图已放大到 ${result.width}x${result.height}` });
    } catch (error) {
        const status = error instanceof OneClickUpscaleError ? error.status : errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜图超分失败" }, { status });
    }
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
