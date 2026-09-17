import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { generateOneClickUniversalPrompt, OneClickUniversalPromptError } from "@/lib/server/one-click-film/universal-prompt-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, msg: "一键成片项目不存在" }, { status: 404 });
        const episode = project.episodes.find((item) => item.shots.some((shot) => shot.id === shotId));
        const shot = episode?.shots.find((item) => item.id === shotId);
        if (!episode || !shot) return NextResponse.json({ code: 404, msg: "分镜不存在" }, { status: 404 });

        const body = (await request.json().catch(() => ({}))) as { mode?: unknown; duration?: unknown; draft?: unknown; forceWithoutReferenceImages?: unknown };
        const mode = body.mode === "polish" ? "polish" : "generate";
        if (mode === "polish" && (typeof body.draft !== "string" || !body.draft.trim())) return NextResponse.json({ code: 400, msg: "请先填写或生成全能片段描述后再润色" }, { status: 400 });

        const requestId = `one-click-film-universal-${mode}:${id}:${shotId}:${Date.now()}`;
        const result = await generateOneClickUniversalPrompt(
            { project, shot, duration: typeof body.duration === "number" ? body.duration : undefined, draft: typeof body.draft === "string" ? body.draft : undefined, forceWithoutReferenceImages: body.forceWithoutReferenceImages === true },
            { userId: user.id, origin: resolvePublicRequestOrigin(request), cookie: request.headers.get("cookie") || "", requestId, mode },
        );

        const nextShots = episode.shots.map((item) => (item.id === shotId ? { ...item, universalSegmentText: result.text, creationMode: "universal" as const } : item));
        const nextEpisodes = project.episodes.map((item) => (item.id === episode.id ? { ...item, shots: nextShots } : item));
        const saved = await updateDramaProjectForUser(user.id, id, { ...project, episodes: nextEpisodes });
        const savedShot = saved.episodes.find((item) => item.id === episode.id)?.shots.find((item) => item.id === shotId);

        return NextResponse.json({ code: 0, data: { universalSegmentText: savedShot?.universalSegmentText || result.text, model: result.model, channelId: result.channelId }, msg: "OK" });
    } catch (error) {
        if (error instanceof OneClickUniversalPromptError) return NextResponse.json({ code: error.status, msg: error.message }, { status: error.status });
        return NextResponse.json({ code: 400, msg: error instanceof Error ? error.message : "全能提示词生成失败" }, { status: 400 });
    }
}
