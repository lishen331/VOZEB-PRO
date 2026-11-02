import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getLessonTemplateForTeacher } from "@/lib/server/teaching-lesson-plan-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ assignmentId: string; lessonId: string }> };

/** 课程方给这节课写的标准教案（老师只读）；没有时 data 为 null */
export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const { assignmentId, lessonId } = await context.params;
        return schoolApiOk(await getLessonTemplateForTeacher(user.id, assignmentId, lessonId));
    } catch (error) {
        return schoolApiFailure(error, "读取标准教案失败");
    }
}
