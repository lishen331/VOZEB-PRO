import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listAdminSchoolComputeLedger } from "@/lib/server/school-compute-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage") && !hasAdminPermission(user, "billing.manage")) return schoolApiError(403, "当前管理员没有查看学校算力流水的职责权限");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(
            await listAdminSchoolComputeLedger(user.id, (await context.params).id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)),
                groupId: params.get("groupId") || undefined,
                orderId: params.get("orderId") || undefined,
                type: params.get("type") || undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校算力流水失败");
    }
}
