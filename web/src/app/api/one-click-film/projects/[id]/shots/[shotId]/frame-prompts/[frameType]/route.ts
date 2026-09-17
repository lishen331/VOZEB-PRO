import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickFramePromptError, isOneClickFrameType, saveOneClickFramePrompt } from "@/lib/server/one-click-film/frame-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { prompt?: unknown; description?: unknown; layout?: unknown };

/**
 * 对应 L `PUT /storyboards/:id/frame-prompts/:frame_type`。
 * 整条覆盖 prompt/description/layout；不影响已生成的帧图状态。
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; shotId: string; frameType: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    const parsed = await readJsonBodyResult<Body>(request, 256 * 1024);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });

    try {
        const { id, shotId, frameType } = await params;
        if (!isOneClickFrameType(frameType)) throw new OneClickFramePromptError("不支持的 frame_type");
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickFramePromptError("当前剧集不能为空");
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickFramePromptError("一键成片项目不存在", 404);

        const body = parsed.data || {};
        const { project, framePrompts } = saveOneClickFramePrompt(existing, episodeId, shotId, frameType, {
            prompt: typeof body.prompt === "string" ? body.prompt : "",
            ...(typeof body.description === "string" ? { description: body.description } : {}),
            ...(typeof body.layout === "string" ? { layout: body.layout } : {}),
        });
        await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { frameType, framePrompts }, msg: "保存成功" });
    } catch (error) {
        const status = error instanceof OneClickFramePromptError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "保存帧提示词失败" }, { status });
    }
}
