import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabFinalVideoError, getDramaLabFinalVideoTask } from "@/lib/server/drama-lab-final-video-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { readReferenceAsset } from "@/lib/server/reference-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; episodeId: string; artifactId: string }> };

/**
 * 下载本集成片，对应 L `GET /episodes/:episode_id/download`。
 *
 * 与创作工坊同一份实现，差别只有项目归属校验：必须是一键成片项目，
 * 否则商单入口会变成读取任意短剧成片的通道。
 */
export async function GET(request: Request, { params }: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, episodeId, artifactId } = await params;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const taskId = new URL(request.url).searchParams.get("taskId") || "";
        const task = await getDramaLabFinalVideoTask({ userId: user.id, projectId: id, episodeId, taskId });
        if (task.status !== "success" || task.result?.artifactId !== artifactId) return NextResponse.json({ code: 404, data: null, msg: "成片不存在" }, { status: 404 });

        const asset = await readReferenceAsset(artifactId);
        if (!asset?.registration || asset.registration.type !== "video") return NextResponse.json({ code: 404, data: null, msg: "成片不存在" }, { status: 404 });
        const data = await import("node:fs/promises").then(({ readFile }) => readFile(asset.filePath));
        return new Response(data, {
            headers: {
                "Content-Type": "video/mp4",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`一键成片-${episodeId}.mp4`)}`,
                "Content-Length": String(data.byteLength),
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        const status = error instanceof DramaLabFinalVideoError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "成片下载失败" }, { status });
    }
}
