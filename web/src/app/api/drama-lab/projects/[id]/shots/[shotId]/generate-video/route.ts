import { NextResponse } from "next/server";

import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, DramaLabCollaborationError, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate, prepareDramaLabStoryboardVideo } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { getVideoTask } from "@/lib/server/video-task-store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveGlobalAiOpcPreset } from "@/lib/globalaiopc-catalog";
import { templateVideoReferenceRoles } from "@/lib/server/provider-task-config";
import { maintenanceWorkerContextHeaders, requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import type { VideoReferenceRole } from "@/lib/video-reference-contract";

type VideoCandidate = ReturnType<typeof resolveLogicalModelCandidates>[number];

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
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "storyboard_video", { episodeId, resourceType: "shot", resourceId: shotId });
        if (!project) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        const settings = await getAuthSettings();
        if (!settings.defaultModels.videoModel) throw new DramaLabShotGenerationError("后台尚未配置可用的默认视频模型", 503);
        const candidates = Array.isArray(settings.logicalModels) && Array.isArray(settings.systemChannels) ? resolveLogicalModelCandidates(settings, "video", settings.defaultModels.videoModel) : [];
        // A logical model can fail over across channels. Keep the tail frame
        // only when every viable candidate explicitly supports it; otherwise
        // the provider route would reject the whole request after fallback.
        const supportsFirstFrame = candidates.length ? candidates.every(candidateSupportsFirstFrame) : undefined;
        const supportsLastFrame = candidates.length ? candidates.every(candidateSupportsLastFrame) : false;
        const maxReferenceImages = minimumReferenceLimit(candidates);
        const prepared = prepareDramaLabStoryboardVideo(project, episodeId, shotId, { model: settings.defaultModels.videoModel, supportsFirstFrame, supportsLastFrame, maxReferenceImages });
        const retainedTaskId = typeof prepared.shot.generationTaskId === "string" ? prepared.shot.generationTaskId.trim() : "";
        const retainedTask = retainedTaskId ? await getVideoTask(retainedTaskId) : null;
        const ownedRetainedTask = retainedTask?.userId === user.id ? retainedTask : null;
        if (retainedTaskId && (prepared.shot.generationNeedsReview || ownedRetainedTask?.executionPhase === "needs_review")) {
            throw new DramaLabShotGenerationError("当前视频任务待检查，请先点击“检查状态”继续查询原任务；系统不会重新提交或重复扣费。", 409);
        }
        const retainedTaskActive = ownedRetainedTask?.status === "running" || (ownedRetainedTask as { status?: string } | null)?.status === "pending";
        if (retainedTaskId && (prepared.shot.generationStatus === "queued" || prepared.shot.generationStatus === "running" || retainedTaskActive)) {
            throw new DramaLabShotGenerationError("当前分镜已有视频任务正在执行，请先同步任务状态后再操作。", 409);
        }
        const attemptNo = (prepared.shot.generationAttempt || 0) + 1;
        const requestId = `drama-lab-video:${project.id}:${episodeId}:${shotId}:attempt-${attemptNo}`;
        // Keep internal dispatch on the listener that accepted this request;
        // request.url may contain a stale local development port.
        const requestOrigin = resolvePublicRequestOrigin(request);
        const origin = resolveInternalOrigin(requestOrigin);
        const credential = requestRuntimeCredential(request, user.id);
        console.info("[drama-lab/generate-video] dispatch", { requestOrigin, origin, configuredOrigin: process.env.VOZEB_PRO_INTERNAL_ORIGIN, port: process.env.PORT });
        const response = await fetchInternalApi(`${origin}/api/video-generation-tasks`, {
            method: "POST",
            headers: runtimeRequestHeaders(credential, {
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            }),
            body: JSON.stringify({
                config: { model: settings.defaultModels.videoModel, size: project.ratio, videoSeconds: prepared.shot.duration },
                prompt: prepared.prompt,
                references: prepared.references.map((reference) => ({ type: "image" as const, role: reference.role || "reference", url: reference.url })),
                source: "drama",
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
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
        if (!response.ok || !payload.task?.id) throw new DramaLabShotGenerationError(payload.error || "分镜视频任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);

        await persistDramaLabShotUpdate({
            userId: user.id,
            projectOwnerUserId: ownerUserId,
            project,
            episodeId,
            shotId,
            patch: {
                videoPrompt: prepared.visiblePrompt,
                // Result URLs are persisted by sync-generation after the task record has
                // been reconciled. Keep this active until that happens so an immediate
                // upstream success cannot leave the card terminal without a playable URL.
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
        console.error("[drama-lab/generate-video] request failed", {
            message: error instanceof Error ? error.message : String(error),
            cause: error instanceof Error ? error.cause : undefined,
            name: error instanceof Error ? error.name : undefined,
        });
        const status = error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError || error instanceof DramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜视频任务创建失败" }, { status });
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

function candidateSupportsLastFrame(candidate: VideoCandidate) {
    return candidateVideoReferenceRoles(candidate).includes("last_frame");
}

function candidateSupportsFirstFrame(candidate: VideoCandidate) {
    return candidateVideoReferenceRoles(candidate).includes("first_frame");
}

function candidateVideoReferenceRoles(candidate: VideoCandidate): VideoReferenceRole[] {
    const advanced = candidate.channel.advancedConfig;
    const preset = resolveGlobalAiOpcPreset(advanced, candidate.upstreamModel);
    if (preset?.videoReferenceRoles) return preset.videoReferenceRoles;
    if (candidate.channel.apiFormat === "gemini" || advanced?.protocol === "gemini") return ["reference", "first_frame", "last_frame"];
    if (advanced?.protocol === "seedance" || advanced?.protocol === "volcengine-video" || advanced?.protocol === "seedance-special") return ["reference", "first_frame", "last_frame"];
    if (advanced?.protocol === "openai" || advanced?.protocol === "newapi" || advanced?.protocol === "sub2api") return ["reference", "first_frame"];
    return templateVideoReferenceRoles(advanced?.requestTemplate);
}

function minimumReferenceLimit(candidates: VideoCandidate[]) {
    const limits = candidates.flatMap((candidate) => {
        const value = candidate.capabilityProfile?.maxReferenceImages;
        return typeof value === "number" && Number.isFinite(value) && value > 0 ? [Math.floor(value)] : [];
    });
    return limits.length ? Math.min(...limits) : undefined;
}
