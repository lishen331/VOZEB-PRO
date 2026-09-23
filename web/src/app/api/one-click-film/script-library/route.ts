import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, listDramaProjectSummariesForUser } from "@/lib/server/drama-project-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 对应 L 的「从剧本库导入」弹窗（L:333–354）：列出当前用户其他一键成片项目的分集剧本，
 * 供本项目直接取用，免去重复粘贴。
 *
 * 只读接口：不写任何数据，导入动作仍由前端走既有的 PUT /projects/:id 落库，
 * 与「导入 TXT / MD」共用同一条写入路径，避免出现第二套剧本写入语义。
 *
 * GET /api/one-click-film/script-library?excludeProjectId=:id
 */
export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    const excludeProjectId = new URL(request.url).searchParams.get("excludeProjectId")?.trim() || "";
    const result = await listDramaProjectSummariesForUser(user.id, { page: 1, pageSize: 100, executionProfile: "production" });
    const loaded = await Promise.all(result.items.map(async (summary) => getDramaProjectForUser(user.id, summary.id).catch(() => null)));

    const projects = loaded
        // 只暴露一键成片自己的项目：教学版创作工坊的剧本不参与商单剧本库（规范 §9.1）。
        .filter((project) => project?.sourceHandoffId?.startsWith("one-click-film:") && project.id !== excludeProjectId)
        .map((project) => ({
            id: project!.id,
            title: project!.title,
            episodes: project!.episodes
                .filter((episode) => episode.script?.trim())
                .map((episode, index) => ({
                    id: episode.id,
                    episodeNumber: episode.episodeNumber ?? index + 1,
                    title: episode.title || `第 ${episode.episodeNumber ?? index + 1} 集`,
                    script: episode.script,
                })),
        }))
        .filter((project) => project.episodes.length > 0);

    return NextResponse.json({ code: 0, data: { projects }, msg: "OK" });
}
