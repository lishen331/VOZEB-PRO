import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama workflow lab collaboration", () => {
    it("uses durable collaboration APIs instead of local-only demo state", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        const panelStart = source.indexOf("function CollaborationPanel");
        const panelEnd = source.indexOf("function ToggleRow", panelStart);
        expect(panelStart).toBeGreaterThanOrEqual(0);
        expect(panelEnd).toBeGreaterThan(panelStart);
        const panel = source.slice(panelStart, panelEnd);

        expect(source).toContain("/collaboration");
        expect(source).toContain('collaborationApi("/approvals');
        expect(source).toContain('method: "PUT"');
        expect(source).toContain('method: "POST"');
        expect(source).toContain('decision: "approve"');
        expect(source).toContain('decision: "reject"');
        expect(source).toContain('key: "storyboard"');
        expect(source).toContain('storyboard: "storyboard"');
        expect(source).toContain('storyboard_image: "visual_images"');
        expect(source).not.toContain('stage.key === "visual_images" && item.stage === "storyboard"');
        expect(source).toContain("pageSize=20");
        expect(source).toContain("onLoadMoreApprovals");
        expect(source).toContain("StageCollaborationBanner");
        expect(source).toContain("exportBlockedByApproval");
        expect(source).toContain("strictApprovalBlock");

        expect(panel).toContain("approvalStages");
        expect(panel).toContain("overview");
        expect(panel).toContain("approvals");
        expect(panel).toContain("onReviewJoinRequest");
        expect(panel).toContain("onRefresh");
        expect(panel).not.toContain("本地协作演示");
        expect(panel).not.toContain("不创建项目组");
    });
});
