import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { SchoolMemberCreateInput } from "@/lib/school-domain";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { createSchoolMembers } from "@/lib/server/school-member-provisioning-service";
import { listSchoolMembers } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    const role = params.get("role");
    const status = params.get("status");
    if (role && role !== "teacher" && role !== "student") return schoolApiError(400, "成员身份筛选无效");
    if (status && status !== "active" && status !== "disabled") return schoolApiError(400, "成员状态筛选无效");
    try {
        return schoolApiOk(
            await listSchoolMembers(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword") || "",
                role: role === "teacher" || role === "student" ? role : undefined,
                status: status === "active" || status === "disabled" ? status : undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校成员失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ rows?: SchoolMemberCreateInput[] }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求参数无效");
    try {
        return schoolApiOk(await createSchoolMembers(user.id, Array.isArray(parsed.data.rows) ? parsed.data.rows : []));
    } catch (error) {
        return schoolApiFailure(error, "创建学校成员失败");
    }
}
