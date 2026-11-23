import { hasAdminPermission, hasAllAdminPermissions } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeSchoolMemberRole, type AdminSchoolMemberBatchPointsAdjustmentInput, type AdminSchoolMemberQuery, type SchoolMemberRole, type SchoolMembershipStatus } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { adjustSchoolMemberBatchPointsByAdmin, listSchoolMembersByAdmin } from "@/lib/server/admin-school-member-points-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const schoolId = (await context.params).id;
    const params = new URL(request.url).searchParams;
    const roleValue = params.get("role");
    const statusValue = params.get("status");
    const role = roleValue ? normalizeSchoolMemberRole(roleValue) : undefined;
    if (roleValue && !role) return schoolApiError(400, "成员角色筛选无效");
    const status = statusValue === "active" || statusValue === "disabled" ? statusValue : undefined;
    if (statusValue && !status) return schoolApiError(400, "成员状态筛选无效");
    const query: AdminSchoolMemberQuery = {
        page: positiveInteger(params.get("page"), 1),
        pageSize: positiveInteger(params.get("pageSize"), 20),
        keyword: params.get("keyword") || "",
        role: role as SchoolMemberRole | undefined,
        status: status as SchoolMembershipStatus | undefined,
    };
    try {
        return schoolApiOk(await listSchoolMembersByAdmin(user.id, schoolId, query));
    } catch (error) {
        return schoolApiFailure(error, "读取学校成员失败");
    }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAllAdminPermissions(user, ["education.manage", "billing.manage"])) return schoolApiError(403, "学校成员积分调整需要产教运营和财务管理职责权限");
    const { id: schoolId } = await context.params;
    const audit = { action: "admin.school-member.points-batch-adjust", actor: auditActorFromRequest(request, user), target: { type: "school", id: schoolId } };
    const parsed = await readJsonBodyResult<AdminSchoolMemberBatchPointsAdjustmentInput>(request);
    if (!parsed.ok) {
        await safeRecordAuditLog({ ...audit, status: "failure", metadata: { errorStatus: parsed.status } });
        return schoolApiError(parsed.status, parsed.message);
    }
    const body = parsed.data;
    if (!isSchoolApiObject(body) || !Array.isArray(body.membershipIds) || (body.operation !== "credit" && body.operation !== "debit") || typeof body.amount !== "number" || typeof body.reason !== "string" || typeof body.idempotencyKey !== "string") {
        await safeRecordAuditLog({ ...audit, status: "failure", metadata: { errorStatus: 400 } });
        return schoolApiError(400, "请求参数无效");
    }
    try {
        const items = await adjustSchoolMemberBatchPointsByAdmin(user.id, schoolId, body);
        await safeRecordAuditLog({
            ...audit,
            metadata: {
                operation: body.operation,
                amount: body.amount,
                memberCount: items.length,
                adjustments: items.map(({ member, adjustment }) => ({ membershipId: member.id, recordId: adjustment.recordId })),
            },
        });
        return schoolApiOk({ items: items.map(({ member, adjustment }) => ({ member, adjustment })) });
    } catch (error) {
        await safeRecordAuditLog({ ...audit, status: "failure", metadata: { errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, "批量调整成员积分失败");
    }
}

function positiveInteger(value: string | null, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
