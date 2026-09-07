import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteAdminIpSubIp, updateAdminIpSubIp, type AdminIpSubIpInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; subIpId: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpSubIpInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    const { id, subIpId } = await context.params;
    try {
        const subIp = await updateAdminIpSubIp(user.id, id, subIpId, parsed.data as AdminIpSubIpInput);
        await safeRecordAuditLog({ action: "admin.ip.sub_ip.update", actor: auditActorFromRequest(request, user), target: { type: "ip_sub_ip", id: subIpId, label: subIp.title }, metadata: { ipId: id } });
        return schoolApiOk(subIp);
    } catch (error) {
        return schoolApiFailure(error, "更新子 IP 失败");
    }
}
export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const { id, subIpId } = await context.params;
    try {
        const result = await deleteAdminIpSubIp(user.id, id, subIpId);
        await safeRecordAuditLog({ action: "admin.ip.sub_ip.delete", actor: auditActorFromRequest(request, user), target: { type: "ip_sub_ip", id: subIpId }, metadata: { ipId: id } });
        return schoolApiOk(result);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.sub_ip.delete", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip_sub_ip", id: subIpId }, metadata: { ipId: id, errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "删除子 IP 失败");
    }
}
