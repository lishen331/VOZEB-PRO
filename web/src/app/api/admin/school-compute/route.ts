import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolComputePoolStatus } from "@/lib/school-compute-domain";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listAdminSchoolComputePools } from "@/lib/server/school-compute-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage") && !hasAdminPermission(user, "billing.manage")) return schoolApiError(403, "当前管理员没有查看学校算力池的职责权限");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status && !isSchoolComputePoolStatus(status)) return schoolApiError(400, "算力池状态筛选无效");
    try {
        return schoolApiOk(
            await listAdminSchoolComputePools(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)),
                keyword: params.get("keyword") || undefined,
                status: status && isSchoolComputePoolStatus(status) ? status : undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校算力池列表失败");
    }
}
