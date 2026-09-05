import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { RunningHubWorkflowError, createWorkflow, listWorkflows } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status && status !== "enabled" && status !== "disabled") return schoolApiError(400, "工作流状态筛选无效");
    try {
        return schoolApiOk(
            await listWorkflows({
                search: params.get("search") || undefined,
                businessCode: params.get("businessCode") || undefined,
                capability: params.get("capability") || undefined,
                status: status as "enabled" | "disabled" | undefined,
                channelId: params.get("channelId") || undefined,
                page: positive(params.get("page")),
                pageSize: positive(params.get("pageSize")),
            }),
        );
    } catch (error) {
        return workflowFailure(error, "读取 RunningHub 工作流失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 1024 * 1024);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isObject(parsed.data)) return schoolApiError(400, "请求参数无效");
    try {
        const workflow = await createWorkflow(parsed.data);
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.create",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_workflow", id: workflow.workflowKey, label: workflow.workflowName },
            metadata: { businessCode: workflow.businessCode, version: workflow.version, enabled: workflow.enabled },
        });
        return schoolApiOk(workflow);
    } catch (error) {
        return workflowFailure(error, "创建 RunningHub 工作流失败");
    }
}

function workflowFailure(error: unknown, fallback: string) {
    if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
    const status = schoolApiErrorStatus(error);
    return schoolApiFailure(status === 500 ? new Error(fallback) : error, fallback);
}

function positive(value: string | null) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
