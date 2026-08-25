import { describe, expect, it } from "vitest";

import { dramaLabVideoTaskReviewDescription, requiresDramaLabVideoTaskCheck } from "./drama-lab-video-task-recovery";

describe("drama lab video task recovery", () => {
    it("only exposes manual checking when the original task is retained for review", () => {
        expect(requiresDramaLabVideoTaskCheck({ generationNeedsReview: true, generationTaskId: "video-original" })).toBe(true);
        expect(requiresDramaLabVideoTaskCheck({ generationNeedsReview: true })).toBe(false);
        expect(requiresDramaLabVideoTaskCheck({ generationTaskId: "video-terminal" })).toBe(false);
    });

    it("explains that checking uses the original task without a duplicate submission", () => {
        expect(dramaLabVideoTaskReviewDescription({ generationNeedsReview: true, generationTaskId: "video-original", generationError: "视频结果已返回，仍待本地保存" })).toContain("不会重新提交或重复扣费");
        expect(dramaLabVideoTaskReviewDescription({ generationNeedsReview: true, generationTaskId: "video-original", generationError: "视频结果已返回，仍待本地保存" })).toContain("视频结果已返回，仍待本地保存");
    });
});
