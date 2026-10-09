import { runCustomImageTask, pollCustomImageTask } from "@/app/api/image-tasks/image-task-custom";
import { runGeminiImageTask } from "@/app/api/image-tasks/image-task-gemini";
import { runOpenAiImageTask } from "@/app/api/image-tasks/image-task-openai";
import { directRemoteImageResult, imagePointsIdempotencyKey, imageUnits, ImageQueryContractError, ImageUpstreamTerminalError, inlineRemoteImageResult, pollOpenAiImageTask, resolveProxiedMediaSource } from "@/app/api/image-tasks/image-task-support";
import type { ImageTaskMediaResult, ImageTaskResult, ImageTaskRunResult } from "@/app/api/image-tasks/image-task-types";
import { stableMediaUrl, writeImageGenerationLog } from "@/app/api/image-tasks/image-task-runner";
import { getAuthSettings } from "@/lib/auth/store";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";
import { dedupeImageResults } from "@/lib/image-result-dedupe";
import { registerGenerationTaskAssetsForUser } from "@/lib/server/creative-runtime-service";
import { CHANNEL_SATURATED_MESSAGE } from "@/lib/server/channel-concurrency";
import { finishGenerationAttempt, generationReservationId, nextGenerationAttemptNo, releaseGenerationReservations, renewGenerationReservations, reserveGenerationAttemptSlot, startGenerationAttempt } from "@/lib/server/generation-attempt";
import { generationModelId } from "@/lib/server/generation-channel";
import { refundImageTask } from "@/lib/server/image-task-refund";
import { deletePreparedImageTaskResults, persistedImageTaskResults, prepareImageTaskResults } from "@/lib/server/image-task-result-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { GenerationSubmissionSafeFailure, generationSubmissionUncertainError } from "@/lib/server/generation-submission-error";
import { getImageTask, transitionImageTask, updateImageTask, type ImageTask, type StoredImageTaskMediaResult } from "@/lib/server/image-task-store";
import { maintenanceWorkerContext } from "@/lib/server/maintenance-auth";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { resolveModelRequestTimeoutMs } from "@/lib/server/model-request-policy";
import { buildImageTaskPrompt } from "@/lib/image-reference-prompt";

export type ImageUpstreamStep =
    | { state: "pending"; upstream: NonNullable<ImageTask["upstream"]>; status: string }
    | { state: "needs_review"; reason: string; status: string }
    | { state: "result_ready"; resultUrl: string; status: string }
    | { state: "completed" }
    | { state: "failed"; error: string; status: string; retryReason?: "upstream_failed" };

async function reserveFirstAvailableImageCandidate(task: ImageTask, reservationId: string) {
    const candidates = [task.config, ...(task.candidateConfigs || [])];
    for (let index = 0; index < candidates.length; index += 1) {
        const config = candidates[index];
        const reserved = await reserveGenerationAttemptSlot({
            capability: "image",
            channelId: config.channelId,
            upstreamModel: config.model,
            reservationId,
            concurrencyLimit: config.capabilityProfile?.concurrencyLimit,
        });
        if (reserved) return { config, remaining: candidates.slice(index + 1) };
    }
    return null;
}

export async function createImageTaskUpstreamStep(task: ImageTask, origin: string, publicOrigin: string, cookie = "", workerUserId = ""): Promise<ImageUpstreamStep> {
    const current = await getImageTask(task.id);
    if (!current || current.status === "cancelled") return { state: "failed", error: "任务已取消", status: "cancelled" };
    const running = current.status === "pending" ? await transitionImageTask(current, ["pending"], { status: "running" }) : current;
    if (!running) return { state: "failed", error: "图片任务状态已变化", status: "conflict" };
    const prepared = persistedImageTaskResults(running);
    if (prepared.length) return readyImageStep(running, prepared[0].serverUrl || prepared[0].dataUrl);
    if (running.upstream?.id) return queryImageTaskUpstreamStep(running, origin, cookie, workerUserId);

    const authContext = cookie || maintenanceWorkerContext(workerUserId || task.userId);
    let attempts = running.attempts || [];
    const reservationId = generationReservationId("image", task.id, nextGenerationAttemptNo(attempts));
    const reservation = await reserveFirstAvailableImageCandidate(running, reservationId);
    if (!reservation) return { state: "failed", error: CHANNEL_SATURATED_MESSAGE, status: "channel_saturated" };
    const config = reservation.config;
    const candidateConfigs = reservation.remaining;
    const started = startGenerationAttempt(attempts, { channelId: config.channelId, model: generationModelId(config), capability: "image", reservationId });
    attempts = started.attempts;
    const candidate = { ...running, config, attempts, attemptNo: started.attempt.attemptNo, upstream: undefined, billing: undefined };
    const upstreamPrompt = candidate.source === "canvas" ? `${buildImageTaskPrompt(candidate)}${candidate.mask ? "\n\n最后一张图片是编辑蒙版：透明区域需要重新生成，白色不透明区域必须保持原图。只补全透明区域，不要把蒙版当作画面内容。" : ""}` : undefined;
    if (upstreamPrompt) candidate.upstreamPrompt = upstreamPrompt;
    try {
        await updateImageTask(task.id, { config, candidateConfigs, attempts, attemptNo: candidate.attemptNo, upstream: undefined, billing: undefined, ...(upstreamPrompt ? { upstreamPrompt } : {}) });
        const submissionStartedAt = Date.now();
        await scheduleGenerationTask("image", task.id, {
            executionPhase: "submitting",
            submittedAt: submissionStartedAt,
            nextPollAt: submissionStartedAt + resolveModelRequestTimeoutMs(config, "image"),
            channelId: config.channelId,
            provider: config.advancedConfig?.protocol || config.apiFormat,
            lastUpstreamStatus: "submitting",
        });
    } catch (error) {
        await releaseGenerationReservations([reservationId]);
        throw error;
    }
    try {
        const result = usesDeclarativeImageProtocol(config.advancedConfig?.protocol)
            ? await runCustomImageTask(candidate, origin, publicOrigin, authContext, true)
            : config.apiFormat === "gemini"
              ? await runGeminiImageTask(candidate, origin, authContext)
              : await runOpenAiImageTask(candidate, origin, publicOrigin, authContext, true);
        return await handleImageProviderResult(candidate, result, origin, authContext);
    } catch (error) {
        if (error instanceof ImageUpstreamTerminalError) return { state: "failed", error: error.message || "图片生成失败", status: "failed", retryReason: "upstream_failed" };
        if (!(error instanceof GenerationSubmissionSafeFailure)) {
            const uncertain = generationSubmissionUncertainError(error, "图片任务创建结果未知");
            // D6 5.3: 提交结果未知（多为本地超时中止）。不退款——上游可能已接单计费。
            // best-effort 把相位落到 needs_review 待人工对账，而不是永久停在 submitting；
            // 上游未返回 ID 时绝不编造。channelId/provider/submittedAt 已在 submitting
            // 写入时持久化，clientRequestId/attemptNo 在建任务时落库，共同构成对账句柄。
            // worker 路径（recovery-service）通常会随后覆盖同一相位；此处兜住不经 worker
            // 的调用方（如 binding-verification-runner）。见实施文档步骤 4。
            await scheduleGenerationTask("image", task.id, {
                executionPhase: "needs_review",
                nextPollAt: undefined,
                lastUpstreamStatus: "submission_result_unknown",
                resultPayload: { reviewReason: uncertain.message.slice(0, 500) },
            }).catch(() => undefined);
            throw uncertain;
        }
        attempts = finishGenerationAttempt(attempts, candidate.attemptNo, { status: "failed", error: error.message });
        await refundImageCandidate(candidate);
        await updateImageTask(task.id, { attempts, attemptNo: candidate.attemptNo, upstream: undefined, billing: undefined });
        return { state: "failed", error: error.message, status: "failed" };
    }
}

export async function queryImageTaskUpstreamStep(task: ImageTask, origin: string, cookie = "", workerUserId = ""): Promise<ImageUpstreamStep> {
    const prepared = persistedImageTaskResults(task);
    if (prepared.length) return readyImageStep(task, prepared[0].serverUrl || prepared[0].dataUrl);
    const upstream = task.upstream;
    if (!upstream?.id) return { state: "failed", error: "图片任务缺少上游任务 ID", status: "missing_upstream_id" };
    await renewGenerationReservations(task.attempts);
    const authContext = cookie || maintenanceWorkerContext(workerUserId || task.userId);
    try {
        const result = usesDeclarativeImageProtocol(task.config.advancedConfig?.protocol)
            ? await pollCustomImageTask(task, upstream.id, upstream.mediaBaseUrl, upstream.pollBaseUrl, authContext, true)
            : await pollOpenAiImageTask(task.config, upstream.id, upstream.mediaBaseUrl, upstream.pollBaseUrl, authContext, upstream.explicitPollUrl || "", true, practiceImagePollRequestId(task), task.billingContext);
        return await handleImageProviderResult(task, { ...result, pointsCost: task.billing?.pointsCost, billingReceiptId: task.billing?.billingReceiptId }, origin, authContext);
    } catch (error) {
        if (error instanceof ImageQueryContractError) return { state: "needs_review", reason: error.message, status: "query_contract_invalid" };
        if (error instanceof ImageUpstreamTerminalError) return { state: "failed", error: error.message, status: "failed", retryReason: "upstream_failed" };
        if (error instanceof GenerationSubmissionSafeFailure) return { state: "failed", error: error.message, status: "failed" };
        throw error;
    }
}

export async function prepareImageTaskAutomaticRetry(task: ImageTask, error: string) {
    const current = (await getImageTask(task.id)) || task;
    if (current.status !== "pending" && current.status !== "running") return null;
    const attemptNo = current.attemptNo || current.attempts?.at(-1)?.attemptNo || 1;
    if (attemptNo >= 2) return null;
    const attempts = finishGenerationAttempt(current.attempts || [], attemptNo, {
        status: "failed",
        error,
        pointsCost: current.billing?.pointsCost,
        billingReceiptId: current.billing?.billingReceiptId,
    });
    await refundImageCandidate(current);
    const nextConfig = current.candidateConfigs?.[0] || current.config;
    return updateImageTask(current.id, {
        config: nextConfig,
        candidateConfigs: [],
        attempts,
        attemptNo,
        upstream: undefined,
        billing: undefined,
        retryable: false,
    });
}

export async function queryCancelledImageTaskUpstreamStep(task: ImageTask, origin: string, cookie = "", workerUserId = "") {
    const upstream = task.upstream;
    if (!upstream?.id) return { state: "terminal" as const, status: "missing_upstream_id" };
    const authContext = cookie || maintenanceWorkerContext(workerUserId || task.userId);
    try {
        const result = usesDeclarativeImageProtocol(task.config.advancedConfig?.protocol)
            ? await pollCustomImageTask(task, upstream.id, upstream.mediaBaseUrl, upstream.pollBaseUrl, authContext, true)
            : await pollOpenAiImageTask(task.config, upstream.id, upstream.mediaBaseUrl, upstream.pollBaseUrl, authContext, upstream.explicitPollUrl || "", true, practiceImagePollRequestId(task), task.billingContext);
        return result.pending ? { state: "pending" as const, status: "processing" } : { state: "terminal" as const, status: "completed" };
    } catch (error) {
        if (error instanceof ImageUpstreamTerminalError || error instanceof GenerationSubmissionSafeFailure) return { state: "terminal" as const, status: "failed" };
        throw error;
    }
}

export async function persistImageTaskResult(task: ImageTask, origin: string, resultUrl: string, cookie = "", workerUserId = "") {
    const authContext = cookie || maintenanceWorkerContext(workerUserId || task.userId);
    const current = (await getImageTask(task.id)) || task;
    let results = persistedImageTaskResults(current);
    if (results.length) return completeImageResult(current, results);

    const inlineDataUrl = resultUrl === "inline://image-task-result" ? current.result?.dataUrl || "" : resultUrl;
    const remoteUrl = resultUrl === "inline://image-task-result" ? current.result?.remoteUrl : /^https?:\/\//i.test(resultUrl) ? resultUrl : undefined;
    if (!inlineDataUrl && !remoteUrl) throw new GenerationSubmissionSafeFailure("图片任务缺少可持久化结果");
    const legacyResults = current.result?.results?.length ? current.result.results : [{ dataUrl: inlineDataUrl, remoteUrl }];
    const normalizedResults = legacyResults.map((item, index) => (index === 0 ? { ...item, dataUrl: inlineDataUrl || item.dataUrl, remoteUrl: remoteUrl || item.remoteUrl } : item));
    try {
        results = await prepareImageTaskResults(current, { ...normalizedResults[0], results: normalizedResults }, origin, authContext);
    } catch (error) {
        return markImageTaskFailed(current, error instanceof Error ? error.message : "Unable to persist the image result");
    }
    try {
        await updateImageTask(current.id, { result: { ...results[0], results } });
    } catch (error) {
        await deletePreparedImageTaskResults(results);
        throw error;
    }
    return completeImageResult(current, results);
}

export async function markImageTaskFailed(task: ImageTask, error: string) {
    const current = (await getImageTask(task.id)) || task;
    if (current.status === "success" || current.status === "cancelled") return current;
    const attempts = finishGenerationAttempt(current.attempts || [], current.attemptNo || current.attempts?.at(-1)?.attemptNo || 1, {
        status: "failed",
        error,
        pointsCost: current.billing?.pointsCost,
        billingReceiptId: current.billing?.billingReceiptId,
    });
    const failed = await transitionImageTask(current, ["pending", "running"], { status: "error", error: error.slice(0, 500), retryable: true, billing: current.billing });
    if (!failed) {
        const latest = await getImageTask(current.id);
        if (latest?.status === "error" || latest?.status === "cancelled") return refundImageTask(latest);
        return latest;
    }
    await updateImageTask(current.id, { attempts, candidateConfigs: [], attemptNo: attempts.at(-1)?.attemptNo });
    const refunded = await refundImageTask(failed);
    await writeImageGenerationLog({ ...refunded, retryable: true }, "failed", "", Date.now() - current.createdAt, error).catch((logError) => console.error("Image generation failure log write failed", logError));
    return refunded;
}

function practiceImagePollRequestId(task: ImageTask) {
    return task.executionProfile === "open-source-practice" ? `${imagePointsIdempotencyKey(task)}:poll` : undefined;
}

async function handleImageProviderResult(task: ImageTask, result: ImageTaskRunResult, origin: string, authContext: string): Promise<ImageUpstreamStep> {
    const billing = result.billingReceiptId ? { pointsCost: result.pointsCost ?? 0, billingReceiptId: result.billingReceiptId, refunded: false } : undefined;
    if (billing) await updateImageTask(task.id, { billing });
    if (result.needsReview) {
        const submittedAt = Date.now();
        await updateImageTask(task.id, { upstream: result.needsReview.upstream, billing });
        await scheduleGenerationTask("image", task.id, {
            executionPhase: "needs_review",
            upstreamTaskId: result.needsReview.upstream.id,
            upstreamRequestId: result.upstreamRequestId,
            channelId: task.config.channelId,
            provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
            queryPath: result.needsReview.upstream.explicitPollUrl || task.config.advancedConfig?.queryPath,
            submittedAt,
            nextPollAt: undefined,
            lastUpstreamStatus: "query_contract_missing",
            resultPayload: { reviewReason: result.needsReview.reason.slice(0, 500) },
        });
        return { state: "needs_review", reason: result.needsReview.reason, status: "query_contract_missing" };
    }
    if (result.pending) {
        const submittedAt = Date.now();
        await updateImageTask(task.id, { upstream: result.pending, billing });
        await scheduleGenerationTask("image", task.id, {
            executionPhase: "submitted",
            upstreamTaskId: result.pending.id,
            upstreamRequestId: result.upstreamRequestId,
            channelId: task.config.channelId,
            provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
            queryPath: result.pending.explicitPollUrl || task.config.advancedConfig?.queryPath,
            submittedAt,
            nextPollAt: submittedAt,
            lastUpstreamStatus: "submitted",
        });
        return { state: "pending", upstream: result.pending, status: "submitted" };
    }
    let results: StoredImageTaskMediaResult[];
    try {
        results = await prepareImageTaskResults(task, result, origin, authContext);
    } catch (error) {
        return { state: "failed", error: error instanceof Error ? error.message : "上游返回的图片文件无效或保存失败", status: "failed" };
    }
    const first = results[0];
    if (!first) return { state: "failed", error: "上游返回的图片文件无效或保存失败", status: "failed" };
    const current = await getImageTask(task.id);
    if (!current || current.status === "cancelled") {
        await deletePreparedImageTaskResults(results);
        return { state: "failed", error: "任务已取消", status: "cancelled" };
    }
    try {
        await updateImageTask(task.id, { result: { ...first, results } });
    } catch (error) {
        await deletePreparedImageTaskResults(results);
        return { state: "failed", error: error instanceof Error ? error.message : "上游返回的图片文件无效或保存失败", status: "failed" };
    }
    return readyImageStep(task, first.serverUrl || first.dataUrl, result.upstreamRequestId);
}

async function readyImageStep(task: ImageTask, resultUrl: string, upstreamRequestId?: string): Promise<ImageUpstreamStep> {
    if (!stableMediaUrl(resultUrl)) return { state: "failed", error: "上游返回的图片文件无效或保存失败", status: "failed" };
    await persistReadyImageSchedule(task, resultUrl, upstreamRequestId);
    return { state: "result_ready", resultUrl, status: "completed" };
}

function persistReadyImageSchedule(task: ImageTask, resultUrl: string, upstreamRequestId?: string) {
    const submittedAt = Date.now();
    return scheduleGenerationTask("image", task.id, {
        executionPhase: "result_ready",
        upstreamRequestId,
        channelId: task.config.channelId,
        provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
        submittedAt,
        nextPollAt: submittedAt,
        lastUpstreamStatus: "completed",
        resultPayload: { url: resultUrl },
    });
}

async function refundImageCandidate(task: ImageTask) {
    const current = await getImageTask(task.id);
    const billing = current?.billing;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || !billing?.billingReceiptId || billing.refunded) return;
    const settings = await getAuthSettings();
    await refundGenerationCharge({
        userId: task.userId,
        receiptId: billing.billingReceiptId,
        model: generationModelId(task.config),
        usageKind: "image",
        units: imageUnits(task.config.quality, settings.generationPointMultipliers.imageQuality),
        idempotencyKey: `image-task:${task.id}:attempt:${task.attemptNo || 1}:refund`,
    });
}

async function completeImageResult(task: ImageTask, safeResults: StoredImageTaskMediaResult[]) {
    const beforePersistence = await getImageTask(task.id);
    if (!beforePersistence || beforePersistence.status === "cancelled") {
        if (beforePersistence?.status === "cancelled") await refundImageTask(beforePersistence);
        return beforePersistence;
    }
    task = beforePersistence;
    const current = await getImageTask(task.id);
    if (!current || current.status === "cancelled") {
        if (current?.status === "cancelled") await refundImageTask(current);
        return current;
    }
    const completed = await transitionImageTask(current, ["pending", "running"], {
        status: "success",
        result: { ...safeResults[0], results: safeResults },
        pointsRemaining: task.pointsRemaining,
        retryable: false,
    });
    if (!completed) {
        const latest = await getImageTask(task.id);
        if (latest?.status === "cancelled") await refundImageTask(latest);
        return latest;
    }
    const logged = await writeImageGenerationLog(completed, "success", safeResults, Date.now() - completed.createdAt).catch((logError) => {
        console.error("Image generation success log write failed", logError);
        return undefined;
    });
    const loggedAssets = logged?.assets?.length ? logged.assets : logged?.asset ? [logged.asset] : [];
    const finalResults = loggedAssets.length
        ? loggedAssets.map((asset) => ({ dataUrl: asset.serverUrl || asset.url, remoteUrl: asset.remoteUrl, serverUrl: asset.serverUrl, width: asset.width, height: asset.height, bytes: asset.bytes, mimeType: asset.mimeType }))
        : safeResults;
    const finalResult = finalResults[0];
    const attempts = finishGenerationAttempt(completed.attempts || [], completed.attemptNo || completed.attempts?.at(-1)?.attemptNo || 1, {
        status: "succeeded",
        pointsCost: completed.billing?.pointsCost,
        billingReceiptId: completed.billing?.billingReceiptId,
    });
    const finalized = (await updateImageTask(task.id, { result: { ...finalResult, results: finalResults }, config: { ...completed.config, apiKey: "system" }, candidateConfigs: [], attempts, attemptNo: attempts.at(-1)?.attemptNo })) || completed;
    const assets = (finalized.result?.results?.length ? finalized.result.results : finalized.result ? [finalized.result] : []).flatMap((item) => {
        const url = item.serverUrl || item.remoteUrl || stableMediaUrl(item.dataUrl);
        return url ? [{ type: "image" as const, url, mimeType: item.mimeType, width: item.width, height: item.height, bytes: item.bytes }] : [];
    });
    if (assets.length)
        await registerGenerationTaskAssetsForUser(finalized.userId, {
            ...finalized,
            taskId: finalized.id,
            title: finalized.title || finalized.prompt.slice(0, 80),
            assets,
        }).catch((error) => console.error("Creative image asset registration failed", error));
    return finalized;
}

function usesDeclarativeImageProtocol(protocol: NonNullable<ImageTask["config"]["advancedConfig"]>["protocol"] | undefined) {
    return protocol === "custom" || protocol === "runninghub" || protocol === "stable-diffusion" || protocol === "yumeng" || protocol === "modelbay-image-task" || protocol === "tuzi-image-task";
}
