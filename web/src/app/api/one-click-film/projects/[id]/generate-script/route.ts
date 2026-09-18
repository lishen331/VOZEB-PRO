import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeDramaLabStoryOption } from "@/lib/drama-lab-story-options";
import { DramaLabScriptGenerationError, generateDramaLabScript } from "@/lib/server/drama-lab-script-generation-service";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 用故事梗概 + 故事风格 + 剧本类型生成本集剧本。
 *
 * 背景：`storyStyle` / `scriptType` 此前在一键成片里是哑参数 —— 能存进项目，
 * 但一键成片的 script 步骤只校验"剧本非空"，从不生成剧本，所以这两个字段永远不影响产物。
 * 这里补上真正消费它们的入口。
 *
 * 复用 `generateDramaLabScript`：该服务无模块身份耦合（只做提示词组装 + 文本模型调用 + 计费退款），
 * 且它是唯一真正把这两个字段写进模型上下文的地方（`dramaLabStoryOptionLabel` 会把
 * 预设值翻成中文标签再注入）。
 *
 * 与 drama-lab 那条的差别：项目归属校验换成 one-click-film 前缀、不走教学版阶段闸门与模块开关。
 *
 * POST /api/one-click-film/projects/:id/generate-script
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const body = (await readJsonBody<Record<string, unknown>>(request, 256 * 1024).catch(() => ({}))) as Record<string, unknown>;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new DramaLabScriptGenerationError("一键成片项目不存在", 404);

        const episodeId = typeof body.episodeId === "string" && body.episodeId.trim() ? body.episodeId.trim() : project.activeEpisodeId || project.episodes[0]?.id || "";
        const episode = project.episodes.find((item) => item.id === episodeId);
        if (!episode) throw new DramaLabScriptGenerationError("当前剧集不存在", 400);

        // 请求体优先，其次取项目上已保存的选择；两者都空就不注入该字段（服务端会跳过）。
        const storyStyle = normalizeDramaLabStoryOption(body.storyStyle ?? project.storyStyle);
        const scriptType = normalizeDramaLabStoryOption(body.scriptType ?? project.scriptType);
        const storyOutline = typeof body.storyOutline === "string" && body.storyOutline.trim() ? body.storyOutline : episode.outline?.trim() || project.summary;
        if (!storyOutline?.trim()) throw new DramaLabScriptGenerationError("请先填写故事梗概或项目简介", 400);

        const publicOrigin = resolvePublicRequestOrigin(request);
        const { script, templateKey } = await generateDramaLabScript({
            userId: user.id,
            origin: resolveInternalOrigin(publicOrigin),
            cookie: request.headers.get("cookie") || "",
            projectId: project.id,
            episodeId,
            requestId: typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID(),
            storyOutline,
            storyStyle,
            scriptType,
            episodeCount: String(project.episodes.length || 1),
        });

        // 生成结果直接写回本集剧本，并把这次用的风格/类型固化到项目上，
        // 让后续"重新生成"与前端回显保持一致。
        const nextEpisodes = project.episodes.map((item) => (item.id === episodeId ? { ...item, script, updatedAt: new Date().toISOString() } : item));
        const updated = await updateDramaProjectForUser(user.id, project.id, {
            ...project,
            episodes: nextEpisodes,
            storyStyle,
            scriptType,
            updatedAt: new Date().toISOString(),
        });

        return NextResponse.json({ code: 0, data: { project: updated, episodeId, script, templateKey }, msg: "本集剧本已生成" });
    } catch (error) {
        const status = error instanceof DramaLabScriptGenerationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "剧本生成失败" }, { status });
    }
}
