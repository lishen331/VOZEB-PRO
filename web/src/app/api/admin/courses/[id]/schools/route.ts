import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { assignCourseToSchools } from "@/lib/server/school-course-service";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const courseId = (await context.params).id;
    const parsed = await readJsonBodyResult<{ schoolIds?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    if (!Array.isArray(parsed.data.schoolIds) || parsed.data.schoolIds.some((id) => typeof id !== "string")) return schoolApiError(400, "学校列表无效");
    try {
        const assignments = await assignCourseToSchools(user.id, courseId, parsed.data.schoolIds);
        await safeRecordAuditLog({ action: "admin.course.assign", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id: courseId }, metadata: { schoolIds: assignments.map((item) => item.schoolId), status: "active" } });
        return schoolApiOk(assignments);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.course.assign", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id: courseId }, metadata: { errorStatus: errorStatus(error) } });
        return schoolApiFailure(error, "分配课程失败");
    }
}

function errorStatus(error: unknown) {
    return error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
}
