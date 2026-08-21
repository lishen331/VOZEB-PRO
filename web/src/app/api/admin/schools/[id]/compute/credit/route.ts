import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { creditSchoolComputePool } from "@/lib/server/school-compute-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreditInput = { amount: number; reason: string; idempotencyKey: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage") || !hasAdminPermission(user, "billing.manage")) return schoolApiError(403, "学校算力池充值需要产教运营和财务管理职责权限");
    const schoolId = (await context.params).id;
    const parsed = await readJsonBodyResult<CreditInput>(request);
    if (!parsed.ok || !isSchoolApiObject(parsed.data)) return parsed.ok ? schoolApiError(400, "请求参数无效") : schoolApiError(parsed.status, parsed.message);
    try {
        const result = await creditSchoolComputePool(user.id, schoolId, parsed.data);
        const ledgerId = result.ledger.items.find((entry) => entry.idempotencyKey === parsed.data.idempotencyKey)?.id;
        await safeRecordAuditLog({
            action: "admin.school-compute.credit",
            actor: auditActorFromRequest(request, user),
            target: { type: "school_compute_pool", id: schoolId },
            metadata: { schoolId, amount: Number(parsed.data.amount), reason: parsed.data.reason?.trim().slice(0, 120) || "", ledgerId },
        });
        return schoolApiOk(result);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.school-compute.credit",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "school_compute_pool", id: schoolId },
            metadata: { schoolId, errorStatus: schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, "学校算力池充值失败");
    }
}
