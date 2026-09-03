import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { deleteCourseMaterial, updateCourseMaterial } from "@/lib/server/school-course-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ title?: string; sortOrder?: number; status?: "active" | "disabled" }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const id = (await context.params).id;
        const result = await updateCourseMaterial(user.id, id, parsed.data);
        await safeRecordAuditLog({ action: "school.course.material.update", actor: auditActorFromRequest(request, user), target: { type: "course_material", id } });
        return schoolApiOk(result);
    } catch (error) {
        return schoolApiFailure(error, "更新本校课程资料失败");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const id = (await context.params).id;
        const result = await deleteCourseMaterial(user.id, id);
        await safeRecordAuditLog({ action: "school.course.material.delete", actor: auditActorFromRequest(request, user), target: { type: "course_material", id } });
        return schoolApiOk(result);
    } catch (error) {
        return schoolApiFailure(error, "删除本校课程资料失败");
    }
}
