import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getSchoolCourseTree } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getSchoolCourseTree(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校课程树失败");
    }
}
