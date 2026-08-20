import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { listGroupAllocationRequests, reviewGroupAllocation } from "@/lib/server/school-production-group-service";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listGroupAllocationRequests(user.id, (await context.params).id, { page: positiveInteger(params.get("page"), 1), pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)) }));
    } catch (error) {
        return schoolApiFailure(error, "读取追加申请失败");
    }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ requestId?: unknown; decision?: unknown; note?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.requestId !== "string" || (parsed.data.decision !== "approved" && parsed.data.decision !== "rejected") || typeof parsed.data.note !== "string") return schoolApiError(400, "审核参数无效");
    try {
        const result = await reviewGroupAllocation(user.id, parsed.data.requestId, { decision: parsed.data.decision, note: parsed.data.note });
        if (result.groupId !== (await context.params).id) return schoolApiError(404, "追加申请不存在");
        return schoolApiOk(result);
    } catch (error) {
        return schoolApiFailure(error, "审核追加申请失败");
    }
}
