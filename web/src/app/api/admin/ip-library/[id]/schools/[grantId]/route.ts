import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { updateAdminIpGrant, type AdminIpGrantPatchInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; grantId: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpGrantPatchInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    const { id: ipId, grantId } = await context.params;
    try {
        const grant = await updateAdminIpGrant(user.id, ipId, grantId, parsed.data as AdminIpGrantPatchInput);
        await safeRecordAuditLog({ action: "admin.ip.grant.update", actor: auditActorFromRequest(request, user), target: { type: "ip_school_grant", id: grant.id }, metadata: { ipId, schoolId: grant.schoolId, mode: grant.mode, status: grant.status } });
        return schoolApiOk(grant);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.grant.update", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip_school_grant", id: grantId }, metadata: { ipId, errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "更新学校授权失败");
    }
}
