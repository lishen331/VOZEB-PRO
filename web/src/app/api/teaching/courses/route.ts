import { getCurrentUser } from "@/lib/auth/session";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listTeachingCourses } from "@/lib/server/school-course-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listTeachingCourses(user.id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20) }));
    } catch (error) {
        return schoolApiFailure(error, "读取课程失败");
    }
}
