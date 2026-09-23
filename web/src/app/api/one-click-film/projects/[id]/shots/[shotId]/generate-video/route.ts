import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate, prepareDramaLabStoryboardVideo } from "@/lib/server/drama-lab-shot-generation-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { maintenanceWorkerContextHeaders, requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import { resolveOneClickVideoCapability } from "@/lib/server/one-click-film/video-capability";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { getVideoTask } from "@/lib/server/video-task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 一键成片自有的分镜视频生成入口，行为基线是 LocalMiniDrama。
 *
 * 之所以不复用 /api/drama-lab/.../generate-video：那条链路把上游 context 的
 * featureModule 写成 "drama-lab"，会把商单用量记到教学版账上，同时让商单链路
 * 依赖教学版的协作阶段闸门。此处只改归属与闸门，提示词/参考图/帧顺序仍复用
 * 同一套 prepareDramaLabStoryboardVideo，保证与 L 的请求载荷等价。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new DramaLabShotGenerationError("一键成片项目不存在", 404);

        const settings = await getAuthSettings();
        const model = settings.defaultModels.videoModel;
        if (!model) throw new DramaLabShotGenerationError("后台尚未配置可用的默认视频模型", 503);

        const capability = resolveOneClickVideoCapability(settings, model);
        const prepared = prepareDramaLabStoryboardVideo(project, episodeId, shotId, {
            model,
            supportsReferenceImages: capability.supportsReferenceImages,
            supportsFirstFrame: capability.supportsFirstFrame,
            supportsLastFrame: capability.supportsLastFrame,
            maxReferenceImages: capability.maxReferenceImages,
        });

        // 去重与"待检查"保护：与 L 一致，绝不重新提交已有的上游任务，避免重复扣费。
        const retainedTaskId = typeof prepared.shot.generationTaskId === "string" ? prepared.shot.generationTaskId.trim() : "";
        const retainedTask = retainedTaskId ? await getVideoTask(retainedTaskId) : null;
        const ownedRetainedTask = retainedTask?.userId === user.id ? retainedTask : null;
        if (retainedTaskId && (prepared.shot.generationNeedsReview || ownedRetainedTask?.executionPhase === "needs_review")) {
            throw new DramaLabShotGenerationError("当前视频任务待检查，请先继续查询原任务；系统不会重新提交或重复扣费。", 409);
        }
        const retainedActive = ownedRetainedTask?.status === "running" || (ownedRetainedTask as { status?: string } | null)?.status === "pending";
        if (retainedTaskId && (prepared.shot.generationStatus === "queued" || prepared.shot.generationStatus === "running" || retainedActive)) {
            throw new DramaLabShotGenerationError("当前分镜已有视频任务正在执行，请先同步任务状态后再操作。", 409);
        }

        const attemptNo = (prepared.shot.generationAttempt || 0) + 1;
        const requestId = `one-click-film-video:${project.id}:${episodeId}:${shotId}:attempt-${attemptNo}`;
        const origin = resolveInternalOrigin(resolvePublicRequestOrigin(request));
        const credential = requestRuntimeCredential(request, user.id);
        const workerHeaders = credential ? maintenanceWorkerContextHeaders(credential) : null;

        const response = await fetchInternalApi(`${origin}/api/video-generation-tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(workerHeaders || (credential ? { cookie: credential } : {})),
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            },
            body: JSON.stringify({
                config: { model, size: project.ratio, videoSeconds: prepared.shot.duration },
                prompt: prepared.prompt,
                references: prepared.references.map((reference) => ({ type: "image" as const, role: reference.role || "reference", url: reference.url })),
                source: "drama",
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
                    // 商单归属：不得写 drama-lab。
                    featureModule: "one-click-film",
                    projectId: project.id,
                    episodeId,
                    shotId,
                    parentTaskId: prepared.parentTaskId || prepared.shot.storyboardTaskId,
                    attemptNo,
                    clientRequestId: requestId,
                    frameSnapshot: prepared.frameSnapshot,
                },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string; model?: string }; error?: string };
        if (!response.ok || !payload.task?.id) {
            throw new DramaLabShotGenerationError(payload.error || "分镜视频任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);
        }

        await persistDramaLabShotUpdate({
            userId: user.id,
            project,
            episodeId,
            shotId,
            patch: {
                ...(prepared.shot.creationMode === "universal" ? { universalSegmentText: prepared.visiblePrompt } : { videoPrompt: prepared.visiblePrompt }),
                // 结果 URL 由 sync 回写；此处保持 running，避免上游秒回成功却没有可播放地址。
                generationStatus: "running",
                generationTaskId: payload.task.id,
                generationAttempt: attemptNo,
                generationNeedsReview: undefined,
                generationError: undefined,
                videoFrameSnapshot: prepared.frameSnapshot,
            },
        });
        return NextResponse.json({ code: 0, data: { task: payload.task }, msg: "分镜视频任务已创建" });
    } catch (error) {
        const status = error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜视频任务创建失败" }, { status });
    }
}
