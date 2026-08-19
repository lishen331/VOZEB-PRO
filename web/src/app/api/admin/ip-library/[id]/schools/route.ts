import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createAdminIpGrant, listAdminIpGrants, type AdminIpGrantInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listAdminIpGrants(user.id, (await context.params).id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20), schoolId: params.get("schoolId") || undefined, status: params.get("status") || undefined }));
    } catch (error) {
        return schoolApiFailure(error, "读取学校授权失败");
    }
}

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpGrantInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    const ipId = (await context.params).id;
    try {
        const grant = await createAdminIpGrant(user.id, ipId, parsed.data as AdminIpGrantInput);
        await safeRecordAuditLog({ action: "admin.ip.grant.create", actor: auditActorFromRequest(request, user), target: { type: "ip_school_grant", id: grant.id }, metadata: { ipId, schoolId: grant.schoolId, mode: grant.mode, status: grant.status } });
        return schoolApiOk(grant);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.grant.create", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip", id: ipId }, metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "创建学校授权失败");
    }
}
