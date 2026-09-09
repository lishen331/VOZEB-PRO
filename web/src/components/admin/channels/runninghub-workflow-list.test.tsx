import { renderToStaticMarkup } from "react-dom/server";
import { App } from "antd";
import type { SystemModelChannel } from "@/lib/auth/store";
import { describe, expect, it } from "vitest";

import { RunningHubWorkflowList, getRunningHubWorkflowActionColumn, runningHubDemoBootstrapPath, runningHubWorkflowEnableConfirmation, runningHubWorkflowSnapshotLabel, runningHubWorkflowTestLabel } from "./runninghub-workflow-list";

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
        expect(runningHubWorkflowEnableConfirmation({ enabled: false, requiresRetest: true })).toMatchObject({ title: "当前工作流尚未通过当前配置测试，不能启用", okText: "知道了", cancelText: "取消", okButtonProps: { disabled: true } });
        expect(runningHubWorkflowEnableConfirmation({ enabled: false, requiresRetest: true }).description).toContain("完成一次成功测试");
        expect(runningHubWorkflowEnableConfirmation({ enabled: false, requiresRetest: false })).toMatchObject({ title: "启用这个版本？", okText: "确定", okButtonProps: undefined });
        expect(runningHubWorkflowEnableConfirmation({ enabled: true, requiresRetest: true }).title).toBe("停用这个版本？");
    });
});

describe("RunningHub channel activation notice", () => {
    it("explains that enabled workflows cannot serve users while the channel is disabled", () => {
        const channel = { id: "rh", name: "RunningHub", enabled: false } as SystemModelChannel;
        const html = renderToStaticMarkup(
            <App>
                <RunningHubWorkflowList channel={channel} />
            </App>,
        );
        expect(html).toContain("所属渠道已停用");
        expect(html).toContain("保存更改");
        const enabledHtml = renderToStaticMarkup(
            <App>
                <RunningHubWorkflowList channel={{ ...channel, enabled: true }} />
            </App>,
        );
        expect(enabledHtml).not.toContain("所属渠道已停用");
    });
});
