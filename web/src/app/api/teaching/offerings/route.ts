import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { listTeachingOfferings } from "@/lib/server/school-course-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listTeachingOfferings(user.id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20) }));
    } catch (error) {
        return schoolApiFailure(error, "读取负责课程失败");
    }
}
