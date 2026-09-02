import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabCollaborationForUser, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { appendDramaLabGenerationHistory, DramaLabShotGenerationError, findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError, getDramaProject } from "@/lib/server/drama-project-store";
import { getImageTask } from "@/lib/server/image-task-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { getVideoTask } from "@/lib/server/video-task-store";
import { hasStoredGenerationTaskContextConflict } from "@/lib/server/generation-task-store";

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
        if (!project) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        let { shot } = findShot(project, episodeId, shotId);
        // Generation rows are keyed by their creator, but every active
        // collaborator may legitimately poll and persist a result for the
        // shared project. Keep the allow-list project-scoped; never fall back
        // to a platform-wide user lookup.
        const collaboration = await getDramaLabCollaborationForUser(user.id, id);
        const allowedUserIds = Array.from(new Set([user.id, ownerUserId, ...collaboration.members.filter((member) => member.status === "active").map((member) => member.userId)]));
        let taskState = await readTaskState(shot, user.id, { projectId: id, episodeId, shotId }, allowedUserIds);
        let patch = generationPatch(shot, taskState.imageTask, taskState.videoTask, taskState.frameTasks, { ...taskState, allowedUserIds });
        let updated: Awaited<ReturnType<typeof persistDramaLabShotUpdate>> = project;

        if (Object.keys(patch).length) {
            try {
                // Keep the first write conflict-safe: the patch may contain a
                // complete frame map, so blindly replaying it over a newer
                // project snapshot could undo a user's lock or upload.
                updated = await persistDramaLabShotUpdate({ userId: user.id, projectOwnerUserId: ownerUserId, project, episodeId, shotId, patch, retryOnConflict: false });
            } catch (error) {
                if (!isConflict(error)) throw error;
                const latest = await getDramaProject(id, ownerUserId);
                if (!latest) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
                ({ shot } = findShot(latest, episodeId, shotId));
                taskState = await readTaskState(shot, user.id, { projectId: id, episodeId, shotId }, allowedUserIds);
                patch = generationPatch(shot, taskState.imageTask, taskState.videoTask, taskState.frameTasks, { ...taskState, allowedUserIds });
                // The latest snapshot may already include the task result (or
                // a newer user decision), in which case there is nothing to
                // persist. Otherwise apply the freshly computed task-only patch
                // against that snapshot, still without replaying stale data.
                updated = Object.keys(patch).length
                    ? await persistDramaLabShotUpdate({ userId: user.id, projectOwnerUserId: ownerUserId, project: latest, episodeId, shotId, patch, retryOnConflict: false })
                    : latest;
            }
        }

        const activeTaskIds = [taskState.imageTask, taskState.videoTask, ...taskState.frameTasks.map(([, task, match]) => (match === "valid" && task && task.userId && allowedUserIds.includes(task.userId) ? task : null))].flatMap((task) =>
            task && (task.status === "pending" || task.status === "running") && task.executionPhase !== "needs_review" ? [task.id] : [],
        );
        if (activeTaskIds.length) {
            const origin = resolveInternalOrigin(resolvePublicRequestOrigin(request));
            const cookie = request.headers.get("cookie") || "";
            after(() => runGenerationTaskRecoveryBatch({ origin, publicOrigin: resolvePublicRequestOrigin(request), cookie, limit: activeTaskIds.length, taskIds: activeTaskIds }));
        }

        const synchronized = findShot(updated, episodeId, shotId).shot;
        // Execution phase is worker state, not project content. Return it as
        // a transient field so the workbench can distinguish submitted,
        // polling, result-ready and persisting without writing scheduler
        // internals into the project JSON.
        const generationExecutionPhase = taskState.videoTask?.executionPhase;
        const responseShot = generationExecutionPhase ? { ...synchronized, generationExecutionPhase } : synchronized;
        return NextResponse.json({ code: 0, data: { shot: responseShot, executionPhase: generationExecutionPhase }, msg: "任务状态已同步" });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "任务状态同步失败" }, { status });
    }
}

type SyncTaskState = {
    imageTask: Awaited<ReturnType<typeof getImageTask>>;
    videoTask: Awaited<ReturnType<typeof getVideoTask>>;
    frameTasks: ReadonlyArray<readonly ["first" | "key" | "last", Awaited<ReturnType<typeof getImageTask>>, TaskContextMatch]>;
    imageTaskMissing: boolean;
    videoTaskMissing: boolean;
    imageTaskContextMismatch: boolean;
    videoTaskContextMismatch: boolean;
    userId: string;
};

type TaskContextMatch = "valid" | "missing" | "foreign" | "mismatch";

async function readTaskState(shot: ReturnType<typeof findShot>["shot"], userId: string, scope: { projectId: string; episodeId: string; shotId: string }, allowedUserIds: readonly string[] = [userId]): Promise<SyncTaskState> {
    const frameTasks = await Promise.all(
        (Object.entries(shot.frames || {}) as Array<["first" | "key" | "last", NonNullable<typeof shot.frames>["first"]]>).map(async ([frameType, frame]) => [frameType, frame?.taskId ? await getImageTask(frame.taskId) : null] as const),
    );
    const [storedImageTask, storedVideoTask] = await Promise.all([shot.storyboardTaskId ? getImageTask(shot.storyboardTaskId) : null, shot.generationTaskId ? getVideoTask(shot.generationTaskId) : null]);
    const imageMatch = classifyTaskContext(storedImageTask, allowedUserIds, scope);
    const videoMatch = classifyTaskContext(storedVideoTask, allowedUserIds, scope);
    const scopedFrameTasks = frameTasks.map(([frameType, task]) => {
        const match = classifyTaskContext(task, allowedUserIds, { ...scope, frameType });
        // Keep the reason alongside the task. A foreign task must remain
        // untouched; an owned task with stale context can be detached and
        // retried without ever applying its result to this shot.
        return [frameType, match === "valid" ? task : null, match] as const;
    });
    return {
        imageTask: imageMatch === "valid" ? storedImageTask : null,
        videoTask: videoMatch === "valid" ? storedVideoTask : null,
        frameTasks: scopedFrameTasks,
        // A missing record or an owned record whose context no longer matches
        // is recoverable by the current user. A foreign record is deliberately
        // not treated as missing, otherwise a guessed task ID could mutate a
        // user's shot merely by polling it.
        imageTaskMissing: Boolean(shot.storyboardTaskId && (imageMatch === "missing" || imageMatch === "mismatch")),
        videoTaskMissing: Boolean(shot.generationTaskId && (videoMatch === "missing" || videoMatch === "mismatch")),
        imageTaskContextMismatch: imageMatch === "mismatch",
        videoTaskContextMismatch: videoMatch === "mismatch",
    userId,
    };
}

function classifyTaskContext(
    task: { userId?: string; surface?: string; projectId?: string; episodeId?: string; shotId?: string; frameType?: string; context?: unknown } | null | undefined,
    allowedUserIds: readonly string[],
    scope: { projectId: string; episodeId: string; shotId: string; frameType?: string },
): TaskContextMatch {
    if (!task) return "missing";
    const nested = task.context && typeof task.context === "object" && !Array.isArray(task.context) ? (task.context as Record<string, unknown>) : {};
    const owner = typeof task.userId === "string" && task.userId.trim() ? task.userId.trim() : typeof nested.userId === "string" && nested.userId.trim() ? nested.userId.trim() : "";
    if (!owner || !allowedUserIds.includes(owner)) return "foreign";
    return taskMatchesDramaShot(task, scope) ? "valid" : "mismatch";
}

function taskMatchesDramaShot(task: { surface?: string; projectId?: string; episodeId?: string; shotId?: string; frameType?: string; context?: unknown } | null | undefined, scope: { projectId: string; episodeId: string; shotId: string; frameType?: string }) {
    if (!task) return false;
    if (hasStoredGenerationTaskContextConflict(task)) return false;
    const nested = task.context && typeof task.context === "object" && !Array.isArray(task.context) ? (task.context as Record<string, unknown>) : {};
    const resolve = (...values: unknown[]) => {
        const normalized = values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
        return { value: normalized[0] || "", conflict: new Set(normalized).size > 1 };
    };
    const surface = resolve(task.surface, nested.surface);
    const projectId = resolve(task.projectId, nested.projectId);
    const episodeId = resolve(task.episodeId, nested.episodeId);
    const shotId = resolve(task.shotId, nested.shotId);
    const frameType = resolve(task.frameType, nested.frameType);
    if (surface.conflict || projectId.conflict || episodeId.conflict || shotId.conflict || frameType.conflict) return false;
    const coreContext = [surface.value, projectId.value, episodeId.value, shotId.value];
    const hasCoreContext = coreContext.every(Boolean);
    const hasAnyContext = coreContext.some(Boolean) || Boolean(frameType.value);

    // Existing projects may contain tasks created before the drama context
    // contract. Those records can only be reconciled when they carry no
    // context at all; a partial context is ambiguous and must be rejected.
    if (!hasAnyContext) return true;
    if (!hasCoreContext) return false;
    if (surface.value !== "drama" || projectId.value !== scope.projectId || episodeId.value !== scope.episodeId || shotId.value !== scope.shotId) return false;

    // Frame slots are part of the task identity. A task created for one slot
    // must never be promoted into another slot (or into the legacy storyboard
    // field), even when all other shot coordinates happen to match.
    if (scope.frameType) return frameType.value === scope.frameType;
    return !frameType.value;
}

function isConflict(error: unknown) {
    if (error instanceof DramaProjectStoreError) return error.status === 409;
    return Boolean(error && typeof error === "object" && "status" in error && Number((error as { status?: unknown }).status) === 409);
}

function errorStatus(error: unknown) {
    if (error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError) return error.status;
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function generationPatch(
    shot: ReturnType<typeof findShot>["shot"],
    imageTask: Awaited<ReturnType<typeof getImageTask>>,
    videoTask: Awaited<ReturnType<typeof getVideoTask>>,
    frameTasks: ReadonlyArray<readonly ["first" | "key" | "last", Awaited<ReturnType<typeof getImageTask>>, TaskContextMatch]>,
    options: { imageTaskMissing?: boolean; videoTaskMissing?: boolean; imageTaskContextMismatch?: boolean; videoTaskContextMismatch?: boolean; userId?: string; allowedUserIds?: readonly string[] } = {},
) {
    const patch: Record<string, unknown> = {};
    const frames = { ...(shot.frames || {}) };
    for (const [frameType, task, contextMatch] of frameTasks) {
        const frame = frames[frameType];
        if (!frame) continue;
        // A locked frame is an explicit user choice. Task reconciliation may
        // still observe its task, but it must never replace the chosen media
        // or append a new history entry behind the user's back.
        if (frame.locked) continue;
        // A retry can be based on a newer shot snapshot. Do not apply a task
        // result to a frame whose task ID changed while the first write was in
        // flight.
        if (task && frame.taskId !== task.id) continue;
        if (contextMatch === "foreign") continue;
        if (contextMatch === "mismatch") {
            // Preserve a user-selected URL, but detach the stale task ID so a
            // later poll cannot accidentally reconcile a task from another
            // project, episode, shot, or frame slot.
            if (frame.taskId) {
                frames[frameType] = frame.url
                    ? { ...frame, taskId: undefined }
                    : { ...frame, status: "error", taskId: undefined, error: "帧任务上下文与当前分镜不匹配，请重新生成" };
            }
            continue;
        }
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
        if (task.userId === undefined || (options.allowedUserIds ? !options.allowedUserIds.includes(task.userId) : options.userId && task.userId !== options.userId)) continue;
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
                    source: frame.source || "generated",
                    history: appendGenerationHistoryIdempotently(frame.history, {
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
    // The key frame remains authoritative even after the user locks it. A
    // lock prevents task reconciliation from replacing the frame itself, but
    // legacy storyboard fields still need to mirror the chosen key-frame URL
    // so older consumers and the video workflow read the same visual source.
    if (keyFrame?.url) {
        const keyTaskId = keyFrame.taskId || undefined;
        const storyboardTaskId = shot.storyboardTaskId || undefined;
        const storyboardHistoryEntry = {
            id: `key-frame:${keyTaskId || keyFrame.url}`,
            taskId: keyTaskId || `key-frame:${keyFrame.url}`,
            url: keyFrame.url,
            prompt: keyFrame.prompt,
            createdAt: new Date().toISOString(),
            width: keyFrame.width,
            height: keyFrame.height,
        };
        const needsPromotion =
            shot.storyboardStatus !== "success" ||
            shot.storyboardImageUrl !== keyFrame.url ||
            storyboardTaskId !== keyTaskId ||
            shot.storyboardImageWidth !== keyFrame.width ||
            shot.storyboardImageHeight !== keyFrame.height ||
            Boolean(shot.storyboardError) ||
            !hasStableGenerationHistory(shot.storyboardHistory, storyboardHistoryEntry);
        if (needsPromotion) {
            patch.storyboardStatus = "success";
            patch.storyboardTaskId = keyTaskId;
            patch.storyboardAttempt = keyFrame.attempt;
            patch.storyboardImageUrl = keyFrame.url;
            patch.storyboardImageWidth = keyFrame.width;
            patch.storyboardImageHeight = keyFrame.height;
            patch.storyboardError = undefined;
            patch.storyboardHistory = appendGenerationHistoryIdempotently(shot.storyboardHistory, storyboardHistoryEntry);
        }
    }
    if (imageTask && imageTask.userId && shot.storyboardTaskId === imageTask.id && !keyFrame?.url) {
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
                    patch.storyboardHistory = appendGenerationHistoryIdempotently(shot.storyboardHistory, {
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
    if (options.imageTaskContextMismatch && shot.storyboardTaskId) {
        // Keep an already persisted image, but remove the unusable task
        // binding. If the slot was still active, expose an actionable error
        // instead of reporting a task from another shot as pending forever.
        const hasPromotedKeyTask = Boolean(keyFrame?.url && !keyFrame.locked && keyFrame.taskId);
        if (!hasPromotedKeyTask) patch.storyboardTaskId = undefined;
        if (!keyFrame?.url && isActiveStatus(shot.storyboardStatus)) {
            patch.storyboardStatus = "error";
            patch.storyboardError = "分镜图任务上下文与当前项目、剧集或分镜不匹配，请重新生成";
        }
    }
    if (options.imageTaskMissing && !options.imageTaskContextMismatch && !keyFrame?.url && isActiveStatus(shot.storyboardStatus)) {
        patch.storyboardStatus = "error";
        patch.storyboardTaskId = undefined;
        patch.storyboardError = "分镜图任务记录不存在，可能因服务重启或任务过期丢失，请重新生成";
    }
    if (videoTask && videoTask.userId && shot.generationTaskId === videoTask.id && videoTask.executionPhase === "needs_review") {
        patch.generationStatus = "error";
        patch.generationNeedsReview = true;
        patch.generationError = videoTask.reviewReason || videoTask.error || "视频任务未能确认上游提交结果，请重新生成";
    } else if (videoTask && videoTask.userId && shot.generationTaskId === videoTask.id) {
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
                    patch.videoHistory = appendGenerationHistoryIdempotently(shot.videoHistory, {
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
    if (options.videoTaskContextMismatch && shot.generationTaskId) {
        // Do not discard a completed video URL, but detach the task ID so a
        // later poll cannot ever apply a result belonging to another shot.
        patch.generationTaskId = undefined;
        if (isActiveStatus(shot.generationStatus) || shot.generationNeedsReview) {
            patch.generationStatus = "error";
            patch.generationNeedsReview = undefined;
            patch.generationError = "分镜视频任务上下文与当前项目、剧集或分镜不匹配，请重新生成";
        }
    }
    // A reviewable task is deliberately retained while it exists so the user can
    // recover the original upstream submission. Once that task expires or is gone,
    // clear the retained ID and review flag; otherwise the shot would remain
    // permanently blocked from creating a new video task.
    if (options.videoTaskMissing && !options.videoTaskContextMismatch && (isActiveStatus(shot.generationStatus) || shot.generationNeedsReview)) {
        patch.generationStatus = "error";
        patch.generationNeedsReview = undefined;
        patch.generationTaskId = undefined;
        patch.generationError = "分镜视频任务记录不存在，可能因服务重启或任务过期丢失，请重新生成";
    }
    return patch;
}

function appendGenerationHistoryIdempotently(
    history: Parameters<typeof appendDramaLabGenerationHistory>[0],
    entry: Parameters<typeof appendDramaLabGenerationHistory>[1],
) {
    const existing = history || [];
    const sameTask = existing.filter((item) => item.taskId === entry.taskId);
    const matches = hasStableGenerationHistory(existing, entry);
    // Reuse the original array when the task result is unchanged. This keeps
    // polling idempotent and, crucially, preserves the original createdAt.
    // Even if historical data already contains duplicate entries for the same
    // task, an unchanged result is stable. Returning the original array avoids
    // rewriting the project on every poll while leaving legacy duplicates
    // untouched for a separate cleanup operation.
    if (matches) return existing;
    return appendDramaLabGenerationHistory(existing, entry);
}

function hasStableGenerationHistory(
    history: Parameters<typeof appendDramaLabGenerationHistory>[0],
    entry: Parameters<typeof appendDramaLabGenerationHistory>[1],
) {
    const sameTask = (history || []).filter((item) => item.taskId === entry.taskId);
    return sameTask.some((item) => item.url === entry.url && item.prompt === entry.prompt && item.width === entry.width && item.height === entry.height);
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
