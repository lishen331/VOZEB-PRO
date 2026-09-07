import { describe, expect, it } from "vitest";

import { getRunningHubWorkflowActionColumn, runningHubDemoBootstrapPath, runningHubWorkflowEnableConfirmation, runningHubWorkflowSnapshotLabel, runningHubWorkflowTestLabel } from "./runninghub-workflow-list";

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

    it("keeps unverified activation available but asks for explicit risk confirmation", () => {
        expect(runningHubWorkflowTestLabel({ lastTestAt: undefined, lastTestResult: undefined, requiresRetest: true })).toBe("未测试");
        expect(runningHubWorkflowTestLabel({ lastTestAt: "2026-09-08T00:00:00.000Z", lastTestResult: "failed", requiresRetest: false })).toBe("测试失败");
        expect(runningHubWorkflowTestLabel({ lastTestAt: "2026-09-08T00:00:00.000Z", lastTestResult: "success", requiresRetest: true })).toBe("配置已修改，尚未重新测试");
        expect(runningHubWorkflowEnableConfirmation({ enabled: false, requiresRetest: true })).toMatchObject({ okText: "仍然启用", cancelText: "取消" });
        expect(runningHubWorkflowEnableConfirmation({ enabled: false, requiresRetest: true }).description).toContain("建议先完成一次样例测试");
        expect(runningHubWorkflowEnableConfirmation({ enabled: true, requiresRetest: true }).title).toBe("停用这个版本？");
    });
});
