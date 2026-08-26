import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { restoreCourse } from "@/lib/server/school-course-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const id = (await context.params).id;
        const result = await restoreCourse(user.id, id);
        await safeRecordAuditLog({ action: "admin.course.restore", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id } });
        return schoolApiOk(result);
    } catch (error) {
        return schoolApiFailure(error, "恢复课程失败");
    }
}
