import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { appendDramaLabGenerationHistory, DramaLabShotGenerationError, findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError, getDramaProject } from "@/lib/server/drama-project-store";
import { getImageTask } from "@/lib/server/image-task-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
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
        const patch = generationPatch(shot, imageTask, videoTask, frameTasks);
        const updated = Object.keys(patch).length ? await persistDramaLabShotUpdate({ userId: user.id, project, episodeId, shotId, patch }) : project;

        const activeTaskIds = [imageTask, videoTask, ...frameTasks.map(([, task]) => (task && task.userId === user.id ? task : null))].flatMap((task) => (task && (task.status === "pending" || task.status === "running") ? [task.id] : []));
        if (activeTaskIds.length) {
            const origin = resolveInternalOrigin(new URL(request.url).origin);
            const cookie = request.headers.get("cookie") || "";
            after(() => runGenerationTaskRecoveryBatch({ origin, publicOrigin: new URL(request.url).origin, cookie, limit: activeTaskIds.length, taskIds: activeTaskIds }));
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
    frameTasks: Array<["first" | "key" | "last", Awaited<ReturnType<typeof getImageTask>>]>,
) {
    const patch: Record<string, unknown> = {};
    const frames = { ...(shot.frames || {}) };
    for (const [frameType, task] of frameTasks) {
        const frame = frames[frameType];
        if (!frame || !task || task.userId === undefined) continue;
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
    if (imageTask && imageTask.userId) {
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
    if (videoTask && videoTask.userId) {
        if (videoTask.status === "success") {
            const url = stableUrl(videoTask.result?.url) || stableUrl(videoTask.result?.remoteUrl);
            if (url) {
                if (shot.generationStatus !== "success" || shot.videoUrl !== url || shot.generationError || !shot.videoHistory?.some((entry) => entry.taskId === videoTask.id)) {
                    patch.generationStatus = "success";
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
                    patch.generationError = "分镜视频任务没有返回可播放地址";
                }
            }
        } else if (videoTask.status === "error" || videoTask.status === "cancelled") {
            const error = videoTask.error || (videoTask.status === "cancelled" ? "分镜视频任务已取消" : "分镜视频生成失败");
            if (shot.generationStatus !== videoTask.status || shot.generationError !== error) {
                patch.generationStatus = videoTask.status;
                patch.generationError = error;
            }
        }
    }
    return patch;
}

function stableUrl(value: unknown) {
    const url = typeof value === "string" ? value.trim() : "";
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

function positive(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}
