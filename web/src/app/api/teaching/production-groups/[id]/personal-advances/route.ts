import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { createPersonalAdvance, listOwnPersonalAdvances } from "@/lib/server/school-compute-advance-service";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listOwnPersonalAdvances(user.id, (await context.params).id, { page: positiveInteger(params.get("page"), 1), pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)) }));
    } catch (error) {
        return schoolApiFailure(error, "读取个人垫付失败");
    }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ orderId?: unknown; amount?: unknown; idempotencyKey?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.orderId !== "string" || typeof parsed.data.amount !== "number" || typeof parsed.data.idempotencyKey !== "string") return schoolApiError(400, "个人垫付参数无效");
    try {
        return schoolApiOk(await createPersonalAdvance(user.id, (await context.params).id, { orderId: parsed.data.orderId, amount: parsed.data.amount, idempotencyKey: parsed.data.idempotencyKey }));
    } catch (error) {
        return schoolApiFailure(error, "创建个人垫付失败");
    }
}
