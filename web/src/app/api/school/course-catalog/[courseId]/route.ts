import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getSchoolCourseCatalogDetail } from "@/lib/server/school-course-catalog-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getSchoolCourseCatalogDetail(user.id, (await context.params).courseId));
    } catch (error) {
        return schoolApiFailure(error, "读取课程目录失败");
    }
}
