import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { recordMyLessonRehearsal } from "@/lib/server/teaching-lesson-plan-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ assignmentId: string; lessonId: string }> };

/** 记一次试讲：{ totalSeconds, phases: [{ phaseId, seconds }] } */
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 64 * 1024);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const { assignmentId, lessonId } = await context.params;
        return schoolApiOk(await recordMyLessonRehearsal(user.id, assignmentId, lessonId, { totalSeconds: parsed.data.totalSeconds, phases: parsed.data.phases }));
    } catch (error) {
        return schoolApiFailure(error, "记录试讲失败");
    }
}
