import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { allocateSchoolPointsToGroup } from "@/lib/server/school-production-group-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ amount?: unknown; reason?: unknown; orderId?: unknown; idempotencyKey?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.amount !== "number" || typeof parsed.data.reason !== "string" || typeof parsed.data.idempotencyKey !== "string") return schoolApiError(400, "分配参数无效");
    try {
        return schoolApiOk(
            await allocateSchoolPointsToGroup(user.id, (await context.params).id, {
                amount: parsed.data.amount,
                reason: parsed.data.reason,
                orderId: typeof parsed.data.orderId === "string" ? parsed.data.orderId : undefined,
                idempotencyKey: parsed.data.idempotencyKey,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "分配学校算力失败");
    }
}
