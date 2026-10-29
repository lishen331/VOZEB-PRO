import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getMyLessonPlan, saveMyLessonPlan } from "@/lib/server/teaching-lesson-plan-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ assignmentId: string; lessonId: string }> };

const MAX_PLAN_BODY_BYTES = 256 * 1024;

/** 读我在这节课的教案；没写过时 data 为 null */
export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const { assignmentId, lessonId } = await context.params;
        return schoolApiOk(await getMyLessonPlan(user.id, assignmentId, lessonId));
    } catch (error) {
        return schoolApiFailure(error, "读取教案失败");
    }
}

/** 保存教案：{ content, status?: "draft" | "ready", baseUpdatedAt: string | null } */
export async function PUT(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, MAX_PLAN_BODY_BYTES);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const { assignmentId, lessonId } = await context.params;
        return schoolApiOk(await saveMyLessonPlan(user.id, assignmentId, lessonId, { content: parsed.data.content, status: parsed.data.status, baseUpdatedAt: parsed.data.baseUpdatedAt }));
    } catch (error) {
        return schoolApiFailure(error, "保存教案失败");
    }
}
