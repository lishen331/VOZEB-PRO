import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { PlatformCoursePatch } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getPlatformCourse, updatePlatformCourse } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    try {
        return schoolApiOk(await getPlatformCourse(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取课程失败");
    }
}

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const id = (await context.params).id;
    const parsed = await readJsonBodyResult<PlatformCoursePatch>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const course = await updatePlatformCourse(user.id, id, parsed.data);
        await safeRecordAuditLog({ action: "admin.course.update", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id }, metadata: { status: course.status } });
        return schoolApiOk(course);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.course.update", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id }, metadata: { errorStatus: errorStatus(error) } });
        return schoolApiFailure(error, "更新课程失败");
    }
}

function errorStatus(error: unknown) {
    return error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
}
