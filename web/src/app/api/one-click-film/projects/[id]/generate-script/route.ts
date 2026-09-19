import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeDramaLabStoryOption } from "@/lib/drama-lab-story-options";
import { generateOneClickStory } from "@/lib/server/one-click-film/story-generation-service";
import { OneClickStoryError, mergeOneClickStory } from "@/lib/server/one-click-film/story-generation-contract";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { updateDramaProject, DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/** L multi-episode story expansion, using V routing/billing and CAS project storage. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const body = (await readJsonBody<Record<string, unknown>>(request, 256 * 1024).catch(() => ({}))) as Record<string, unknown>;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickStoryError("一键成片项目不存在", 404);

        const episodeId = typeof body.episodeId === "string" && body.episodeId.trim() ? body.episodeId.trim() : project.activeEpisodeId || project.episodes[0]?.id || "";
        const episode = project.episodes.find((item) => item.id === episodeId);
        if (episodeId && !episode) throw new OneClickStoryError("当前剧集不存在", 400);
        const episodeCount = Number(body.episodeCount ?? 1);
        if (!Number.isSafeInteger(episodeCount) || episodeCount < 1 || episodeCount > 100) throw new OneClickStoryError("生成集数须为1至100的整数", 400);

        // 请求体优先，其次取项目上已保存的选择；两者都空就不注入该字段（服务端会跳过）。
        const storyStyle = normalizeDramaLabStoryOption(body.storyStyle ?? project.storyStyle);
        const scriptType = normalizeDramaLabStoryOption(body.scriptType ?? project.scriptType);
        const storyOutline = typeof body.storyOutline === "string" && body.storyOutline.trim() ? body.storyOutline : episode?.outline?.trim() || project.summary;
        if (!storyOutline?.trim()) throw new OneClickStoryError("请先填写故事梗概或项目简介", 400);

        const publicOrigin = resolvePublicRequestOrigin(request);
        const { episodes, templateKey } = await generateOneClickStory({
            userId: user.id,
            origin: resolveInternalOrigin(publicOrigin),
            cookie: request.headers.get("cookie") || "",
            projectId: project.id,
            episodeId,
            requestId: typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID(),
            storyOutline,
            storyStyle,
            scriptType,
            episodeCount,
        });

        // Model calls can outlive edits/switches. Merge only into the latest target episode.
        // The store CAS protects the final read/write gap; do not submit an old full-project snapshot.
        const latest = await getDramaProjectForUser(user.id, project.id);
        const target = latest.episodes.find((item) => item.id === episodeId);
        if (episode && (!target || target.script !== episode.script)) throw new OneClickStoryError("生成期间本集剧本已修改或删除，请刷新后重新生成", 409);
        const timestamp = new Date().toISOString();
        const updated = await updateDramaProject(
            user.id,
            {
                ...mergeOneClickStory(latest, episodes, episodeId || undefined),
                // Preserve an independently changed project setting rather than resetting it to the request snapshot.
                storyStyle: latest.storyStyle === project.storyStyle ? storyStyle : latest.storyStyle,
                scriptType: latest.scriptType === project.scriptType ? scriptType : latest.scriptType,
                updatedAt: timestamp,
            },
            latest.updatedAt,
        );

        return NextResponse.json({ code: 0, data: { project: updated, episodeId: episodeId || updated.activeEpisodeId, script: episodes[0]?.content || "", episodes, templateKey }, msg: `已生成 ${episodes.length} 集剧本` });
    } catch (error) {
        const status = error instanceof OneClickStoryError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "剧本生成失败" }, { status });
    }
}
