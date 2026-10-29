import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listMyLessonPlans } from "@/lib/server/teaching-lesson-plan-service";

export const runtime = "nodejs";

/** 我的备课进度（各课时教案状态，不含正文）；?assignmentId= 只看一门课 */
export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await listMyLessonPlans(user.id, new URL(request.url).searchParams.get("assignmentId") || undefined));
    } catch (error) {
        return schoolApiFailure(error, "读取备课进度失败");
    }
}
