import { hasAdminPermission, hasAnyAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteAdminIp, getAdminIp, updateAdminIp, type AdminIpPatchInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAnyAdminPermission(user, ["content.manage", "education.manage"])) return schoolApiError(403, "当前管理员没有 IP 库职责权限");
    try {
        return schoolApiOk(await getAdminIp(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 失败");
    }
}

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const id = (await context.params).id;
    const parsed = await readJsonBodyResult<AdminIpPatchInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const record = await updateAdminIp(user.id, id, parsed.data as AdminIpPatchInput);
        await safeRecordAuditLog({ action: "admin.ip.update", actor: auditActorFromRequest(request, user), target: { type: "ip", id }, metadata: { status: record.status, visibility: record.visibility } });
        return schoolApiOk(record);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.update", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip", id }, metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "更新 IP 失败");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const id = (await context.params).id;
    try {
        const result = await deleteAdminIp(user.id, id);
        await safeRecordAuditLog({ action: "admin.ip.delete", actor: auditActorFromRequest(request, user), target: { type: "ip", id }, metadata: { deleted: result.deleted } });
        return schoolApiOk(result);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.delete", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip", id }, metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "删除 IP 失败");
    }
}
