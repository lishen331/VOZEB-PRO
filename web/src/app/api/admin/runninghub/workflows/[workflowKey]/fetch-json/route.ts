import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { fetchAndSaveWorkflowJson, RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ workflowKey: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const workflowKey = (await context.params).workflowKey;
    try {
        const result = await fetchAndSaveWorkflowJson(workflowKey);
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.fetch-json",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_workflow", id: workflowKey },
            metadata: { workflowCode: result.workflowCode, nodeCount: result.nodeCount, workflowJsonFingerprint: result.workflowJsonFingerprint },
        });
        return schoolApiOk(result);
    } catch (error) {
        if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
        return schoolApiFailure(error, "读取并保存 RunningHub 工作流 JSON 失败");
    }
}
