import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { initializeDemoRunningHubWorkflows, RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 64 * 1024);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    const channelId = typeof parsed.data.channelId === "string" ? parsed.data.channelId.trim() : "";
    if (!channelId) return schoolApiError(400, "缺少 RunningHub 渠道");
    try {
        const result = await initializeDemoRunningHubWorkflows({ channelId, overwrite: parsed.data.overwrite === true });
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.bootstrap",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_channel", id: channelId },
            metadata: { added: result.added, updated: result.updated, skipped: result.skipped },
        });
        return schoolApiOk(result);
    } catch (error) {
        if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
        return schoolApiFailure(error, "初始化 RunningHub Demo 工作流失败");
    }
}
