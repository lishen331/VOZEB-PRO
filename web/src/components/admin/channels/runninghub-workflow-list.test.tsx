import { describe, expect, it } from "vitest";

import { getRunningHubWorkflowActionColumn, runningHubDemoBootstrapPath, runningHubWorkflowSnapshotLabel } from "./runninghub-workflow-list";

describe("RunningHub workflow action column", () => {
    it("pins the action column to the visible right edge", () => {
        const column = getRunningHubWorkflowActionColumn(() => null);

        expect(column.fixed).toBe("right");
        expect(column.width).toBeGreaterThanOrEqual(280);
        expect(column.className).toContain("runninghub-workflow-actions");
    });

    it("builds the channel-scoped Demo bootstrap endpoint", () => {
        expect(runningHubDemoBootstrapPath("rh-channel")).toBe("/api/admin/runninghub/workflows/bootstrap");
    });

    it("reports JSON snapshot state without exposing its contents", () => {
        expect(runningHubWorkflowSnapshotLabel({ workflowJsonFingerprint: undefined, requiresRetest: false })).toBe("未拉取 JSON");
        expect(runningHubWorkflowSnapshotLabel({ workflowJsonFingerprint: "hash", requiresRetest: true })).toBe("JSON 已更新，需重测");
    });
});
