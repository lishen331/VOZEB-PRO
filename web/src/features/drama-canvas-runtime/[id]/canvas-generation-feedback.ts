import { GENERATION_BUSY_MESSAGE, GENERATION_POINTS_MESSAGE, GENERATION_UNAVAILABLE_MESSAGE, generationUserMessage } from "@/lib/generation-feedback-message";
import { GenerationTaskRequestError } from "@/services/api/generation-task-request-error";
import { isGenerationTaskNeedsReviewError, isGenerationTaskTerminalError } from "@/services/api/generation-task-state";
import { ImageGenerationTaskTerminalError, isImageGenerationTaskDeferredError } from "@/services/api/image";
import { VideoGenerationUpstreamError, VideoGenerationWaitTimeoutError } from "@/services/api/video-types";

import type { CanvasNodeData } from "../types";

export const CANVAS_GENERATION_BUSY_MESSAGE = GENERATION_BUSY_MESSAGE;
export const CANVAS_GENERATION_UNAVAILABLE_MESSAGE = GENERATION_UNAVAILABLE_MESSAGE;
export const CANVAS_GENERATION_POINTS_MESSAGE = GENERATION_POINTS_MESSAGE;
export const CANVAS_GENERATION_RETRY_DELAY_MS = 15_000;

// 前端兜底时长：从任务提交（节点拿到任务 ID）开始计，到点不管轮询是否还在跑，直接给用户一个可重试的失败。
const PENDING_TIMEOUT_MS = { image: 10 * 60_000, text: 10 * 60_000, audio: 10 * 60_000, video: 40 * 60_000 } as const;

// 硬超时中止轮询时的 abort reason：调用方据此区分"超时"和"用户停止"（后者会删除占位节点）。
export const CANVAS_GENERATION_TIMEOUT_ABORT = new DOMException("生成等待超时", "AbortError");

export type CanvasGenerationTaskKind = keyof typeof PENDING_TIMEOUT_MS;

/** 后端暂时没给出结果（needs_review / 查询超时 / 仍在后台生成）：前端继续等，不当失败处理。 */
export function isCanvasGenerationPending(error: unknown) {
    return isGenerationTaskNeedsReviewError(error) || isImageGenerationTaskDeferredError(error) || error instanceof VideoGenerationWaitTimeoutError;
}

/** 上游明确给出了终态失败（不是"查不到"）。 */
export function isCanvasGenerationTerminalFailure(error: unknown) {
    return error instanceof ImageGenerationTaskTerminalError || isGenerationTaskTerminalError(error) || error instanceof VideoGenerationUpstreamError;
}

/**
 * 已有任务 ID 时，这个错误是否只代表"暂时查不到"、应该继续等：
 * - needs_review / 查询超时等等待类错误；
 * - 主动追查（review）或视频查询时的非终态错误（如追查接口 409、查询接口抖动）；
 * - 网络断开、5xx、限流这类瞬时错误。
 * 上游明确失败、以及其余确定性错误都不等，直接给用户失败结果。
 */
export function isCanvasGenerationRetryable(error: unknown, options: { review?: boolean; video?: boolean } = {}) {
    if (isCanvasGenerationPending(error)) return true;
    if (isCanvasGenerationTerminalFailure(error)) return false;
    if (options.review || options.video) return true;
    if (error instanceof TypeError) return true;
    return error instanceof GenerationTaskRequestError && (error.status >= 500 || [408, 425, 429].includes(error.status));
}

/** 进入等待前调用：真实原因写控制台，并决定下一轮是否要主动追查。 */
export function canvasGenerationPendingOptions(error: unknown) {
    console.warn("[canvas-generation] still pending:", error instanceof Error ? error.message : error);
    return { review: isGenerationTaskNeedsReviewError(error) };
}

/** 纯映射：任意错误文本 → 给用户看的文案。不记录日志，可在渲染时调用。 */
export function canvasGenerationUserMessage(raw: string | undefined) {
    return generationUserMessage(raw);
}

/** 写入节点 / 弹提示前调用：真实原因进控制台留给排查，界面只拿转换后的文案。 */
export function toCanvasGenerationUserMessage(error: unknown) {
    const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    if (raw) console.warn("[canvas-generation] failure detail:", raw);
    return canvasGenerationUserMessage(raw);
}

export function canvasGenerationTaskKind(node: CanvasNodeData | undefined): CanvasGenerationTaskKind | undefined {
    const metadata = node?.metadata;
    if (metadata?.videoTask) return "video";
    if (metadata?.imageTask) return "image";
    if (metadata?.textTask) return "text";
    if (metadata?.audioTask) return "audio";
    return undefined;
}

export function canvasGenerationTaskId(node: CanvasNodeData | undefined) {
    const metadata = node?.metadata;
    return metadata?.videoTask?.id || metadata?.imageTask?.id || metadata?.textTask?.id || metadata?.audioTask?.id;
}

/** 当前任务的等待状态；时间戳属于旧任务时视为无效，重新生成后会自动重计。 */
export function canvasGenerationPendingState(node: CanvasNodeData | undefined) {
    const metadata = node?.metadata;
    const taskId = canvasGenerationTaskId(node);
    if (!taskId || typeof metadata?.generationPendingSince !== "number" || metadata.generationPendingTaskId !== taskId) return undefined;
    return { since: metadata.generationPendingSince, review: metadata.generationPendingReview === true };
}

/**
 * 进入"生成中、继续等"。首次进入时打时间戳，后续保持不变，用于前端兜底超时。
 * review=true 表示后端停在 needs_review，下一轮要主动追查（等价于原来的"检查状态"）。
 */
export function markCanvasGenerationPending(nodes: CanvasNodeData[], nodeIds: Iterable<string>, options: { review?: boolean; now?: number } = {}) {
    const pending = new Set(nodeIds);
    return nodes.map((node) => {
        const taskId = canvasGenerationTaskId(node);
        if (!pending.has(node.id) || !taskId) return node;
        const current = canvasGenerationPendingState(node);
        const since = current?.since ?? options.now ?? Date.now();
        const review = Boolean(options.review);
        const metadata = node.metadata;
        if (metadata?.status === "loading" && !metadata.errorDetails && current?.since === since && current.review === review) return node;
        return { ...node, metadata: { ...metadata, status: "loading" as const, errorDetails: undefined, generationPendingSince: since, generationPendingTaskId: taskId, generationPendingReview: review || undefined } };
    });
}

/** 生成中且刚拿到任务 ID、还没计时的节点：从现在开始计时。没有变化时返回原数组。 */
export function stampCanvasGenerationStart(nodes: CanvasNodeData[], now = Date.now()) {
    let changed = false;
    const next = nodes.map((node) => {
        const taskId = canvasGenerationTaskId(node);
        if (node.metadata?.status !== "loading" || !taskId || canvasGenerationPendingState(node)) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, generationPendingSince: now, generationPendingTaskId: taskId, generationPendingReview: undefined } };
    });
    return changed ? next : nodes;
}

export function isCanvasGenerationPendingExpired(node: CanvasNodeData | undefined, now = Date.now()) {
    const kind = canvasGenerationTaskKind(node);
    const pending = canvasGenerationPendingState(node);
    return Boolean(kind && pending && now - pending.since >= PENDING_TIMEOUT_MS[kind]);
}

/**
 * 旧项目里存着黄色 needs_review 节点：有任务的转为"生成中 + 下一轮主动追查"，
 * 没有可追任务的直接给失败（Agent 节点由 Agent 自己的恢复流程处理，不动）。
 */
export function restoreCanvasGenerationPending(nodes: CanvasNodeData[], now = Date.now()) {
    const reviewIds = nodes.filter((node) => node.metadata?.status === "needs_review").map((node) => node.id);
    if (!reviewIds.length) return nodes;
    const restored = markCanvasGenerationPending(nodes, reviewIds, { review: true, now });
    const orphanIds = restored.filter((node) => node.metadata?.status === "needs_review" && !node.metadata.agentRunId).map((node) => node.id);
    return orphanIds.length ? failCanvasGeneration(restored, orphanIds) : restored;
}

export function failCanvasGeneration(nodes: CanvasNodeData[], nodeIds: Iterable<string>, errorDetails = CANVAS_GENERATION_BUSY_MESSAGE) {
    const failed = new Set(nodeIds);
    return nodes.map((node) =>
        failed.has(node.id)
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      status: "error" as const,
                      errorDetails,
                      generationPendingSince: undefined,
                      generationPendingTaskId: undefined,
                      generationPendingReview: undefined,
                      imageTask: undefined,
                      videoTask: undefined,
                      textTask: undefined,
                      audioTask: undefined,
                  },
              }
            : node,
    );
}
