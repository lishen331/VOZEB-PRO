import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { unlockSchoolCourse } from "@/lib/server/school-course-catalog-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    const courseId = (await context.params).courseId;
    try {
        const entry = await unlockSchoolCourse(user.id, courseId);
        await safeRecordAuditLog({
            action: "school.course_catalog.unlock",
            actor: auditActorFromRequest(request, user),
            target: { type: "platform_course", id: courseId },
            metadata: { assignmentId: entry.assignmentId },
        });
        return schoolApiOk(entry);
    } catch (error) {
        await safeRecordAuditLog({ action: "school.course_catalog.unlock", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id: courseId }, metadata: {} });
        return schoolApiFailure(error, "课程解锁失败");
    }
}
