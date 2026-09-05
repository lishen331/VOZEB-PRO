import { getCurrentUser } from "@/lib/auth/session";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listCurrentSchoolComputeLedger } from "@/lib/server/school-compute-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(
            await listCurrentSchoolComputeLedger(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)),
                groupId: params.get("groupId") || undefined,
                orderId: params.get("orderId") || undefined,
                type: params.get("type") || undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校算力流水失败");
    }
}
