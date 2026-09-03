import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { createPlatformMaterial } from "@/lib/server/school-course-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ chapterId?: string; lessonId?: string; title?: string; storageKey?: string; sortOrder?: number }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const courseId = (await context.params).id;
        const material = await createPlatformMaterial(user.id, courseId, { ...parsed.data, title: typeof parsed.data.title === "string" ? parsed.data.title : "", storageKey: typeof parsed.data.storageKey === "string" ? parsed.data.storageKey : "" });
        await safeRecordAuditLog({ action: "admin.course.material.create", actor: auditActorFromRequest(request, user), target: { type: "course_material", id: material.id }, metadata: { courseId } });
        return schoolApiOk(material);
    } catch (error) {
        return schoolApiFailure(error, "创建课程资料失败");
    }
}
