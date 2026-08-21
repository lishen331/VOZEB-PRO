import { NextResponse } from "next/server";
import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { getDramaProject } from "@/lib/server/drama-project-store";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { findShot } from "@/lib/server/drama-lab-shot-generation-service";
import { isDramaShotFrameType, prepareDramaLabFrame } from "@/lib/server/drama-lab-frame-generation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const url = new URL(request.url);
        const episodeId = url.searchParams.get("episodeId")?.trim() || "";
        const frameType = url.searchParams.get("frameType")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");
        if (!isDramaShotFrameType(frameType)) throw new DramaLabShotGenerationError("frameType 必须是 first、key 或 last");
        const project = await getDramaProject(id, user.id);
        if (!project) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        const attemptNo = (findShot(project, episodeId, shotId).shot.frames?.[frameType]?.attempt || 0) + 1;
        const requestId = `drama-lab-frame:${project.id}:${episodeId}:${shotId}:${frameType}:attempt-${attemptNo}`;
        const prepared = await prepareDramaLabFrame({ userId: user.id, origin: url.origin, cookie: request.headers.get("cookie") || "", requestId, project, episodeId, shotId, frameType });
        const settings = await getAuthSettings();
        if (!settings.defaultModels.imageModel) throw new DramaLabShotGenerationError("后台尚未配置可用的默认图片模型", 503);
        const origin = resolveInternalOrigin(url.origin);
        const response = await fetchInternalApi(`${origin}/api/image-tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "", "X-VOZEB-PRO-Client-Request-Id": requestId, "X-VOZEB-PRO-Attempt-No": String(attemptNo) },
            body: JSON.stringify({
                kind: prepared.references.length ? "edit" : "generation",
                config: { model: settings.defaultModels.imageModel, size: project.ratio },
                prompt: prepared.prompt,
                references: prepared.references.map((reference) => ({ id: reference.id, name: reference.label, type: "image/png", dataUrl: reference.url, url: reference.url, serverUrl: reference.url.startsWith("/") ? reference.url : undefined })),
                source: "drama",
                title: `${project.title} · ${prepared.shot.title} · ${frameType}`,
                context: { conversationId: project.creativeConversationId, surface: "drama", projectId: project.id, episodeId, shotId, frameType, attemptNo, clientRequestId: requestId },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string; model?: string }; error?: string };
        if (!response.ok || !payload.task?.id) throw new DramaLabShotGenerationError(payload.error || "帧图任务创建失败", response.status || 502);
        const frame = { prompt: prepared.prompt, description: prepared.description, status: payload.task.status === "success" ? "success" : "running", taskId: payload.task.id, attempt: attemptNo, error: undefined } as const;
        await persistDramaLabShotUpdate({ userId: user.id, project, episodeId, shotId, patch: { frames: { ...findShot(project, episodeId, shotId).shot.frames, [frameType]: frame } } });
        return NextResponse.json({ code: 0, data: { task: payload.task, frameType, templateKey: prepared.templateKey, prompt: prepared.prompt, description: prepared.description }, msg: "帧图任务已创建" });
    } catch (error) {
        const status = error instanceof DramaLabShotGenerationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "帧图任务创建失败" }, { status });
    }
}
