import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { getWorkflow, RunningHubWorkflowError, setWorkflowEnabled, updateWorkflow } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workflowKey: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    try {
        return schoolApiOk(await getWorkflow((await context.params).workflowKey));
    } catch (error) {
        return workflowFailure(error, "读取 RunningHub 工作流失败");
    }
}

export async function PUT(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const workflowKey = (await context.params).workflowKey;
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 1024 * 1024);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isObject(parsed.data)) return schoolApiError(400, "请求参数无效");
    try {
        const result = Object.keys(parsed.data).length === 1 && typeof parsed.data.enabled === "boolean" ? await setWorkflowEnabled(workflowKey, parsed.data.enabled) : await updateWorkflow(workflowKey, parsed.data);
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.update",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_workflow", id: result.workflowKey, label: result.workflowName },
            metadata: { version: result.version, enabled: result.enabled },
        });
        return schoolApiOk(result);
    } catch (error) {
        return workflowFailure(error, "更新 RunningHub 工作流失败");
    }
}

function workflowFailure(error: unknown, fallback: string) {
    if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
    return schoolApiFailure(error, fallback);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
