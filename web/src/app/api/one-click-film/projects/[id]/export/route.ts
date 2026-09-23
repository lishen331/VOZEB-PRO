import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabProjectArchiveError, exportDramaLabProjectForUser } from "@/lib/server/drama-lab-project-archive";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 一键成片交付导出，复用创作工坊已验证的归档实现（同一份字段映射与媒体打包），
 * 只把项目归属校验换成 one-click-film 前缀。
 *
 * GET /api/one-click-film/projects/:id/export?episodeId=e1&episodeId=e2
 */
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await context.params;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const url = new URL(request.url);
        const requested = [...url.searchParams.getAll("episodeId"), ...url.searchParams.getAll("episodeIds")]
            .flatMap((value) => value.split(","))
            .map((value) => value.trim())
            .filter(Boolean);
        const knownEpisodeIds = project.episodes.map((episode) => episode.id);
        const unknown = requested.filter((value) => !knownEpisodeIds.includes(value));
        if (unknown.length) return NextResponse.json({ code: 400, data: null, msg: `以下分集不属于当前项目：${unknown.join("、")}` }, { status: 400 });

        const result = await exportDramaLabProjectForUser({
            userId: user.id,
            projectId: id,
            // 未显式选择分集时导出整个项目，与创作工坊导出语义一致。
            ...(requested.length ? { episodeIds: [...new Set(requested)] } : {}),
            origin: resolveInternalOrigin(url.origin),
            cookie: request.headers.get("cookie") || "",
            includeMedia: true,
        });
        return new Response(result.data, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
                "Content-Length": String(result.data.byteLength),
                "Cache-Control": "private, no-store, max-age=0",
                Pragma: "no-cache",
            },
        });
    } catch (error) {
        if (error instanceof DramaLabProjectArchiveError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("one-click-film project export failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "一键成片项目导出失败" }, { status: 500 });
    }
}
