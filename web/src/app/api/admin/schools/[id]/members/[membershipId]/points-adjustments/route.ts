import { isActivePlatformAdmin } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { AdminSchoolMemberPointsAdjustmentInput } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { adjustSchoolMemberPointsByAdmin } from "@/lib/server/admin-school-member-points-service";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; membershipId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!isActivePlatformAdmin(user)) return schoolApiError(403, "当前账号没有平台管理员权限");
    const { id: schoolId, membershipId } = await context.params;
    const parsed = await readJsonBodyResult<AdminSchoolMemberPointsAdjustmentInput>(request);
    if (!parsed.ok || !isSchoolApiObject(parsed.data)) {
        const status = parsed.ok ? 400 : parsed.status;
        await safeRecordAuditLog({
            action: "admin.school-member.points-adjust",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "school_member", id: membershipId },
            metadata: { schoolId, membershipId, errorStatus: status },
        });
        return parsed.ok ? schoolApiError(400, "请求参数无效") : schoolApiError(parsed.status, parsed.message);
    }
    const body = parsed.data;
    const input: AdminSchoolMemberPointsAdjustmentInput = {
        operation: body.operation,
        amount: body.amount,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
    };
    try {
        const result = await adjustSchoolMemberPointsByAdmin(user.id, schoolId, membershipId, input);
        await safeRecordAuditLog({
            action: "admin.school-member.points-adjust",
            actor: auditActorFromRequest(request, user),
            target: { type: "school_member", id: membershipId, label: result.member.accountId },
            metadata: {
                schoolId,
                membershipId,
                userId: result.member.userId,
                accountId: result.member.accountId,
                operation: result.adjustment.operation,
                amount: result.adjustment.amount,
                balanceBefore: result.adjustment.balanceBefore,
                balanceAfter: result.adjustment.balanceAfter,
                reason: result.adjustment.reason,
                recordId: result.adjustment.recordId,
                idempotencyKey: input.idempotencyKey,
            },
        });
        return schoolApiOk(result);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.school-member.points-adjust",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "school_member", id: membershipId },
            metadata: { schoolId, membershipId, errorStatus: schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, "调整成员积分失败");
    }
}
