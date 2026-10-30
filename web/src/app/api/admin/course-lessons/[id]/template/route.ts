import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deletePlatformLessonTemplate, getPlatformLessonTemplate, savePlatformLessonTemplate } from "@/lib/server/platform-lesson-template-service";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const MAX_TEMPLATE_BODY_BYTES = 256 * 1024;

/** 课时的标准教案；没有时 data 为 null */
export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getPlatformLessonTemplate(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取标准教案失败");
    }
}

/** 保存标准教案：{ content }；内容全空时等同删除，返回 null */
export async function PUT(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, MAX_TEMPLATE_BODY_BYTES);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data) || !isSchoolApiObject(parsed.data.content)) return schoolApiError(400, "请求内容无效");
    try {
        const lessonId = (await context.params).id;
        const template = await savePlatformLessonTemplate(user.id, lessonId, parsed.data.content);
        await safeRecordAuditLog({ action: template ? "admin.course.lesson_template.save" : "admin.course.lesson_template.delete", actor: auditActorFromRequest(request, user), target: { type: "course_lesson", id: lessonId } });
        return schoolApiOk(template);
    } catch (error) {
        return schoolApiFailure(error, "保存标准教案失败");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const lessonId = (await context.params).id;
        const result = await deletePlatformLessonTemplate(user.id, lessonId);
        await safeRecordAuditLog({ action: "admin.course.lesson_template.delete", actor: auditActorFromRequest(request, user), target: { type: "course_lesson", id: lessonId } });
        return schoolApiOk(result);
    } catch (error) {
        return schoolApiFailure(error, "删除标准教案失败");
    }
}
