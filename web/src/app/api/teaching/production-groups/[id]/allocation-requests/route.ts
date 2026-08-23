import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { listGroupAllocationRequests, requestGroupAllocation } from "@/lib/server/school-production-group-service";
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
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ orderId?: unknown; amount?: unknown; reason?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.orderId !== "string" || typeof parsed.data.amount !== "number" || typeof parsed.data.reason !== "string") return schoolApiError(400, "申请参数无效");
    try {
        return schoolApiOk(await requestGroupAllocation(user.id, (await context.params).id, { orderId: parsed.data.orderId, amount: parsed.data.amount, reason: parsed.data.reason }));
    } catch (error) {
        return schoolApiFailure(error, "提交追加申请失败");
    }
}
