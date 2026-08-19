import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { CreateSchoolInput } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { createSchoolByAdmin, listSchoolsByAdmin } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status && status !== "active" && status !== "disabled") return schoolApiError(400, "学校状态筛选无效");
    try {
        return schoolApiOk(
            await listSchoolsByAdmin(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword") || "",
                status: status === "active" || status === "disabled" ? status : undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<CreateSchoolInput>(request);
    if (!parsed.ok || !isSchoolApiObject(parsed.data)) {
        const status = parsed.ok ? 400 : parsed.status;
        await safeRecordAuditLog({ action: "admin.school.create", status: "failure", actor: auditActorFromRequest(request, user), metadata: { errorStatus: status } });
        if (parsed.ok) return schoolApiError(400, "请求参数无效");
        return schoolApiError(parsed.status, parsed.message);
    }
    try {
        const school = await createSchoolByAdmin(user.id, parsed.data);
        await safeRecordAuditLog({
            action: "admin.school.create",
            actor: auditActorFromRequest(request, user),
            target: { type: "school", id: school.id, label: school.name },
            metadata: { administratorUsername: parsed.data.administrator?.username || "" },
        });
        return schoolApiOk(school);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.school.create",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "school", label: parsed.data.name || "" },
            metadata: { errorStatus: schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, "创建学校失败");
    }
}
