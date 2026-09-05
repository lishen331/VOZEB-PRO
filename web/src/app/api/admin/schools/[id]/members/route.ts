import { isActivePlatformAdmin } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeSchoolMemberRole, type AdminSchoolMemberQuery, type SchoolMemberRole, type SchoolMembershipStatus } from "@/lib/school-domain";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listSchoolMembersByAdmin } from "@/lib/server/admin-school-member-points-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!isActivePlatformAdmin(user)) return schoolApiError(403, "当前账号没有平台管理员权限");
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

function positiveInteger(value: string | null, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
