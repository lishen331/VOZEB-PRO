import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { uploadCourseCover } from "@/lib/server/course-cover-service";
import { readRequestBodyBytes } from "@/lib/server/request-body-limit";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
export async function PUT(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "需要产教运营职责权限");
    try {
        const cover = await uploadCourseCover(user.id, await readRequestBodyBytes(request, CREATIVE_UPLOAD_MAX_BYTES));
        await safeRecordAuditLog({ action: "admin.course.cover.upload", actor: auditActorFromRequest(request, user), target: { type: "course_cover", id: cover.storageKey } });
        return schoolApiOk(cover);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.course.cover.upload", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "course_cover" } });
        return schoolApiFailure(error, "课程封面上传失败");
    }
}
