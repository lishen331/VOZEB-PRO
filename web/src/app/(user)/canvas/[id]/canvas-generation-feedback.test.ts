import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationTaskRequestError } from "@/services/api/generation-task-request-error";
import { GenerationTaskNeedsReviewError, GenerationTaskTerminalError } from "@/services/api/generation-task-state";
import { ImageGenerationTaskDeferredError, ImageGenerationTaskTerminalError } from "@/services/api/image";
import { VideoGenerationUpstreamError, VideoGenerationWaitTimeoutError } from "@/services/api/video-types";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import {
    CANVAS_GENERATION_BUSY_MESSAGE,
    canvasGenerationPendingState,
    canvasGenerationUserMessage,
    failCanvasGeneration,
    isCanvasGenerationPendingExpired,
    isCanvasGenerationRetryable,
    markCanvasGenerationPending,
    restoreCanvasGenerationPending,
    stampCanvasGenerationStart,
    toCanvasGenerationUserMessage,
} from "./canvas-generation-feedback";

const MINUTE = 60_000;

function imageNode(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id: "image-node", type: CanvasNodeType.Image, title: "图片", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { status: "loading", imageTask: { id: "image-task", kind: "generation", model: "image-model" }, ...metadata } };
}

function videoNode(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id: "video-node", type: CanvasNodeType.Video, title: "视频", position: { x: 0, y: 0 }, width: 420, height: 236, metadata: { status: "loading", videoTask: { id: "video-task", provider: "generation", model: "video-model" }, ...metadata } };
}

describe("canvas generation user-facing message", () => {
    beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ["渠道未返回可查询任务 ID", CANVAS_GENERATION_BUSY_MESSAGE],
        ["原任务没有保存上游任务 ID，无法安全追回结果", CANVAS_GENERATION_BUSY_MESSAGE],
        ["upstream 502 Bad Gateway", CANVAS_GENERATION_BUSY_MESSAGE],
        ["", CANVAS_GENERATION_BUSY_MESSAGE],
        ["The input image contains a real person face", "参考图包含真人人脸，请更换图片后重试"],
        ["输入图片中检测到人脸", "参考图包含真人人脸，请更换图片后重试"],
        ["Your request was rejected by the content policy (sexual)", "内容未通过安全审核，请修改描述或更换参考图后重试"],
        ["prompt contains violence", "内容未通过安全审核，请修改描述或更换参考图后重试"],
        ["输入内容包含敏感词", "内容未通过安全审核，请修改描述或更换参考图后重试"],
        ["积分不足", "积分不足，请充值后重试"],
        ["内容未通过安全审核：Unavailable For Legal Reasons", "内容未通过安全审核，请修改描述或更换参考图后重试"],
        ["token quota is not enough", "当前模型暂时不可用，请切换模型后重试"],
        ["当前模型暂时不可用，请切换模型后重试", "当前模型暂时不可用，请切换模型后重试"],
    ])("maps %j to a safe message", (raw, expected) => {
        expect(canvasGenerationUserMessage(raw)).toBe(expected);
    });

    it("keeps already-converted messages unchanged", () => {
        expect(canvasGenerationUserMessage(CANVAS_GENERATION_BUSY_MESSAGE)).toBe(CANVAS_GENERATION_BUSY_MESSAGE);
        expect(canvasGenerationUserMessage("参考图片已丢失，无法继续重试")).toBe("参考图片已丢失，无法继续重试");
    });

    it("logs the real reason to the console only", () => {
        const warn = vi.mocked(console.warn);
        expect(toCanvasGenerationUserMessage(new Error("渠道未返回可查询任务 ID"))).toBe(CANVAS_GENERATION_BUSY_MESSAGE);
        expect(warn).toHaveBeenCalledWith(expect.any(String), "渠道未返回可查询任务 ID");
    });
});

describe("canvas generation retry classification", () => {
    it("keeps waiting while the backend has not produced a result", () => {
        expect(isCanvasGenerationRetryable(new GenerationTaskNeedsReviewError("上游任务仍在处理中"))).toBe(true);
        expect(isCanvasGenerationRetryable(new ImageGenerationTaskDeferredError())).toBe(true);
        expect(isCanvasGenerationRetryable(new VideoGenerationWaitTimeoutError())).toBe(true);
        expect(isCanvasGenerationRetryable(new GenerationTaskRequestError("busy", 503))).toBe(true);
        expect(isCanvasGenerationRetryable(new TypeError("Failed to fetch"))).toBe(true);
    });

    it("keeps waiting on a recovery check that is not yet conclusive", () => {
        expect(isCanvasGenerationRetryable(new GenerationTaskRequestError("原任务没有保存上游任务 ID", 409), { review: true })).toBe(true);
        expect(isCanvasGenerationRetryable(new Error("查询视频任务失败"), { video: true })).toBe(true);
    });

    it("fails right away when the upstream explicitly failed", () => {
        expect(isCanvasGenerationRetryable(new ImageGenerationTaskTerminalError("内容违规", false), { review: true })).toBe(false);
        expect(isCanvasGenerationRetryable(new GenerationTaskTerminalError("文本生成失败"))).toBe(false);
        expect(isCanvasGenerationRetryable(new VideoGenerationUpstreamError("face detected"), { video: true })).toBe(false);
        expect(isCanvasGenerationRetryable(new GenerationTaskRequestError("参数错误", 400))).toBe(false);
    });
});

describe("canvas generation pending clock", () => {
    beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it("starts the clock once and keeps it across later polls", () => {
        const [first] = markCanvasGenerationPending([imageNode()], ["image-node"], { now: 1_000 });
        const [second] = markCanvasGenerationPending([first], ["image-node"], { now: 9_000 });

        expect(canvasGenerationPendingState(second)?.since).toBe(1_000);
        expect(second.metadata).toMatchObject({ status: "loading", imageTask: { id: "image-task" } });
    });

    it("times out images after 10 minutes and videos after 30 minutes", () => {
        const [image] = markCanvasGenerationPending([imageNode()], ["image-node"], { now: 0 });
        const [video] = markCanvasGenerationPending([videoNode()], ["video-node"], { now: 0 });

        expect(isCanvasGenerationPendingExpired(image, 9 * MINUTE)).toBe(false);
        expect(isCanvasGenerationPendingExpired(image, 10 * MINUTE)).toBe(true);
        expect(isCanvasGenerationPendingExpired(video, 39 * MINUTE)).toBe(false);
        expect(isCanvasGenerationPendingExpired(video, 40 * MINUTE)).toBe(true);
    });

    it("starts the clock at submission so a long-running poll still hits the hard limit", () => {
        const nodes = [imageNode({ status: "loading" }), videoNode({ status: "loading" })];
        const stamped = stampCanvasGenerationStart(nodes, 0);
        const [image, video] = stampCanvasGenerationStart(stamped, 5 * MINUTE);

        expect(canvasGenerationPendingState(image)).toEqual({ since: 0, review: false });
        expect(isCanvasGenerationPendingExpired(image, 10 * MINUTE)).toBe(true);
        expect(isCanvasGenerationPendingExpired(video, 39 * MINUTE)).toBe(false);
        expect(isCanvasGenerationPendingExpired(video, 40 * MINUTE)).toBe(true);
        expect(stampCanvasGenerationStart(stamped, 9 * MINUTE)).toBe(stamped);
    });

    it("keeps the submission time when the task later becomes pending", () => {
        const [stamped] = stampCanvasGenerationStart([imageNode({ status: "loading" })], 1_000);
        const [pending] = markCanvasGenerationPending([stamped], ["image-node"], { review: true, now: 8 * MINUTE });

        expect(canvasGenerationPendingState(pending)).toEqual({ since: 1_000, review: true });
    });

    it("does not stamp nodes that are idle or have no task", () => {
        const nodes = [imageNode({ status: "success" }), { ...imageNode({ status: "loading" }), id: "no-task", metadata: { status: "loading" as const } }];

        expect(stampCanvasGenerationStart(nodes, 0)).toBe(nodes);
    });

    it("restarts the clock when the node carries a different task", () => {
        const [pending] = markCanvasGenerationPending([imageNode()], ["image-node"], { now: 0 });
        const regenerated = { ...pending, metadata: { ...pending.metadata, imageTask: { id: "new-task", kind: "generation" as const, model: "image-model" } } };

        expect(isCanvasGenerationPendingExpired(regenerated, 60 * MINUTE)).toBe(false);
        expect(canvasGenerationPendingState(regenerated)).toBeUndefined();
    });

    it("shows the busy message and drops the task once it fails", () => {
        const [failed] = failCanvasGeneration([imageNode()], ["image-node"]);

        expect(failed.metadata).toMatchObject({ status: "error", errorDetails: CANVAS_GENERATION_BUSY_MESSAGE });
        expect(failed.metadata?.imageTask).toBeUndefined();
    });

    it("turns stored yellow review cards into generating nodes that recover automatically", () => {
        const stored = [imageNode({ status: "needs_review", errorDetails: "渠道未返回可查询任务 ID" }), { ...imageNode({ status: "needs_review", errorDetails: "x" }), id: "orphan", metadata: { status: "needs_review" as const } }];
        const [restored, orphan] = restoreCanvasGenerationPending(stored, 5_000);

        expect(restored.metadata).toMatchObject({ status: "loading", imageTask: { id: "image-task" } });
        expect(restored.metadata?.errorDetails).toBeUndefined();
        expect(canvasGenerationPendingState(restored)).toEqual({ since: 5_000, review: true });
        expect(orphan.metadata).toMatchObject({ status: "error", errorDetails: CANVAS_GENERATION_BUSY_MESSAGE });
    });
});
