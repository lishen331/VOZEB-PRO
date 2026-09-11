import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabFinalVideoTask, DramaLabFinalVideoError } from "@/lib/server/drama-lab-final-video-service";
import { readReferenceAsset } from "@/lib/server/reference-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; episodeId: string; artifactId: string }> };

export async function GET(request: Request, { params }: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, episodeId, artifactId } = await params;
        const taskId = new URL(request.url).searchParams.get("taskId") || "";
        const task = await getDramaLabFinalVideoTask({ userId: user.id, projectId: id, episodeId, taskId });
        if (task.status !== "success" || task.result?.artifactId !== artifactId) return NextResponse.json({ code: 404, data: null, msg: "成片不存在" }, { status: 404 });
        const asset = await readReferenceAsset(artifactId);
        if (!asset?.registration || asset.registration.type !== "video") return NextResponse.json({ code: 404, data: null, msg: "成片不存在" }, { status: 404 });
        const data = await import("node:fs/promises").then(({ readFile }) => readFile(asset.filePath));
        return new Response(data, {
            headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`短剧成片-${episodeId}.mp4`)}`, "Content-Length": String(data.byteLength), "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        if (error instanceof DramaLabFinalVideoError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("[drama-lab] final video download failed:", error);
        return NextResponse.json({ code: 500, data: null, msg: "成片下载失败" }, { status: 500 });
    }
}
