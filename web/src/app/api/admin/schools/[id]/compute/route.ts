import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { adjustSchoolComputePool, getAdminSchoolComputePool, setSchoolComputePoolStatus } from "@/lib/server/school-compute-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchInput = { amount?: number; reason?: string; idempotencyKey?: string; status?: "active" | "frozen" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!canRead(user)) return schoolApiError(403, "当前管理员没有查看学校算力池的职责权限");
    try {
        return schoolApiOk(await getAdminSchoolComputePool(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校算力池失败");
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!canManage(user)) return schoolApiError(403, "学校算力池操作需要产教运营和财务管理职责权限");
    const schoolId = (await context.params).id;
    const parsed = await readJsonBodyResult<PatchInput>(request);
    if (!parsed.ok || !isSchoolApiObject(parsed.data)) return parsed.ok ? schoolApiError(400, "请求参数无效") : schoolApiError(parsed.status, parsed.message);
    const source = parsed.data;
    if (source.status !== undefined && source.status !== "active" && source.status !== "frozen") return schoolApiError(400, "算力池状态无效");
    const action = source.status === "active" ? "admin.school-compute.activate" : source.status === "frozen" ? "admin.school-compute.freeze" : "admin.school-compute.adjust";
    try {
        const result = source.status
            ? await setSchoolComputePoolStatus(user.id, schoolId, source.status)
            : await adjustSchoolComputePool(user.id, schoolId, { amount: Number(source.amount), reason: String(source.reason || ""), idempotencyKey: String(source.idempotencyKey || "") });
        const ledgerId = source.idempotencyKey ? result.ledger.items.find((entry) => entry.idempotencyKey === source.idempotencyKey)?.id : undefined;
        await safeRecordAuditLog({
            action,
            actor: auditActorFromRequest(request, user),
            target: { type: "school_compute_pool", id: schoolId },
            metadata: source.status ? { schoolId } : { schoolId, amount: Number(source.amount), reason: reasonSummary(source.reason), ledgerId },
        });
        return schoolApiOk(result);
    } catch (error) {
        await safeRecordAuditLog({ action, status: "failure", actor: auditActorFromRequest(request, user), target: { type: "school_compute_pool", id: schoolId }, metadata: { schoolId, errorStatus: schoolApiErrorStatus(error) } });
        return schoolApiFailure(error, source.status ? "更新学校算力池状态失败" : "调整学校算力池失败");
    }
}

function canRead(user: Parameters<typeof hasAdminPermission>[0]) {
    return hasAdminPermission(user, "education.manage") || hasAdminPermission(user, "billing.manage");
}

function canManage(user: Parameters<typeof hasAdminPermission>[0]) {
    return hasAdminPermission(user, "education.manage") && hasAdminPermission(user, "billing.manage");
}

function reasonSummary(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
