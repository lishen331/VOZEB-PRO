import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchRunningHubWorkflowJson } from "@/lib/server/runninghub-provider";
import { getWorkflowChannel } from "@/lib/server/runninghub-workflow-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");

    try {
        const body = (await request.json()) as { channelId?: string; workflowId?: string };
        if (!body.channelId || !body.workflowId) return schoolApiError(400, "缺少必要参数");

        const channel = await getWorkflowChannel(body.channelId);
        const raw = await fetchRunningHubWorkflowJson({
            baseUrl: channel.baseUrl,
            apiKey: channel.apiKey || "",
            workflowId: body.workflowId
        });

        return schoolApiOk({ raw });
    } catch (error) {
        return schoolApiFailure(error, "获取工作流 JSON 失败");
    }
}
