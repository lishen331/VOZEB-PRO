import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { reviewCommercialOrder } from "@/lib/server/commercial-order-service";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const orderId = (await context.params).id;
    const parsed = await readJsonBodyResult<{ decision?: unknown; feedback?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data) || (parsed.data.decision !== "revision_required" && parsed.data.decision !== "accepted")) return schoolApiError(400, "验收决定无效");
    try {
        const order = await reviewCommercialOrder(user.id, orderId, {
            decision: parsed.data.decision,
            feedback: typeof parsed.data.feedback === "string" ? parsed.data.feedback : "",
        });
        await safeRecordAuditLog({
            action: `admin.commercial-order.${parsed.data.decision}`,
            actor: auditActorFromRequest(request, user),
            target: { type: "commercial_order", id: orderId },
            metadata: { status: order.status },
        });
        return schoolApiOk(order);
    } catch (error) {
        await safeRecordAuditLog({
            action: `admin.commercial-order.${parsed.data.decision}`,
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "commercial_order", id: orderId },
            metadata: { errorStatus: errorStatus(error) },
        });
        return schoolApiFailure(error, "验收商单失败");
    }
}

function errorStatus(error: unknown) {
    return error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
}
