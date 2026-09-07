import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createAdminIpSubIp, type AdminIpSubIpInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpSubIpInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    const ipId = (await context.params).id;
    try {
        const subIp = await createAdminIpSubIp(user.id, ipId, parsed.data as AdminIpSubIpInput);
        await safeRecordAuditLog({ action: "admin.ip.sub_ip.create", actor: auditActorFromRequest(request, user), target: { type: "ip_sub_ip", id: subIp.id, label: subIp.title }, metadata: { ipId } });
        return schoolApiOk(subIp);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.sub_ip.create", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip", id: ipId }, metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "创建子 IP 失败");
    }
}
