import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { discoverWorkflow, parseWorkflowId, RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 64 * 1024);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isObject(parsed.data) || typeof parsed.data.channelId !== "string" || typeof parsed.data.workflowIdOrUrl !== "string" || !isCapability(parsed.data.capability)) return schoolApiError(400, "读取工作流参数无效");
    if (!parseWorkflowId(parsed.data.workflowIdOrUrl)) return schoolApiError(400, "Workflow ID 必须是数字或包含数字 ID 的完整链接");
    try {
        const result = await discoverWorkflow({ channelId: parsed.data.channelId, workflowIdOrUrl: parsed.data.workflowIdOrUrl, capability: parsed.data.capability });
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.discover",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_workflow", id: result.workflowId },
            metadata: { capability: result.workflowType, nodeCount: result.nodeCount },
        });
        return schoolApiOk(result);
    } catch (error) {
        if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
        return schoolApiFailure(error, "读取 RunningHub 工作流失败");
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCapability(value: unknown): value is "text" | "image" | "video" | "audio" {
    return value === "text" || value === "image" || value === "video" || value === "audio";
}
