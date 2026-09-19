import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { appendDramaLabGenerationHistory, findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { getImageTask } from "@/lib/server/image-task-store";
import { getVideoTask } from "@/lib/server/video-task-store";

import { splitOneClickSequenceGrid } from "./sequence-grid-split";

export class OneClickSyncError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

/**
 * 一键成片的分镜结果回写。
 *
 * 为什么必须自建：调 sync 的原本只有创作工坊工作流服务、创作工坊 UI 和视频恢复服务，
 * 而 images/videos 步已改走一键成片自有路由，等于没有任何东西会回写商单分镜 ——
 * media-runner 会永久停在 pending。通用恢复服务只负责推进上游任务本身，不回写分镜。
 *
 * 与 L 一致的关键语义：
 * - 上游成功但没有可播放地址 → 记 error，不假装成功；
 * - 历史条目按 taskId + 结果幂等，结果未变则复用原数组以保住原 createdAt；
 * - 任务记录丢失（重启/过期）→ 解绑 taskId 并记 error，避免分镜被永久锁死；
 * - 回写只允许项目所有者（商单不走教学版协作成员表）。
 *
 * 首/关键/尾帧独立回写；已消费的任务不会再次覆盖用户选择的历史结果。
 * 乐观锁冲突交回调用方重新读取，绝不将旧 patch 重放到新的用户选择上。
 */
export type OneClickSyncResult = { project: DramaProject; shot: DramaShot; changed: boolean };

export async function syncOneClickShotGeneration(input: {
    userId: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
    /** 拆图需要下载原图，故需 origin/cookie；缺省则跳过拆图（回写照常）。 */
    origin?: string;
    cookie?: string;
    /** 注入点，便于测试断言拆图是否被触发。 */
    splitSequenceGrid?: typeof splitOneClickSequenceGrid;
}): Promise<OneClickSyncResult> {
    const { shot } = findShot(input.project, input.episodeId, input.shotId);
    const patch: Partial<DramaShot> = {};

    await applyImagePatch(shot, patch);
    await applyVideoPatch(shot, patch);
    await applyFramePatch(shot, patch);

    if (!Object.keys(patch).length) return { project: input.project, shot, changed: false };

    let project = await persistDramaLabShotUpdate({ userId: input.userId, project: input.project, episodeId: input.episodeId, shotId: input.shotId, patch, retryOnConflict: false });
    let next = findShot(project, input.episodeId, input.shotId).shot;

    /**
     * 网格图刚回写成功时，按象限拆成候选图。
     *
     * 放在这里而不是生图路由里：生图路由只提交任务，那时还没有图片。
     * 这一步是纯本地 sharp 裁剪，不调模型、不计费。
     *
     * 拆分失败绝不能把已成功的生图判为失败 —— 整张网格图已经可用，
     * 否则用户白付一次费用。所以只吞掉错误并保留已完成的回写结果。
     */
    const mode = next.storyboardSequenceMode;
    const gridTaskId = next.storyboardTaskId?.trim();
    const alreadySplit = next.storyboardHistory?.some((entry) => entry.id.startsWith(`sequence-panel:${gridTaskId}:`));
    if (patch.storyboardStatus === "success" && (mode === "quad_grid" || mode === "nine_grid") && gridTaskId && next.storyboardImageUrl && !alreadySplit && input.origin) {
        try {
            const split = await (input.splitSequenceGrid || splitOneClickSequenceGrid)({
                userId: input.userId,
                project,
                episodeId: input.episodeId,
                shotId: input.shotId,
                mode,
                sourceUrl: next.storyboardImageUrl,
                taskId: gridTaskId,
                origin: input.origin,
                cookie: input.cookie,
            });
            project = split.project;
            next = findShot(project, input.episodeId, input.shotId).shot;
        } catch {
            // 保留原图与成功状态：候选拆分是增强，不是成片前提。
        }
    }

    return { project, shot: next, changed: true };
}

async function applyImagePatch(shot: DramaShot, patch: Partial<DramaShot>) {
    const taskId = shot.storyboardTaskId?.trim();
    if (!taskId) return;
    if (shot.storyboardStatus === "success" && shot.storyboardHistory?.some((entry) => entry.taskId === taskId)) return;
    const task = await getImageTask(taskId);
    if (!task) {
        if (isActive(shot.storyboardStatus)) {
            patch.storyboardStatus = "error";
            patch.storyboardTaskId = undefined;
            patch.storyboardError = "分镜图任务记录不存在，可能因服务重启或任务过期丢失，请重新生成";
        }
        return;
    }
    if (task.status === "success") {
        // ImageTask.result 是 StoredImageTaskMediaResult：只有 dataUrl/remoteUrl/serverUrl，没有 url。
        // 优先级与 L 一致：可持久化地址优先，dataUrl 兜底。
        const result = task.result as Record<string, unknown> | undefined;
        const url = stableUrl(result?.serverUrl) || stableUrl(result?.remoteUrl) || stableUrl(result?.dataUrl);
        if (!url) {
            if (shot.storyboardStatus !== "error" || shot.storyboardError !== "分镜图任务没有返回可持久化图片地址") {
                patch.storyboardStatus = "error";
                patch.storyboardError = "分镜图任务没有返回可持久化图片地址";
            }
            return;
        }
        const width = positive(result?.width);
        const height = positive(result?.height);
        if (shot.storyboardStatus !== "success" || shot.storyboardImageUrl !== url || shot.storyboardError || !shot.storyboardHistory?.some((entry) => entry.taskId === task.id)) {
            patch.storyboardStatus = "success";
            patch.storyboardImageUrl = url;
            patch.storyboardImageWidth = width;
            patch.storyboardImageHeight = height;
            patch.storyboardError = undefined;
            patch.storyboardHistory = appendHistoryIdempotently(shot.storyboardHistory, {
                id: `image:${task.id}`,
                taskId: task.id,
                url,
                prompt: task.prompt || shot.imagePrompt,
                createdAt: new Date().toISOString(),
                ...(width === undefined ? {} : { width }),
                ...(height === undefined ? {} : { height }),
            });
        }
        return;
    }
    if (task.status === "error" || task.status === "cancelled") {
        const error = task.error || (task.status === "cancelled" ? "分镜图任务已取消" : "分镜图生成失败");
        if (shot.storyboardStatus !== task.status || shot.storyboardError !== error) {
            patch.storyboardStatus = task.status;
            patch.storyboardError = error;
        }
    }
}

async function applyVideoPatch(shot: DramaShot, patch: Partial<DramaShot>) {
    const taskId = shot.generationTaskId?.trim();
    if (!taskId) return;
    if (shot.generationStatus === "success" && shot.videoHistory?.some((entry) => entry.taskId === taskId)) return;
    const task = await getVideoTask(taskId);
    if (!task) {
        if (isActive(shot.generationStatus) || shot.generationNeedsReview) {
            patch.generationStatus = "error";
            patch.generationTaskId = undefined;
            patch.generationNeedsReview = undefined;
            patch.generationError = "分镜视频任务记录不存在，可能因服务重启或任务过期丢失，请重新生成";
        }
        return;
    }
    if (task.status === "success") {
        const url = stableUrl(task.result?.url) || stableUrl(task.result?.remoteUrl);
        if (!url) {
            if (shot.generationStatus !== "error") {
                patch.generationStatus = "error";
                patch.generationNeedsReview = undefined;
                patch.generationError = "分镜视频任务没有返回可播放地址";
            }
            return;
        }
        if (shot.generationStatus !== "success" || shot.videoUrl !== url || shot.generationNeedsReview || shot.generationError) {
            patch.generationStatus = "success";
            patch.generationNeedsReview = undefined;
            patch.videoUrl = url;
            patch.generationError = undefined;
            patch.videoHistory = appendHistoryIdempotently(shot.videoHistory, {
                id: `video:${task.id}`,
                taskId: task.id,
                url,
                prompt: task.prompt || shot.videoPrompt,
                createdAt: new Date().toISOString(),
            });
        }
        return;
    }
    if (task.status === "error" || task.status === "cancelled") {
        const error = task.error || (task.status === "cancelled" ? "分镜视频任务已取消" : "分镜视频生成失败");
        if (shot.generationStatus !== task.status || shot.generationError !== error) {
            patch.generationStatus = task.status;
            patch.generationNeedsReview = undefined;
            patch.generationError = error;
        }
    }
}

/** 结果未变时复用原数组，保住原 createdAt，让轮询保持幂等。 */
function appendHistoryIdempotently(history: Parameters<typeof appendDramaLabGenerationHistory>[0], entry: Parameters<typeof appendDramaLabGenerationHistory>[1]) {
    const existing = history || [];
    const stable = existing.some((item) => item.taskId === entry.taskId && item.url === entry.url && item.prompt === entry.prompt);
    if (stable) return existing;
    return appendDramaLabGenerationHistory(existing, entry);
}

function isActive(value: unknown) {
    return value === "queued" || value === "pending" || value === "running";
}

function positive(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stableUrl(value: unknown) {
    const url = typeof value === "string" ? value.trim() : "";
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

async function applyFramePatch(shot: DramaShot, patch: Partial<DramaShot>) {
    for (const frameType of ["first", "key", "last"] as const) {
        const frame = shot.frames?.[frameType];
        const taskId = frame?.taskId?.trim();
        if (!frame || !taskId || frame.locked) continue;
        if (frame.status === "success" && frame.history?.some((entry) => entry.taskId === taskId)) continue;
        const task = await getImageTask(taskId);
        let next = frame;
        if (!task && isActive(frame.status)) {
            next = { ...frame, taskId: undefined, status: "error", error: "帧图任务记录不存在，请重新生成" };
        } else if (task?.status === "success") {
            const url = stableUrl(task.result?.serverUrl) || stableUrl(task.result?.remoteUrl) || stableUrl(task.result?.dataUrl);
            if (url) {
                next = {
                    ...frame,
                    status: "success",
                    url,
                    width: positive(task.result?.width),
                    height: positive(task.result?.height),
                    error: undefined,
                    history: appendHistoryIdempotently(frame.history, { id: `frame:${frameType}:${task.id}`, taskId: task.id, url, prompt: frame.prompt, createdAt: new Date().toISOString() }),
                };
            } else if (frame.status !== "error") {
                next = { ...frame, status: "error", error: "帧图任务没有返回可持久化图片地址" };
            }
        } else if (task?.status === "error" || task?.status === "cancelled") {
            const error = task.error || (task.status === "cancelled" ? "帧图任务已取消" : "帧图生成失败");
            if (frame.status !== task.status || frame.error !== error) next = { ...frame, status: task.status, error };
        }
        if (next !== frame) patch.frames = { ...(patch.frames || shot.frames), [frameType]: next };
    }
}

/** Owner-only project reads call this to settle manually submitted and batch tasks too. */
export async function syncOneClickProjectGeneration(input: { userId: string; project: DramaProject; origin?: string; cookie?: string }) {
    let project = input.project;
    for (const episode of input.project.episodes) {
        for (const shot of episode.shots) {
            if (!shot.storyboardTaskId && !shot.generationTaskId && !Object.values(shot.frames || {}).some((frame) => frame?.taskId)) continue;
            const result = await syncOneClickShotGeneration({ ...input, project, episodeId: episode.id, shotId: shot.id });
            project = result.project;
        }
    }
    return project;
}
