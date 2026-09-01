import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { copyWorkflowVersion, RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workflowKey: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const parsed = await readJsonBodyResult<{ config?: unknown; activateVersion?: unknown }>(request, 1024 * 1024);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isObject(parsed.data) || (parsed.data.activateVersion !== undefined && typeof parsed.data.activateVersion !== "boolean")) return schoolApiError(400, "版本参数无效");
    try {
        const workflow = await copyWorkflowVersion((await context.params).workflowKey, { config: parsed.data.config, activateVersion: parsed.data.activateVersion === true });
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.version.copy",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_workflow", id: workflow.workflowKey, label: workflow.workflowName },
            metadata: { version: workflow.version, enabled: workflow.enabled },
        });
        return schoolApiOk(workflow);
    } catch (error) {
        if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
        return schoolApiFailure(error, "复制 RunningHub 工作流版本失败");
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
