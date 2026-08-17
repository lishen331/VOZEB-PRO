import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { CommercialOrderInput, CommercialOrderStatus } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createCommercialOrder, listPlatformCommercialOrders } from "@/lib/server/commercial-order-service";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set<CommercialOrderStatus>(["draft", "assigned", "in_progress", "submitted", "revision_required", "accepted", "cancelled"]);

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status && !statuses.has(status as CommercialOrderStatus)) return schoolApiError(400, "商单状态筛选无效");
    try {
        return schoolApiOk(
            await listPlatformCommercialOrders(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword") || undefined,
                status: status as CommercialOrderStatus | undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取商单列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<CommercialOrderInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const order = await createCommercialOrder(user.id, parsed.data);
        await safeRecordAuditLog({
            action: "admin.commercial-order.create",
            actor: auditActorFromRequest(request, user),
            target: { type: "commercial_order", id: order.id },
            metadata: { status: order.status },
        });
        return schoolApiOk(order);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.commercial-order.create",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            metadata: { errorStatus: errorStatus(error) },
        });
        return schoolApiFailure(error, "创建商单失败");
    }
}

function errorStatus(error: unknown) {
    return error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
}
