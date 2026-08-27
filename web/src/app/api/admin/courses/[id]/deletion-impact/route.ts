import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getCourseDeletionImpact } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getCourseDeletionImpact(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取课程删除影响失败");
    }
}
