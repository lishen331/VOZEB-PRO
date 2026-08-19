import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { CommercialOrderInput } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { assignCommercialOrder, cancelCommercialOrder, getPlatformCommercialOrderDetails, updateCommercialOrder } from "@/lib/server/commercial-order-service";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
type PatchBody = Partial<CommercialOrderInput> & { action?: "update" | "assign" | "cancel"; schoolId?: unknown };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    try {
        const params = new URL(request.url).searchParams;
        return schoolApiOk(
            await getPlatformCommercialOrderDetails(user.id, (await context.params).id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取商单失败");
    }
}

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const orderId = (await context.params).id;
    const parsed = await readJsonBodyResult<PatchBody>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    if (parsed.data.action !== undefined && parsed.data.action !== "update" && parsed.data.action !== "assign" && parsed.data.action !== "cancel") return schoolApiError(400, "商单操作无效");
    const action = parsed.data.action || "update";
    if (action === "assign" && (typeof parsed.data.schoolId !== "string" || !parsed.data.schoolId.trim())) return schoolApiError(400, "缺少分配学校");
    try {
        const order =
            action === "assign"
                ? await assignCommercialOrder(user.id, orderId, String(parsed.data.schoolId))
                : action === "cancel"
                  ? await cancelCommercialOrder(user.id, orderId)
                  : await updateCommercialOrder(user.id, orderId, withoutAction(parsed.data));
        await safeRecordAuditLog({
            action: `admin.commercial-order.${action}`,
            actor: auditActorFromRequest(request, user),
            target: { type: "commercial_order", id: orderId },
            metadata: { status: order.status, ...(action === "assign" ? { schoolId: order.assignedSchoolId } : {}) },
        });
        return schoolApiOk(order);
    } catch (error) {
        await safeRecordAuditLog({
            action: `admin.commercial-order.${action}`,
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "commercial_order", id: orderId },
            metadata: { errorStatus: errorStatus(error) },
        });
        return schoolApiFailure(error, action === "assign" ? "分配商单失败" : action === "cancel" ? "取消商单失败" : "更新商单失败");
    }
}

function withoutAction(input: PatchBody): Partial<CommercialOrderInput> {
    const patch = { ...input };
    delete patch.action;
    delete patch.schoolId;
    return patch;
}

function errorStatus(error: unknown) {
    return error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
}
