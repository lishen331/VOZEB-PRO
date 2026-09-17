import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { startOneClickFilm, oneClickFilmTaskView } from "@/lib/server/one-click-film/service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    const { id } = await params;
    const project = await getDramaProjectForUser(user.id, id);
    if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, msg: "项目不存在" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const allEpisodeIds = project.episodes.map((e) => e.id);
    // 用户显式勾选的分集优先；未勾选才回落到全项目，避免把没选的分集也计费生成。
    const requested = Array.isArray(body.episodeIds) ? body.episodeIds.filter((value: unknown): value is string => typeof value === "string") : [];
    const selected = requested.filter((value: string) => allEpisodeIds.includes(value));
    const unknownEpisodeIds = requested.filter((value: string) => !allEpisodeIds.includes(value));
    if (unknownEpisodeIds.length) return NextResponse.json({ code: 400, msg: `以下分集不属于当前项目：${unknownEpisodeIds.join("、")}` }, { status: 400 });
    const episodeIds = selected.length ? selected : allEpisodeIds;
    if (!episodeIds.length) return NextResponse.json({ code: 400, msg: "当前项目没有分集，无法启动一键成片" }, { status: 400 });
    const task = await startOneClickFilm({
        userId: user.id,
        projectId: id,
        clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : `one-click:${id}:${Date.now()}`,
        sourceEpisodeId: typeof body.episodeId === "string" && episodeIds.includes(body.episodeId) ? body.episodeId : episodeIds[0],
        episodeIds,
        options: typeof body.options === "object" && body.options ? body.options : {},
    });
    return NextResponse.json({ code: 0, data: { task: oneClickFilmTaskView(task) }, msg: "OK" });
}
