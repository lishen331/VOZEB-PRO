import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProject } from "@/lib/server/drama-project-store";
import { DramaLabScriptGenerationError, generateDramaLabScript } from "@/lib/server/drama-lab-script-generation-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
        const storyOutline = typeof body.storyOutline === "string" ? body.storyOutline.trim() : "";
        const project = await getDramaProject(id, user.id);
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });
        if (!episodeId || !project.episodes.some((item) => item.id === episodeId)) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不存在" }, { status: 400 });
        const result = await generateDramaLabScript({
            userId: user.id,
            origin: new URL(request.url).origin,
            cookie: request.headers.get("cookie") || "",
            projectId: id,
            episodeId,
            requestId: typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID(),
            storyOutline,
            storyStyle: typeof body.storyStyle === "string" ? body.storyStyle : "",
            scriptType: typeof body.scriptType === "string" ? body.scriptType : "",
            episodeCount: typeof body.episodeCount === "string" ? body.episodeCount : "",
        });
        return NextResponse.json({ code: 0, data: result, msg: "剧本生成完成" });
    } catch (error) {
        const status = error instanceof DramaLabScriptGenerationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "剧本生成失败" }, { status });
    }
}
