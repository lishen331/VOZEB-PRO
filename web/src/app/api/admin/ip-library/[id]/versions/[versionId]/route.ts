import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { updateAdminIpVersion, type AdminIpVersionInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; versionId: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpVersionInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "版本内容无效");
    const { id: ipId, versionId } = await context.params;
    try {
        const version = await updateAdminIpVersion(user.id, ipId, versionId, parsed.data as AdminIpVersionInput);
        await safeRecordAuditLog({
            action: "admin.ip.version.update",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip_version", id: version.id },
            metadata: { ipId, versionNumber: version.versionNumber, status: version.status },
        });
        return schoolApiOk(version);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.ip.version.update",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip_version", id: versionId },
            metadata: { ipId, errorStatus: schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, "更新 IP 草稿失败");
    }
}
