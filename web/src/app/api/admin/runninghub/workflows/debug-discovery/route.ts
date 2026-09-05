import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { analyzeRunningHubWorkflowJson } from "@/lib/server/runninghub-workflow-discovery";
import { fetchRunningHubWorkflowJson } from "@/lib/server/runninghub-provider";
import { getWorkflowChannel } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unwrapWorkflowJson(raw: unknown) {
    const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
    const data = asRecord(asRecord(raw).data);
    if (typeof data.prompt !== "string") return raw;
    try {
        const parsed = JSON.parse(data.prompt) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
        const workflowType = String(data.workflowType || data.workflow_type || "").trim();
        return workflowType ? { workflowType, ...(parsed as Record<string, unknown>) } : parsed;
    } catch {
        return raw;
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");

    try {
        const body = await readJsonBody<{ channelId?: string; workflowId?: string; capability?: string }>(request);
        if (!body.channelId || !body.workflowId || !body.capability) return schoolApiError(400, "缺少必要参数");

        const channel = await getWorkflowChannel(body.channelId);
        const raw = await fetchRunningHubWorkflowJson({ baseUrl: channel.baseUrl, apiKey: channel.apiKey || "", workflowId: body.workflowId });
        const unwrapped = unwrapWorkflowJson(raw);
        const discovery = analyzeRunningHubWorkflowJson({ workflowId: body.workflowId, raw: unwrapped, capability: body.capability as "text" | "image" | "video" | "audio" });

        return schoolApiOk({
            raw: unwrapped,
            discovery: {
                ...discovery,
                candidates: discovery.candidates.map((c) => ({ ...c, nodeTitle: c.nodeTitle, nodeType: c.nodeType, role: c.role, label: c.label, confidence: c.confidence, hasExternalFileDependency: c.hasExternalFileDependency })),
            },
        });
    } catch (error) {
        return schoolApiFailure(error, "调试工作流解析失败");
    }
}
