import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createAdminIpGrant, createAdminIpGrants, listAdminIpGrants, type AdminIpGrantBatchInput, type AdminIpGrantInput } from "@/lib/server/ip-library-admin-service";
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
        return schoolApiOk(
            await listAdminIpGrants(user.id, (await context.params).id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                schoolId: params.get("schoolId") || undefined,
                subIpId: params.get("subIpId") || undefined,
                status: params.get("status") || undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校授权失败");
    }
}

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpGrantInput | AdminIpGrantBatchInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    const ipId = (await context.params).id;
    try {
        const batch = isBatchGrant(parsed.data);
        const grants = batch ? await createAdminIpGrants(user.id, ipId, parsed.data as AdminIpGrantBatchInput) : [await createAdminIpGrant(user.id, ipId, parsed.data as AdminIpGrantInput)];
        await safeRecordAuditLog({
            action: "admin.ip.grant.create",
            actor: auditActorFromRequest(request, user),
            target: { type: batch ? "ip" : "ip_school_grant", id: batch ? ipId : grants[0].id },
            metadata: batch ? { ipId, grantCount: String(grants.length) } : { ipId, subIpId: grants[0].subIpId, schoolId: grants[0].schoolId, mode: grants[0].mode, status: grants[0].status },
        });
        return schoolApiOk(batch ? grants : grants[0]);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.grant.create", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "ip", id: ipId }, metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "创建学校授权失败");
    }
}

function isBatchGrant(value: AdminIpGrantInput | AdminIpGrantBatchInput): value is AdminIpGrantBatchInput {
    return "subIpIds" in value || "schoolIds" in value;
}
