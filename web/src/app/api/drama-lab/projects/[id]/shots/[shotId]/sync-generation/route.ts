import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { appendDramaLabGenerationHistory, DramaLabShotGenerationError, findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError, getDramaProject } from "@/lib/server/drama-project-store";
import { getImageTask } from "@/lib/server/image-task-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { getVideoTask } from "@/lib/server/video-task-store";

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
        const { shot } = findShot(project, episodeId, shotId);
        const frameTasks = await Promise.all([
            ...(Object.entries(shot.frames || {}) as Array<["first" | "key" | "last", NonNullable<typeof shot.frames>["first"]]>).map(async ([frameType, frame]) => [frameType, frame?.taskId ? await getImageTask(frame.taskId) : null] as const),
        ]);
        const [storedImageTask, storedVideoTask] = await Promise.all([shot.storyboardTaskId ? getImageTask(shot.storyboardTaskId) : null, shot.generationTaskId ? getVideoTask(shot.generationTaskId) : null]);
        const imageTask = storedImageTask?.userId === user.id ? storedImageTask : null;
        const videoTask = storedVideoTask?.userId === user.id ? storedVideoTask : null;
        const patch = generationPatch(shot, imageTask, videoTask, frameTasks, {
            imageTaskMissing: Boolean(shot.storyboardTaskId && !storedImageTask),
            videoTaskMissing: Boolean(shot.generationTaskId && !storedVideoTask),
            userId: user.id,
        });
        const updated = Object.keys(patch).length ? await persistDramaLabShotUpdate({ userId: user.id, project, episodeId, shotId, patch }) : project;

        const activeTaskIds = [imageTask, videoTask, ...frameTasks.map(([, task]) => (task && task.userId === user.id ? task : null))].flatMap((task) =>
            task && (task.status === "pending" || task.status === "running") && task.executionPhase !== "needs_review" ? [task.id] : [],
        );
        if (activeTaskIds.length) {
            const origin = resolveInternalOrigin(resolvePublicRequestOrigin(request));
            const cookie = request.headers.get("cookie") || "";
            after(() => runGenerationTaskRecoveryBatch({ origin, publicOrigin: resolvePublicRequestOrigin(request), cookie, limit: activeTaskIds.length, taskIds: activeTaskIds }));
        }

        const synchronized = findShot(updated, episodeId, shotId).shot;
        return NextResponse.json({ code: 0, data: { shot: synchronized }, msg: "任务状态已同步" });
    } catch (error) {
        const status = error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "任务状态同步失败" }, { status });
    }
}

function generationPatch(
    shot: ReturnType<typeof findShot>["shot"],
    imageTask: Awaited<ReturnType<typeof getImageTask>>,
    videoTask: Awaited<ReturnType<typeof getVideoTask>>,
    frameTasks: ReadonlyArray<readonly ["first" | "key" | "last", Awaited<ReturnType<typeof getImageTask>>]>,
    options: { imageTaskMissing?: boolean; videoTaskMissing?: boolean; userId?: string } = {},
) {
    const patch: Record<string, unknown> = {};
    const frames = { ...(shot.frames || {}) };
    for (const [frameType, task] of frameTasks) {
        const frame = frames[frameType];
        if (!frame) continue;
        if (!task) {
            if (frame.taskId && isActiveStatus(frame.status)) {
                frames[frameType] = {
                    ...frame,
                    status: "error",
                    taskId: undefined,
                    error: "帧任务记录不存在，可能因服务重启或任务过期丢失，请重新生成",
                };
            }
            continue;
        }
        if (task.userId === undefined || (options.userId && task.userId !== options.userId)) continue;
        if (task.status === "success") {
            const result = task.result as Record<string, unknown> | undefined;
            const url = stableUrl(result?.serverUrl) || stableUrl(result?.remoteUrl) || stableUrl(result?.dataUrl);
            if (url)
                frames[frameType] = {
                    ...frame,
                    status: "success",
                    url,
                    width: positive(result?.width),
                    height: positive(result?.height),
                    error: undefined,
                    history: appendDramaLabGenerationHistory(frame.history, {
                        id: `frame:${frameType}:${task.id}`,
                        taskId: task.id,
                        url,
                        prompt: task.prompt || frame.prompt,
                        createdAt: new Date().toISOString(),
                        width: positive(result?.width),
                        height: positive(result?.height),
                    }),
                };
            else frames[frameType] = { ...frame, status: "error", error: "帧图任务没有返回可持久化图片地址" };
        } else if (task.status === "error" || task.status === "cancelled") frames[frameType] = { ...frame, status: task.status, error: task.error || (task.status === "cancelled" ? "帧图任务已取消" : "帧图生成失败") };
    }
    if (JSON.stringify(frames) !== JSON.stringify(shot.frames || {})) patch.frames = frames;
    // The key frame is the preferred visual input for the new frame workflow.
    // Keep the established storyboard fields in sync so legacy project data and
    // the video route can use the same generated image without a second task.
    const keyFrame = frames.key;
    if (keyFrame?.url) {
        const keyTaskId = keyFrame.taskId;
        if (shot.storyboardStatus !== "success" || shot.storyboardImageUrl !== keyFrame.url || shot.storyboardTaskId !== keyTaskId || shot.storyboardImageWidth !== keyFrame.width || shot.storyboardImageHeight !== keyFrame.height || shot.storyboardError) {
            patch.storyboardStatus = "success";
            patch.storyboardTaskId = keyTaskId;
            patch.storyboardAttempt = keyFrame.attempt;
            patch.storyboardImageUrl = keyFrame.url;
            patch.storyboardImageWidth = keyFrame.width;
            patch.storyboardImageHeight = keyFrame.height;
            patch.storyboardError = undefined;
            patch.storyboardHistory = appendDramaLabGenerationHistory(shot.storyboardHistory, {
                id: `key-frame:${keyTaskId || keyFrame.url}`,
                taskId: keyTaskId || `key-frame:${keyFrame.url}`,
                url: keyFrame.url,
                prompt: keyFrame.prompt,
                createdAt: new Date().toISOString(),
                width: keyFrame.width,
                height: keyFrame.height,
            });
        }
    }
    if (imageTask && imageTask.userId && !keyFrame?.url) {
        if (imageTask.status === "success") {
            const result = imageTask.result as Record<string, unknown> | undefined;
            const url = stableUrl(result?.serverUrl) || stableUrl(result?.remoteUrl) || stableUrl(result?.dataUrl);
            if (url) {
                if (shot.storyboardStatus !== "success" || shot.storyboardImageUrl !== url || shot.storyboardError || !shot.storyboardHistory?.some((entry) => entry.taskId === imageTask.id)) {
                    patch.storyboardStatus = "success";
                    patch.storyboardImageUrl = url;
                    patch.storyboardImageWidth = positive(result?.width);
                    patch.storyboardImageHeight = positive(result?.height);
                    patch.storyboardError = undefined;
                    patch.storyboardHistory = appendDramaLabGenerationHistory(shot.storyboardHistory, {
                        id: `image:${imageTask.id}`,
                        taskId: imageTask.id,
                        url,
                        prompt: imageTask.prompt || shot.imagePrompt,
                        createdAt: new Date().toISOString(),
                        width: positive(result?.width),
                        height: positive(result?.height),
                    });
                }
            } else {
                if (shot.storyboardStatus !== "error" || shot.storyboardError !== "分镜图任务没有返回可持久化图片地址") {
                    patch.storyboardStatus = "error";
                    patch.storyboardError = "分镜图任务没有返回可持久化图片地址";
                }
            }
        } else if (imageTask.status === "error" || imageTask.status === "cancelled") {
            const error = imageTask.error || (imageTask.status === "cancelled" ? "分镜图任务已取消" : "分镜图生成失败");
            if (shot.storyboardStatus !== imageTask.status || shot.storyboardError !== error) {
                patch.storyboardStatus = imageTask.status;
                patch.storyboardError = error;
            }
        }
    }
    if (options.imageTaskMissing && !keyFrame?.url && isActiveStatus(shot.storyboardStatus)) {
        patch.storyboardStatus = "error";
        patch.storyboardTaskId = undefined;
        patch.storyboardError = "分镜图任务记录不存在，可能因服务重启或任务过期丢失，请重新生成";
    }
    if (videoTask && videoTask.userId && videoTask.executionPhase === "needs_review") {
        patch.generationStatus = "error";
        patch.generationNeedsReview = true;
        patch.generationError = videoTask.reviewReason || videoTask.error || "视频任务未能确认上游提交结果，请重新生成";
    } else if (videoTask && videoTask.userId) {
        if (videoTask.status === "running") {
            if (shot.generationStatus !== "running" || shot.generationNeedsReview || shot.generationError) {
                patch.generationStatus = "running";
                patch.generationNeedsReview = undefined;
                patch.generationError = undefined;
            }
        } else if (videoTask.status === "success") {
            const url = stableUrl(videoTask.result?.url) || stableUrl(videoTask.result?.remoteUrl);
            if (url) {
                if (shot.generationStatus !== "success" || shot.videoUrl !== url || shot.generationNeedsReview || shot.generationError || !shot.videoHistory?.some((entry) => entry.taskId === videoTask.id)) {
                    patch.generationStatus = "success";
                    patch.generationNeedsReview = undefined;
                    patch.videoUrl = url;
                    patch.generationError = undefined;
                    patch.videoHistory = appendDramaLabGenerationHistory(shot.videoHistory, {
                        id: `video:${videoTask.id}`,
                        taskId: videoTask.id,
                        url,
                        prompt: videoTask.prompt || shot.videoPrompt,
                        createdAt: new Date().toISOString(),
                    });
                }
            } else {
                if (shot.generationStatus !== "error" || shot.generationError !== "分镜视频任务没有返回可播放地址") {
                    patch.generationStatus = "error";
                    patch.generationNeedsReview = undefined;
                    patch.generationError = "分镜视频任务没有返回可播放地址";
                }
            }
        } else if (videoTask.status === "error" || videoTask.status === "cancelled") {
            const error = videoTask.error || (videoTask.status === "cancelled" ? "分镜视频任务已取消" : "分镜视频生成失败");
            if (shot.generationStatus !== videoTask.status || shot.generationError !== error) {
                patch.generationStatus = videoTask.status;
                patch.generationNeedsReview = undefined;
                patch.generationError = error;
            }
        }
    }
    // A reviewable task is deliberately retained while it exists so the user can
    // recover the original upstream submission. Once that task expires or is gone,
    // clear the retained ID and review flag; otherwise the shot would remain
    // permanently blocked from creating a new video task.
    if (options.videoTaskMissing && (isActiveStatus(shot.generationStatus) || shot.generationNeedsReview)) {
        patch.generationStatus = "error";
        patch.generationNeedsReview = undefined;
        patch.generationTaskId = undefined;
        patch.generationError = "分镜视频任务记录不存在，可能因服务重启或任务过期丢失，请重新生成";
    }
    return patch;
}

function isActiveStatus(value: unknown) {
    return value === "queued" || value === "pending" || value === "running";
}

function stableUrl(value: unknown) {
    const url = typeof value === "string" ? value.trim() : "";
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

function positive(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}
