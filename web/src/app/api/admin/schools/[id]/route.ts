import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { UpdateSchoolInput } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getSchoolByAdmin, updateSchoolByAdmin } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    try {
        return schoolApiOk(await getSchoolByAdmin(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校失败");
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<UpdateSchoolInput>(request);
    const id = (await context.params).id;
    if (!parsed.ok || !isSchoolApiObject(parsed.data)) {
        const status = parsed.ok ? 400 : parsed.status;
        await safeRecordAuditLog({ action: "admin.school.update", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "school", id }, metadata: { errorStatus: status } });
        if (parsed.ok) return schoolApiError(400, "请求参数无效");
        return schoolApiError(parsed.status, parsed.message);
    }
    try {
        const school = await updateSchoolByAdmin(user.id, id, parsed.data);
        await safeRecordAuditLog({ action: "admin.school.update", actor: auditActorFromRequest(request, user), target: { type: "school", id, label: school.name }, metadata: { fields: Object.keys(parsed.data) } });
        return schoolApiOk(school);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.school.update", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "school", id }, metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "更新学校失败");
    }
}
