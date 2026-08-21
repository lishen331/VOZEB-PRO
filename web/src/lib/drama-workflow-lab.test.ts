import { describe, expect, it } from "vitest";

import { DRAMA_WORKFLOW_LAB_STAGES, getDramaWorkflowLabProgress, getDramaWorkflowLabStageStatus, isDramaWorkflowLabEnabled } from "./drama-workflow-lab";

describe("drama workflow lab config", () => {
    it("is disabled when no flag is configured", () => {
        expect(isDramaWorkflowLabEnabled()).toBe(false);
        expect(isDramaWorkflowLabEnabled(undefined)).toBe(false);
        expect(isDramaWorkflowLabEnabled(" ")).toBe(false);
    });

    it.each(["1", "true", "TRUE", "yes", "on", "enabled", true, 1])("can be enabled explicitly (%s)", (value) => {
        expect(isDramaWorkflowLabEnabled(value)).toBe(true);
    });

    it("keeps unknown and explicit false values disabled", () => {
        expect(isDramaWorkflowLabEnabled("0")).toBe(false);
        expect(isDramaWorkflowLabEnabled("false")).toBe(false);
        expect(isDramaWorkflowLabEnabled("unexpected")).toBe(false);
    });

    it("keeps the workflow stages in the product order with stable labels", () => {
        expect(DRAMA_WORKFLOW_LAB_STAGES.map((stage) => stage.id)).toEqual(["script", "assets", "storyboard", "shots", "review", "export"]);
        expect(DRAMA_WORKFLOW_LAB_STAGES.map((stage) => stage.label)).toEqual(["剧本", "资产准备", "分镜", "镜头生成", "内容审核", "成片导出"]);
    });

    it("derives stage status from active and completed ids", () => {
        const completed = new Set(["script"] as const);

        expect(getDramaWorkflowLabStageStatus("script", "review", completed)).toBe("completed");
        expect(getDramaWorkflowLabStageStatus("review", "review", completed)).toBe("active");
        expect(getDramaWorkflowLabStageStatus("assets", "review", completed)).toBe("pending");
    });

    it("stops progress at the first incomplete stage", () => {
        const progress = getDramaWorkflowLabProgress({ hasScript: true, reviewed: true, hasAssets: true, hasStoryboard: false, hasGeneratedShot: false, exported: false });

        expect([...progress.completedStageIds]).toEqual(["script", "assets"]);
        expect(progress.activeStageId).toBe("storyboard");
    });

    it("keeps content review behind generated shots and before export", () => {
        const progress = getDramaWorkflowLabProgress({ hasScript: true, reviewed: true, hasAssets: true, hasStoryboard: true, hasGeneratedShot: true, exported: false });

        expect([...progress.completedStageIds]).toEqual(["script", "assets", "storyboard", "shots", "review"]);
        expect(progress.activeStageId).toBe("export");
    });
});
