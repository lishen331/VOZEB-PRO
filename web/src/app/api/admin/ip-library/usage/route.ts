import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { listAdminIpUsage } from "@/lib/server/ip-library-admin-service";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAnyAdminPermission(user, ["content.manage", "education.manage"])) return schoolApiError(403, "当前管理员没有 IP 库职责权限");
    const params = new URL(request.url).searchParams;
    const downloadType = params.get("downloadType") || undefined;
    const result = params.get("result") || undefined;
    if (downloadType && downloadType !== "item" && downloadType !== "package") return schoolApiError(400, "下载类型筛选无效");
    if (result && result !== "succeeded" && result !== "failed") return schoolApiError(400, "下载结果筛选无效");
    try {
        return schoolApiOk(
            await listAdminIpUsage(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                ipId: params.get("ipId") || undefined,
                subIpId: params.get("subIpId") || undefined,
                schoolId: params.get("schoolId") || undefined,
                userId: params.get("userId") || undefined,
                downloadType,
                result,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 下载记录失败");
    }
}
