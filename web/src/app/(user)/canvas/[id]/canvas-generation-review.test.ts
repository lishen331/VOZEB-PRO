import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { canvasGenerationPendingState } from "./canvas-generation-feedback";
import { hasCanvasGenerationTask, pauseCanvasGenerationReview } from "./canvas-generation-review";

const taskNode: CanvasNodeData = {
    id: "video-node",
    type: CanvasNodeType.Video,
    title: "视频任务",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: { status: "loading", videoTask: { id: "original-task", provider: "generation", model: "video-model" } },
};

describe("Canvas generation review state", () => {
    afterEach(() => vi.restoreAllMocks());

    it("keeps a needs-review task generating instead of pausing it on a yellow card", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const [paused] = pauseCanvasGenerationReview([taskNode], [taskNode.id], "渠道未返回可查询任务 ID");

        expect(paused.metadata).toMatchObject({ status: "loading", videoTask: { id: "original-task" } });
        expect(paused.metadata?.errorDetails).toBeUndefined();
        expect(canvasGenerationPendingState(paused)).toMatchObject({ review: true });
        expect(hasCanvasGenerationTask(paused)).toBe(true);
    });

    it("logs the real reason for troubleshooting without putting it on the node", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const [paused] = pauseCanvasGenerationReview([taskNode], [taskNode.id], "原任务没有保存上游任务 ID");

        expect(warn).toHaveBeenCalledWith(expect.any(String), "原任务没有保存上游任务 ID");
        expect(JSON.stringify(paused)).not.toContain("上游任务 ID");
    });
});
