import { hasAdminPermission, hasAnyAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { IP_STATUSES, IP_VISIBILITIES } from "@/lib/ip-library-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createAdminIp, listAdminIps, type AdminIpCreateInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAnyAdminPermission(user, ["content.manage", "education.manage"])) return schoolApiError(403, "当前管理员没有 IP 库职责权限");
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;
    const visibility = params.get("visibility") || undefined;
    if (status && !IP_STATUSES.includes(status as (typeof IP_STATUSES)[number])) return schoolApiError(400, "IP 状态筛选无效");
    if (visibility && !IP_VISIBILITIES.includes(visibility as (typeof IP_VISIBILITIES)[number])) return schoolApiError(400, "IP 可见范围筛选无效");
    try {
        return schoolApiOk(await listAdminIps(user.id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20), keyword: params.get("keyword") || undefined, status, visibility }));
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const parsed = await readJsonBodyResult<AdminIpCreateInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const record = await createAdminIp(user.id, parsed.data as AdminIpCreateInput);
        await safeRecordAuditLog({
            action: "admin.ip.create",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip", id: record.id, label: record.title },
            metadata: { status: record.status, visibility: record.visibility },
        });
        return schoolApiOk(record);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.ip.create", status: "failure", actor: auditActorFromRequest(request, user), metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "创建 IP 失败");
    }
}
