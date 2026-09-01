import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { inspectRunningHubWorkflowTest } from "@/lib/server/runninghub-workflow-test-service";
import { RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ workflowKey: string; runId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    try {
        const params = await context.params;
        const result = await inspectRunningHubWorkflowTest({ workflowKey: params.workflowKey, runId: params.runId, adminId: user.id });
        await safeRecordAuditLog({ action: "admin.runninghub.workflow.test.inspect", actor: auditActorFromRequest(request, user), target: { type: "runninghub_workflow_test", id: params.runId }, metadata: { status: result.status } });
        return schoolApiOk(result);
    } catch (error) {
        if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
        return schoolApiFailure(error, "读取 RunningHub 工作流测试失败");
    }
}
