import { hasAdminPermission, hasAnyAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createAdminIpVersion, listAdminIpVersions, publishAdminIpVersion, type AdminIpCreateVersionInput } from "@/lib/server/ip-library-admin-service";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
type Body = ({ action: "create" } & AdminIpCreateVersionInput) | { action: "publish"; versionId: string };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAnyAdminPermission(user, ["content.manage", "education.manage"])) return schoolApiError(403, "当前管理员没有 IP 库职责权限");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listAdminIpVersions(user.id, (await context.params).id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20) }));
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 版本失败");
    }
}

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const parsed = await readJsonBodyResult<Body>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data) || (parsed.data.action !== "create" && parsed.data.action !== "publish")) return schoolApiError(400, "版本操作无效");
    const ipId = (await context.params).id;
    const action = parsed.data.action;
    try {
        const version = action === "publish" ? await publishAdminIpVersion(user.id, ipId, String(parsed.data.versionId || "")) : await createAdminIpVersion(user.id, ipId, parsed.data as unknown as AdminIpCreateVersionInput);
        await safeRecordAuditLog({
            action: action === "publish" ? "admin.ip.version.publish" : "admin.ip.version.create",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip_version", id: version.id },
            metadata: { ipId, versionNumber: version.versionNumber, status: version.status },
        });
        return schoolApiOk(version);
    } catch (error) {
        await safeRecordAuditLog({
            action: action === "publish" ? "admin.ip.version.publish" : "admin.ip.version.create",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip", id: ipId },
            metadata: { errorStatus: schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, action === "publish" ? "发布 IP 版本失败" : "创建 IP 版本失败");
    }
}
