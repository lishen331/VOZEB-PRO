import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { readJsonBodyResult } from "@/lib/auth/request";
import { exportDramaEpisodeAsJianying, DramaJianyingExportError } from "@/lib/server/drama-jianying-export";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const parsed = await readJsonBodyResult<{ episodeId?: string; draftPath?: string; version?: string }>(request);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });

        const projectId = (await context.params).id;
        const { project } = await resolveDramaLabProjectForRequest(user.id, projectId);
        await assertDramaLabStageAllowed(user.id, projectId, "final_export");
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "项目不存在" }, { status: 404 });

        const episode = project.episodes.find((item) => item.id === String(parsed.data.episodeId || ""));
        if (!episode) return NextResponse.json({ code: 404, data: null, msg: "短剧剧集不存在" }, { status: 404 });

        const result = await exportDramaEpisodeAsJianying({
            project,
            episode,
            draftPath: String(parsed.data.draftPath || ""),
            version: parsed.data.version === "5" ? "5" : "6",
            origin: resolveInternalOrigin(new URL(request.url).origin),
            cookie: request.headers.get("cookie") || "",
            preferDedicatedAudio: true,
        });

        return new Response(result.data, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
                "Content-Length": String(result.data.byteLength),
            },
        });
    } catch (error) {
        if (error instanceof DramaJianyingExportError || isDramaLabCollaborationError(error)) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("[drama-lab] jianying export failed:", error);
        return NextResponse.json({ code: 500, data: null, msg: "剪映草稿导出失败" }, { status: 500 });
    }
}
