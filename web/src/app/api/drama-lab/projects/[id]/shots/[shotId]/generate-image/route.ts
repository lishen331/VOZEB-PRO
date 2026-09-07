import { DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate, prepareDramaLabStoryboardImage } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { maintenanceWorkerContextHeaders, requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "storyboard_image", { episodeId, resourceType: "shot", resourceId: shotId });
        if (!project) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        const prepared = await prepareDramaLabStoryboardImage(project, episodeId, shotId);
        const settings = await getAuthSettings();
        if (!settings.defaultModels.imageModel) throw new DramaLabShotGenerationError("后台尚未配置可用的默认图片模型", 503);
        const attemptNo = (prepared.shot.storyboardAttempt || 0) + 1;
        const requestId = `drama-lab-storyboard:${project.id}:${episodeId}:${shotId}:attempt-${attemptNo}`;
        // Next can expose its internal base URL here (for example the stale
        // 3000 value from .env.local) while the request actually arrived on
        // another local dev port. Resolve from the request Host first.
        const requestOrigin = resolvePublicRequestOrigin(request);
        const origin = resolveInternalOrigin(requestOrigin);
        const credential = requestRuntimeCredential(request, user.id);
        console.info("[drama-lab/generate-image] dispatch", { requestOrigin, origin, configuredOrigin: process.env.VOZEB_PRO_INTERNAL_ORIGIN, port: process.env.PORT });
        const response = await fetchInternalApi(`${origin}/api/image-tasks`, {
            method: "POST",
            headers: runtimeRequestHeaders(credential, {
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            }),
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
            projectOwnerUserId: ownerUserId,
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
        console.error("[drama-lab/generate-image] request failed", {
            message: error instanceof Error ? error.message : String(error),
            cause: error instanceof Error ? error.cause : undefined,
            name: error instanceof Error ? error.name : undefined,
        });
        const status = error instanceof FeatureModuleDisabledError ? 403 : error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError || error instanceof DramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜图任务创建失败" }, { status });
    }
}

function runtimeRequestHeaders(credential: string, initial: Record<string, string>) {
    const workerHeaders = maintenanceWorkerContextHeaders(credential);
    return {
        "Content-Type": "application/json",
        ...(workerHeaders || (credential ? { cookie: credential } : {})),
        ...initial,
    };
}
