import { getCurrentUser } from "@/lib/auth/session";
import { listTeachingProductionGroups } from "@/lib/server/school-production-group-service";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listTeachingProductionGroups(user.id, { page: positiveInteger(params.get("page"), 1), pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)) }));
    } catch (error) {
        return schoolApiFailure(error, "读取我的制作小组失败");
    }
}
