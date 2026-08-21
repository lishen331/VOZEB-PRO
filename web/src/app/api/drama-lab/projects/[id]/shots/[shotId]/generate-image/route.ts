import { NextResponse } from "next/server";

import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate, prepareDramaLabStoryboardImage } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError, getDramaProject } from "@/lib/server/drama-project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");
        const project = await getDramaProject(id, user.id);
        if (!project) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        const prepared = await prepareDramaLabStoryboardImage(project, episodeId, shotId);
        const settings = await getAuthSettings();
        if (!settings.defaultModels.imageModel) throw new DramaLabShotGenerationError("后台尚未配置可用的默认图片模型", 503);
        const attemptNo = (prepared.shot.storyboardAttempt || 0) + 1;
        const requestId = `drama-lab-storyboard:${project.id}:${episodeId}:${shotId}:attempt-${attemptNo}`;
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        const response = await fetchInternalApi(`${origin}/api/image-tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                cookie: request.headers.get("cookie") || "",
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            },
            body: JSON.stringify({
                kind: prepared.references.length ? "edit" : "generation",
                config: { model: settings.defaultModels.imageModel, size: project.ratio },
                prompt: prepared.prompt,
                references: prepared.references.map((reference) => ({
                    id: reference.id,
                    name: reference.label,
                    type: "image/png",
                    dataUrl: reference.url,
                    url: reference.url,
                    serverUrl: reference.url.startsWith("/") ? reference.url : undefined,
                })),
                source: "drama",
                title: `${project.title} · ${prepared.shot.title}`,
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
                    projectId: project.id,
                    episodeId,
                    shotId,
                    attemptNo,
                    clientRequestId: requestId,
                },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string; model?: string }; error?: string };
        if (!response.ok || !payload.task?.id) throw new DramaLabShotGenerationError(payload.error || "分镜图任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);

        await persistDramaLabShotUpdate({
            userId: user.id,
            project,
            episodeId,
            shotId,
            patch: {
                storyboardStatus: payload.task.status === "success" ? "success" : "running",
                storyboardTaskId: payload.task.id,
                storyboardAttempt: attemptNo,
                storyboardError: undefined,
            },
        });
        return NextResponse.json({ code: 0, data: { task: payload.task, templateKey: prepared.templateKey }, msg: "分镜图任务已创建" });
    } catch (error) {
        const status = error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜图任务创建失败" }, { status });
    }
}
